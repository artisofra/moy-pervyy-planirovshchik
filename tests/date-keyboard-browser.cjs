const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const D=await import('../domain.js'),browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH}),c=await browser.newContext({locale:'ru-RU'}),p=await c.newPage(),results=[],errors=[];
 p.setDefaultTimeout(20000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
 const read=()=>p.evaluate(async()=>{const S=await import('./storage.js');return S.read(await S.openDB());});
 async function typeDate(label,day='11',finish='Tab'){
  const input=p.getByLabel(label,{exact:true});await input.focus();await input.press('ArrowLeft');await input.press('ArrowLeft');await input.press('ArrowLeft');
  await input.evaluate(n=>{window.dateBeingTyped=n;});
  await input.pressSequentially(day,{delay:30});await input.pressSequentially('11',{delay:30});await input.pressSequentially('2026',{delay:60});
  assert.equal(await input.inputValue(),`2026-11-${day}`,label);
  assert.equal(await input.evaluate(n=>n===window.dateBeingTyped&&n===document.activeElement),true,'Date field replaced or lost focus: '+label);
  if(finish){await p.keyboard.press(finish);if(finish==='Tab'&&await input.evaluate(n=>n===document.activeElement))await p.keyboard.press('Tab');}
 }
 async function save(){await p.locator('#submit-form').click();await p.locator('#editor').waitFor({state:'hidden'});}
 async function openPlan(){await p.getByRole('button',{name:'Объекты',exact:true}).click();await p.locator('.card').filter({has:p.getByRole('heading',{name:'Клавиатура',exact:true})}).getByRole('button',{name:'Открыть план →'}).click();}
 try{
  await p.goto('http://127.0.0.1:4173/');await p.getByRole('heading',{name:'Объекты',exact:true}).waitFor();
  const obj=D.project('Клавиатура');obj.startDate='2026-11-01';obj.endDate='2026-11-30';const stage=D.stage(obj,'Этап'),work=D.work(stage,'Работа'),resource=D.resource(work,'Материал');obj.stages=[stage];stage.works=[work];work.resources=[resource];resource.unitPriceRub=100;resource.requiredDate='2026-11-05';resource.payments=[{...D.payment(resource,100),status:'paid',paidDate:'2026-11-06',autoManaged:false}];
  await p.evaluate(async obj=>{const S=await import('./storage.js'),db=await S.openDB(),s=await S.read(db);await S.save(db,{...s,projects:[obj],demoId:null},s.generation);},obj);await p.reload();
  await check('Гант: ручной день/месяц/год в обоих полях, Tab/Enter и сохранение фокуса',async()=>{
   const before=(await read()).projects;await p.getByRole('button',{name:'Гант',exact:true}).click();await typeDate('Гант: с даты','11');await p.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Гант: по дату');await typeDate('Гант: по дату','20','Enter');await p.locator('.gantt-context').filter({hasText:'11.11.2026 — 20.11.2026'}).waitFor();assert.deepEqual((await read()).projects,before);
  });
  await check('Финансы: оба поля периода принимают четыре цифры года; Tab не теряется',async()=>{
   await p.getByRole('button',{name:'Финансы',exact:true}).click();await typeDate('Период с','11');await p.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Период по');await typeDate('Период по','20','Enter');await p.locator('.finance-context').filter({hasText:'11.11.2026 — 20.11.2026'}).waitFor();
  });
  await check('История: оба поля периода принимают ручной год и применяются после ввода',async()=>{
   await p.getByRole('button',{name:'История',exact:true}).click();await typeDate('С даты','11');await p.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='По дату');await typeDate('По дату','20','Enter');await p.locator('.filter-context').filter({hasText:'11.11.2026 — 20.11.2026'}).waitFor();
  });
  await check('Объект: ручной ввод обеих дат, сохранение и повторное открытие базы',async()=>{
   await p.getByRole('button',{name:'Объекты',exact:true}).click();await p.getByRole('button',{name:'+ Создать объект',exact:true}).click();await p.getByLabel('Название *',{exact:true}).fill('Ручной объект');await typeDate('Начало работы *','11');await typeDate('Окончание работы *','20');await save();const obj=(await read()).projects.find(p=>p.name==='Ручной объект');assert.equal(obj.startDate,'2026-11-11');assert.equal(obj.endDate,'2026-11-20');
  });
  await check('Этап: ручные даты сохраняются без сброса года',async()=>{
   await openPlan();await p.getByRole('button',{name:'+ Добавить этап',exact:true}).click();await p.getByLabel('Название *',{exact:true}).fill('Ручной этап');await typeDate('Начало работы *','11');await typeDate('Окончание работы *','20');await save();const s=(await read()).projects[0].stages.find(s=>s.name==='Ручной этап');assert.equal(s.startDate,'2026-11-11');assert.equal(s.endDate,'2026-11-20');
  });
  await check('Работа: ручные даты сохраняются без сброса года',async()=>{
   await p.locator('.stage').first().getByRole('button',{name:'+ Добавить работу',exact:true}).click();await p.getByLabel('Название *',{exact:true}).fill('Ручная работа');await typeDate('Начало работы *','11');await typeDate('Окончание работы *','20');await save();const w=(await read()).projects[0].stages[0].works.find(w=>w.name==='Ручная работа');assert.equal(w.startDate,'2026-11-11');assert.equal(w.endDate,'2026-11-20');
  });
  await check('Ресурс и платежи: дата потребности, плановая и фактическая даты принимают ручной год',async()=>{
   await p.getByRole('button',{name:'Ресурс и платежи',exact:true}).click();await typeDate('Дата потребности *','12');await typeDate('Плановая дата оплаты *','13');await typeDate('Фактическая дата оплаты','14');await save();const r=(await read()).projects[0].stages[0].works[0].resources[0];assert.equal(r.requiredDate,'2026-11-12');assert.equal(r.payments[0].plannedDate,'2026-11-13');assert.equal(r.payments[0].paidDate,'2026-11-14');await p.reload();const after=(await read()).projects[0].stages[0].works[0].resources[0];assert.deepEqual(after,r);
  });
  await check('Выбор готовой даты применяется сразу; смена раздела при наборе не возвращает старый экран',async()=>{
   await p.getByRole('button',{name:'Гант',exact:true}).click();const start=p.getByLabel('Гант: с даты',{exact:true});await start.fill('2026-11-12');await start.dispatchEvent('change');await p.getByLabel('Гант: по дату',{exact:true}).fill('2026-11-20');await p.getByLabel('Гант: по дату',{exact:true}).dispatchEvent('change');await p.locator('.gantt-context').filter({hasText:'12.11.2026 — 20.11.2026'}).waitFor();await typeDate('Гант: с даты','11',null);await p.getByRole('button',{name:'Финансы',exact:true}).click();await p.getByRole('heading',{name:'Финансы',exact:true}).waitFor();await p.getByLabel('Период с',{exact:true}).focus();assert.equal(await p.getByRole('heading',{name:'Диаграмма Ганта',exact:true}).count(),0);await p.screenshot({path:'output/date-keyboard-finance.png',fullPage:true});
  });
  await check('Готовая ручная дата не теряется при нажатии другого фильтра мышью',async()=>{
   await p.getByRole('button',{name:'Гант',exact:true}).click();await typeDate('Гант: с даты','11',null);await p.getByLabel('Включить архив',{exact:true}).check();await p.locator('.gantt-context').filter({hasText:'11.11.2026 — 20.11.2026'}).waitFor();assert.equal(await p.getByLabel('Гант: с даты',{exact:true}).inputValue(),'2026-11-11');
  });
  await check('Незавершённая дата не применяется молча и не стирается до исправления',async()=>{
   const input=p.getByLabel('Гант: с даты',{exact:true});await input.focus();await input.press('ArrowLeft');await input.press('ArrowLeft');await input.press('ArrowLeft');await p.keyboard.press('Backspace');
   for(let i=0;i<6&&await input.evaluate(n=>n===document.activeElement);i++)await p.keyboard.press('Tab');
   await p.locator('.date-entry-error').filter({hasText:'Завершите ввод'}).waitFor();assert.equal(await input.evaluate(n=>n.validity.badInput),true);await typeDate('Гант: с даты','12','Enter');await p.locator('.gantt-context').filter({hasText:'12.11.2026 — 20.11.2026'}).waitFor();assert.equal(await p.locator('.date-entry-error').count(),0);await p.screenshot({path:'output/date-keyboard-gantt.png',fullPage:true});
  });
  assert.deepEqual(errors,[]);await fs.writeFile('output/date-keyboard-results.json',JSON.stringify({browser:await browser.version(),locale:'ru-RU',results,errors},null,2));console.log('TOTAL '+results.length);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
