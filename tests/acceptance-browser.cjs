const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os');
(async()=>{
 const D=await import('../domain.js'),{engineeringFixture}=await import('./engineering-fixture.js');
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH}),context=await browser.newContext({timezoneId:'Europe/Moscow',acceptDownloads:true});
 // Локальный антивирус изменяет HTML сетевого ответа до CSP. Для проверки именно
 // приложения отдаём неизменённый index из поставки через interception навигации.
 // Скрипты, IndexedDB и прочие сценарии остаются настоящими; офлайн проверяется отдельно.
 const html=await fs.readFile('index.html','utf8');
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort());
 await context.route('http://127.0.0.1:4173/',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 const p=await context.newPage();p.setDefaultTimeout(60000);
 const results=[],errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));p.on('dialog',d=>d.accept());
 const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
 const seed=async state=>{await p.evaluate(async state=>{const S=await import('./storage.js'),db=await S.openDB();await new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(state,'main');t.oncomplete=resolve;t.onabort=reject;});db.close();},state);await p.reload();await p.getByRole('heading',{name:'Объекты',exact:true}).waitFor();};
 const read=()=>p.evaluate(async()=>{const S=await import('./storage.js');return S.read(await S.openDB());});let benchmark;
 try{
  await p.goto('http://127.0.0.1:4173/');await p.getByRole('heading',{name:'Объекты',exact:true}).waitFor();await p.locator('#offline-state').filter({hasText:'Готово к работе без интернета'}).waitFor();
  const large=engineeringFixture();
  await check('Инженерный минимум: реальная загрузка файла, сравнение, применение и полная база',async()=>{
   const file=D.envelope(large.projects),start=Date.now();await p.locator('#plan-file').setInputFiles({name:'engineering.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await p.locator('#apply-import').waitFor();const compareMs=Date.now()-start;await p.locator('#apply-import').click();await p.locator('.files-dialog').waitFor({state:'hidden'});const stored=await read();assert.equal(stored.projects.length,11);assert.deepEqual(stored.projects.slice(1),large.projects);
   benchmark={hardware:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,ramGiB:Math.round(os.totalmem()/1024**3)},browser:await browser.version(),viewport:{width:1280,height:720},device:'Windows desktop, реальный Chrome; это не мобильный замер',counts:D.protectionUsage(large),uiImportCompareMs:compareMs};
  });
  await seed(large);
  await check('Инженерный минимум: пять замеров фильтров, расчётов, импорта и сравнения',async()=>{
   benchmark.samples=await p.evaluate(async state=>{
    const D=await import('./domain.js'),F=await import('./finance.js'),G=await import('./gantt.js'),X=await import('./exchange.js');const text=JSON.stringify(D.envelope(state.projects)),file=JSON.parse(text),out=[];
    for(let i=0;i<5;i++){const sample={},measure=(key,fn)=>{const t=performance.now(),v=fn();sample[key]=Math.round((performance.now()-t)*10)/10;return v;};const filters={...F.defaultFinanceFilters(),categoryIds:['materials'],projectIds:[state.projects[0].id]};measure('financeFilterRecalculateMs',()=>F.financeModel(state.projects,filters));measure('ganttFilterMs',()=>G.buildGantt(state.projects,{...G.defaultGanttFilters(),statusIds:['in_progress']}));measure('historyFilterMs',()=>state.projects.flatMap(p=>p.history).filter(h=>h.actor.role==='foreman').sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)));measure('validateImportMs',()=>X.parseFile(text));measure('compareMs',()=>X.compare(state,file));measure('recordMs',()=>{const before=state.projects[0],next=structuredClone(before);next.comment='Правка';D.record(before,next,state.settings);});out.push(sample);}
    return out;
   },large);
   await fs.writeFile('output/step5-performance.json',JSON.stringify(benchmark,null,2));
   assert.ok(benchmark.uiImportCompareMs<5000,'Полный импорт/сравнение UI '+benchmark.uiImportCompareMs+' мс');
   for(const s of benchmark.samples){assert.ok(s.financeFilterRecalculateMs<1000);assert.ok(s.ganttFilterMs<1000);assert.ok(s.historyFilterMs<1000);assert.ok(s.validateImportMs+s.compareMs<5000);}
  });
  await check('Большие списки истории, финансов и Ганта доступны порциями, суммы полные',async()=>{
   await p.getByRole('button',{name:'История',exact:true}).click();assert.equal(await p.locator('.history-item').count(),100);await p.getByRole('button',{name:'Показать ещё',exact:true}).click();assert.equal(await p.locator('.history-item').count(),200);
   await p.getByRole('button',{name:'Финансы',exact:true}).click();assert.match(await p.locator('.finance-kpis .cost').textContent(),/2.?500.?000/);await p.locator('#finance-planned').click();assert.equal(await p.locator('.finance-dialog .finance-payment').count(),100);assert.match(await p.locator('#detail-total').textContent(),/2.?500.?000/);await p.locator('.finance-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();await p.getByRole('button',{name:'Гант',exact:true}).click();assert.equal(await p.locator('.gantt-grid-row[data-entity-id]').count(),150);
  });
  await check('Все экраны при 360/768/1440 px: доступна навигация, нет общей горизонтальной прокрутки',async()=>{
   for(const width of[360,768,1440]){await p.setViewportSize({width,height:900});for(const name of['Объекты','Финансы','Гант','Архив','История','Настройки']){await p.getByRole('button',{name,exact:true}).click();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' '+width);assert.ok(await p.locator('#main h1').isVisible());}}
   await p.setViewportSize({width:1440,height:900});await p.getByRole('button',{name:'Объекты',exact:true}).click();await p.screenshot({path:'output/step5-desktop.png',fullPage:true});
  });
  await check('Предел 100 объектов: 101-й не записывается, заполненная форма сохраняется',async()=>{
   const state={...large,projects:Array.from({length:100},(_,i)=>D.project('Дом '+i))};await seed(state);await p.getByRole('button',{name:'+ Создать объект'}).click();await p.getByLabel('Название *',{exact:true}).fill('PRIVATE-LIMIT-8192');await p.locator('#submit-form').click();await p.locator('#form-error').filter({hasText:'Превышен предел'}).waitFor();assert.equal(await p.locator('#editor').evaluate(n=>n.open),true);assert.equal(await p.getByLabel('Название *',{exact:true}).inputValue(),'PRIVATE-LIMIT-8192');assert.deepEqual((await read()).projects,state.projects);await p.locator('#editor').getByRole('button',{name:'Отмена',exact:true}).click();
  });
  await check('Предел проверяется транзакционно: уменьшение 102→101 разрешено; равное превышение и stale запрещены',async()=>{
   const state={...large,projects:Array.from({length:102},(_,i)=>D.project('Миграция '+i))};await seed(state);const answer=await p.evaluate(async()=>{const S=await import('./storage.js'),X=await import('./exchange.js'),db=await S.openDB(),old=await S.read(db);let same,stale;try{await S.save(db,old,old.generation);}catch(e){same=e.code;}const next=X.deleteEntity(old,old.projects[0].id,old.projects[0].id);await S.save(db,next,old.generation);try{await S.save(db,next,old.generation);}catch(e){stale=e.code;}const saved=await S.read(db);return{same,stale,count:saved.projects.length,generation:saved.generation,marker:saved.deletedProjectMarkers.length};});assert.deepEqual(answer,{same:'LIMIT',stale:'STALE',count:101,generation:2,marker:1});
  });
  const tree={...large,projects:[D.project('Порционный план')]},obj=tree.projects[0],stage=D.stage(obj,'Этап');obj.stages.push(stage);
  for(let i=0;i<250;i++){const w=D.work(stage,'Работа '+String(i).padStart(3,'0'));w.resources.push(D.resource(w,'Ресурс '+String(i).padStart(3,'0')));stage.works.push(w);obj.generalExpenses.push(D.resource(obj,'Общий '+i));}
  await check('Дерево: 250 работ, ресурсов и общих расходов доступны полностью; поиск охватывает скрытые строки',async()=>{
   await seed(tree);await p.getByRole('button',{name:'Открыть план →',exact:true}).click();assert.equal(await p.locator('.work').count(),100);assert.equal(await p.locator('.work .resource').count(),100);assert.equal(await p.locator('#main > .resource').count(),100);
   for(const value of[200,250]){await p.getByRole('button',{name:/Показать ещё работы/}).click();assert.equal(await p.locator('.work').count(),value);await p.getByRole('button',{name:/Показать ещё ресурсы/}).click();assert.equal(await p.locator('.work .resource').count(),value);await p.getByRole('button',{name:/Показать ещё общие расходы/}).click();assert.equal(await p.locator('#main > .resource').count(),value);}
   const search=p.getByPlaceholder('Этап, работа или ресурс');await search.fill('Ресурс 249');await search.press('Tab');assert.equal(await p.locator('.work').count(),1);assert.equal(await p.locator('.work .resource strong').first().textContent(),'Ресурс 249');assert.equal((await read()).projects[0].stages[0].works.length,250);
  });
  await check('Порции этапов: 101-й этап находится поиском и открывается после Показать ещё',async()=>{
   const s=structuredClone(tree);s.projects[0].stages=Array.from({length:101},(_,i)=>D.stage(obj,'Этап '+i));s.projects[0].stages.forEach((a,i)=>a.sortOrder=i);await seed(s);await p.getByRole('button',{name:'Открыть план →',exact:true}).click();assert.equal(await p.locator('.stage').count(),100);await p.getByRole('button',{name:/Показать ещё этапы/}).click();assert.equal(await p.locator('.stage').count(),101);await p.getByPlaceholder('Этап, работа или ресурс').fill('Этап 100');await p.getByPlaceholder('Этап, работа или ресурс').press('Tab');assert.equal(await p.locator('.stage').count(),1);
  });
  await check('Приватность и CSP: только локальные GET, без содержимого планов и ошибок JavaScript',async()=>{assert.deepEqual(errors,[]);const unexpected=requests.filter(r=>!['http://127.0.0.1:4173'].includes(new URL(r.url).origin)&&!r.url.startsWith('data:')||r.method!=='GET'||r.body);assert.deepEqual(unexpected,[]);assert.ok(requests.every(r=>!r.url.includes('PRIVATE-')));assert.equal(await p.evaluate(()=>document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("worker-src 'self'")),true);});
  await fs.writeFile('output/step5-acceptance-results.json',JSON.stringify({results,benchmark,errors,requestCount:requests.length,networkIsolation:'Только index навигации подан без сетевой модификации локальным антивирусом; попытки внешних запросов запрещены и проверяются отдельно. Офлайн-набор работает без этой подмены.'},null,2));console.log('TOTAL '+results.length);console.log(JSON.stringify(benchmark,null,2));
 }catch(e){await p.screenshot({path:'output/step5-failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
