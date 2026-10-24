import * as D from './domain.js';
import {periods} from './finance.js';
import {SCALES,timeWindows,paginateRows,barGeometry,dayNumber,selectGanttRows,printLayout} from './gantt.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
const types={project:'Объект',stage:'Этап',work:'Работа'};
const tickText=(p,scale)=>scale==='months'?new Date(p.start+'T12:00:00Z').toLocaleDateString('ru-RU',{month:'short',year:'numeric',timeZone:'UTC'}):scale==='days'?D.fmtDate(p.start).slice(0,5):`${D.fmtDate(p.start).slice(0,5)} – ${D.fmtDate(p.end).slice(0,5)}`;
const narrow=(p,window,scale,layout)=>scale!=='days'&&D.duration(p.start,p.end)/D.duration(window.start,window.end)*layout.timeline<Math.max(10,layout.font*1.05);
function makeHeader(rows,window,model,projects,formed,layout){
  const head=el('div',null,'print-head');head.append(el('h1','План строительных работ'));
  const ids=new Set(rows.map(r=>r.projectId));head.append(el('p',projects.filter(p=>ids.has(p.id)).map(p=>p.name).join('; '),'print-object-names'));
  head.append(el('p',`Период листа: ${D.fmtDate(window.start)} – ${D.fmtDate(window.end)} · Масштаб: ${SCALES[model.scale]}`),el('p',`Выбранный период: ${D.fmtDate(model.start)} – ${D.fmtDate(model.end)} · ${layout.paper} · ${layout.font} pt · ${model.detail==='brief'?'Кратко':'Подробно'} · Сформировано: ${formed}`));
  const short=periods(window.start,window.end,model.scale).filter(p=>narrow(p,window,model.scale,layout));
  if(short.length)head.append(el('p','Подписи узких интервалов шкалы: '+short.map(p=>`${D.fmtDate(p.start)} – ${D.fmtDate(p.end)}`).join('; ')));
  return head;
}
function makeAxis(window,scale,layout){
  const line=el('div',null,'print-grid print-axis-row'),left=el('div','Название · начало / окончание · календарные дни','print-label'),axis=el('div',null,'print-axis'),total=D.duration(window.start,window.end);
  for(const p of periods(window.start,window.end,scale)){
    const tick=el('span',narrow(p,window,scale,layout)?'':tickText(p,scale),'print-tick');tick.title=`${D.fmtDate(p.start)} – ${D.fmtDate(p.end)}`;
    if(scale==='days'&&layout.timeline/total<layout.font*25.4/72*2.8+.4){const date=D.fmtDate(p.start);tick.replaceChildren(el('span',date.slice(0,3)),el('span',date.slice(3,5)));tick.classList.add('print-day-wrap');}
    tick.style.left=((dayNumber(p.start)-dayNumber(window.start))/total*100)+'%';tick.style.width=(D.duration(p.start,p.end)/total*100)+'%';axis.append(tick);
  }
  line.append(left,axis);return line;
}
function makeRow(row,window,scale,layout){
  const line=el('div',null,'print-grid print-row print-'+row.type);line.dataset.entityId=row.id;line.dataset.repeated=String(!!row.repeated);
  const left=el('div',null,'print-label');left.style.paddingLeft=(2+row.depth*3)+'mm';
  left.append(el('strong',`${types[row.type]}: ${row.name}${row.repeated?' (продолжение)':''}`),el('span',`${D.fmtDate(row.start)} – ${D.fmtDate(row.end)} · ${row.days} дн.`));
  if(row.status)left.append(el('span','Статус: '+D.WORK_STATUS[row.status]));if(row.archived)left.append(el('span','В АРХИВЕ'));
  const track=el('div',null,'print-track'),geo=barGeometry(row,window.start,window.end);
  if(scale==='days'){
    const weekday=new Date(window.start+'T12:00:00Z').getUTCDay(),length=D.duration(window.start,window.end),offset=(6-weekday+7)%7;
    track.classList.add('print-weekends');track.style.backgroundSize=(7/length*100)+'% 100%';track.style.backgroundPosition=(offset/length*layout.timeline)+'mm 0';
  }
  if(geo){const bar=el('div',null,'print-bar status-'+(row.status||row.type));bar.style.left=geo.left+'%';bar.style.width=geo.width+'%';if(geo.continuesBefore)bar.append(el('span','◀','continues-before'));if(geo.continuesAfter)bar.append(el('span','▶','continues-after'));track.append(bar);}
  const today=D.today();if(today>=window.start&&today<=window.end){const mark=el('div',null,'print-today');mark.style.left=((dayNumber(today)-dayNumber(window.start)+.5)/D.duration(window.start,window.end)*100)+'%';track.append(mark);}
  line.append(left,track);return line;
}
function makeFooter(){const foot=el('div',null,'print-foot');foot.append(el('p','Статусы: Не начата · В работе · Завершена · Приостановлена.'),el('p','◀ / ▶ — продолжение срока; пунктир — сегодня; «В АРХИВЕ» — архив.'),el('p','Страница 1 из 999999','print-page-number'));return foot;}

export async function openPrintPreview(initial,projects,expandAll){
  const focus=document.activeElement,root=el('section',null,'print-preview');root.id='gantt-print';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Предпросмотр печати');
  const controls=el('div',null,'print-controls'),info=el('p'),message=el('p','','print-message'),pages=el('div',null,'print-pages'),advice=el('div',null,'print-advice');advice.hidden=true;
  let closed=false,serial=0,printing=false,collapsed=new Set(initial.collapsed||[]),model=initial;
  const options={paper:'A3',font:10,onlyPeriod:initial.onlyPeriod!==false,detail:initial.detail||'full',excludeCompleted:false};
  const shell=document.querySelector('.shell');shell.inert=true;document.body.classList.add('preview-open');
  function close(){closed=true;serial++;root.remove();shell.inert=false;document.body.classList.remove('preview-open');document.removeEventListener('keydown',keyHandler);const current=focus?.isConnected?focus:[...document.querySelectorAll('[data-gantt-focus]')].find(n=>n.dataset.ganttFocus===focus?.dataset.ganttFocus);current?.focus({preventScroll:true});}
  function select(title,values,value,onChange){const label=el('label',title),input=el('select');input.setAttribute('aria-label',title);for(const[k,v]of Object.entries(values)){const opt=el('option',v);opt.value=k;input.append(opt);}input.value=value;input.onchange=()=>onChange(input.value);label.append(input);return{label,input};}
  function check(title,value,onChange){const label=el('label',null,'check'),input=el('input');input.type='checkbox';input.checked=value;input.onchange=()=>onChange(input.checked);label.append(input,document.createTextNode(title));return{label,input};}
  const paper=select('Бумага',{A3:'А3 — 420 × 297 мм',A4:'А4 — 297 × 210 мм'},options.paper,v=>{options.paper=v;prepare();});
  const font=select('Размер шрифта в печати',Object.fromEntries([9,10,11,12,14].map(n=>[n,n+' pt'])),String(options.font),v=>{options.font=Number(v);prepare();});
  const detail=select('Детализация печати',{full:'Подробно — с работами',brief:'Кратко — объекты и этапы'},options.detail,v=>{options.detail=v;prepare();});
  const period=check('Печатать только работы выбранного периода',options.onlyPeriod,v=>{options.onlyPeriod=v;prepare();});
  const completed=check('Дополнительно скрыть завершённые',false,v=>{options.excludeCompleted=v;prepare();});
  const settings=el('div',null,'print-settings');settings.append(paper.label,font.label,detail.label,period.label,completed.label);
  const print=button('Печатать / Сохранить PDF',()=>{
    if(typeof window.print!=='function'){message.textContent='Системная печать недоступна. Скачайте JSON и передайте его на компьютер для печати.';return;}
    message.textContent=`В системном окне выберите ${options.paper}, альбомную ориентацию, поля 10 мм или сохранение в PDF. Если печать не открылась, передайте JSON на компьютер.`;
    try{window.print();}catch{message.textContent='Не удалось вызвать системную печать. Скачайте JSON и передайте его на компьютер.';}
  });
  const expand=button('Раскрыть всё перед печатью',async()=>{expandAll();collapsed.clear();await prepare();});
  advice.append(el('p','Получилось больше двух листов. Чтобы сосредоточиться на главном, попробуйте:'),button('Краткий вид',()=>{options.detail='brief';detail.input.value='brief';prepare();}),button('Скрыть завершённые',()=>{options.excludeCompleted=true;completed.input.checked=true;prepare();}),button('Выбрать объекты / период',()=>{close();document.querySelector('[aria-label="Гант: с даты"]')?.focus();}));
  controls.append(el('h2','Печать / PDF'),info,settings,el('p','Альбомная ориентация · поля 10 мм. Выбранные бумага и шрифт применяются ко всему документу. На телефоне выбор бумаги и сохранение PDF зависят от системы; при ограничениях передайте JSON на компьютер.'),el('p','Печатается план на момент открытия предпросмотра. После правок откройте его заново. Действуют выбранные в Ганте объекты и статусы.'),expand,print,button('Закрыть предпросмотр',close),message,advice);
  root.append(controls,pages);document.body.append(root);
  function keyHandler(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const list=[...controls.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}}}
  document.addEventListener('keydown',keyHandler);paper.input.focus();
  async function prepare(){
    const run=++serial;printing=true;print.disabled=true;expand.disabled=true;pages.replaceChildren();advice.hidden=true;message.textContent='Подготовка печатных страниц…';
    const layout=printLayout(options.paper,options.font);root.dataset.paper=layout.paper;root.dataset.font=String(layout.font);
    for(const[k,v]of Object.entries({'--sheet-width':layout.width+'mm','--sheet-height':layout.height+'mm','--left-width':layout.left+'mm','--timeline-width':layout.timeline+'mm','--print-font':layout.font+'pt','--axis-height':layout.axisHeight+'mm'}))root.style.setProperty(k,v);
    const currentModel={...initial,...selectGanttRows(initial.sourceRows||initial.allRows,initial.start,initial.end,{...options,collapsed}),detail:options.detail,onlyPeriod:options.onlyPeriod};
    model=currentModel;info.textContent=`Объектов: ${model.projectCount} · исходных строк: ${model.rows.length}`;
    const measure=el('div',null,'print-measure');root.append(measure);
    try{
      await document.fonts.ready;await new Promise(resolve=>setTimeout(resolve,0));if(closed||run!==serial)return;
      const formed=new Date().toLocaleString('ru-RU'),windows=timeWindows(model.start,model.end,model.scale,layout.limits),sheetHeight=layout.height*96/25.4;
      const sizes=new Map();
      function measureRow(row){const item=makeRow(row,windows[0],currentModel.scale,layout);measure.append(item);const height=item.getBoundingClientRect().height;item.remove();return height;}
      for(const row of currentModel.rows){
        const normal=measureRow(row),repeated=row.type==='work'?normal:measureRow({...row,repeated:true});sizes.set(row.id,{normal,repeated});
        if(sizes.size%100===0){message.textContent=`Измерение строк: ${sizes.size} из ${currentModel.rows.length}…`;await new Promise(resolve=>setTimeout(resolve,0));if(closed||run!==serial)return;}
      }
      const rowHeight=row=>sizes.get(row.id)[row.repeated?'repeated':'normal'];
      const foot=makeFooter(),axis=makeAxis(windows[0],currentModel.scale,layout);measure.append(foot,axis);const fixed=foot.getBoundingClientRect().height+axis.getBoundingClientRect().height+3;measure.replaceChildren();
      const headSizes=new Map();function headHeight(rows,window){const key=window.start+'/'+window.end+'/'+[...new Set(rows.map(r=>r.projectId))].sort().join('|');if(headSizes.has(key))return headSizes.get(key);const h=makeHeader(rows,window,currentModel,projects,formed,layout);measure.append(h);const height=h.getBoundingClientRect().height;h.remove();headSizes.set(key,height);return height;}
      let count=0;
      for(const window of windows){
        if(closed||run!==serial)return;
        const chunks=paginateRows(currentModel.rows,rows=>headHeight(rows,window)+fixed+rows.reduce((n,r)=>n+rowHeight(r),0)<=sheetHeight);
        for(let v=0;v<chunks.length;v++){
          const rows=chunks[v],sheet=el('article',null,'print-sheet');sheet.dataset.start=window.start;sheet.dataset.end=window.end;sheet.dataset.vertical=String(v+1);
          sheet.append(makeHeader(rows,window,currentModel,projects,formed,layout),makeAxis(window,currentModel.scale,layout));
          const body=el('div',null,'print-rows');for(const row of rows){const item=makeRow(row,window,currentModel.scale,layout);item.style.minHeight=rowHeight(row)+'px';body.append(item);}sheet.append(body,makeFooter());pages.append(sheet);count++;
        }
        message.textContent=`Подготовлено страниц: ${count}…`;await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(closed||run!==serial)return;
      const sheets=[...pages.children];sheets.forEach((sheet,i)=>sheet.querySelector('.print-page-number').textContent=`Страница ${i+1} из ${sheets.length}`);
      if(sheets.some(s=>s.scrollHeight>s.clientHeight+1))throw Error('Обнаружено переполнение листа. Печать отключена до повторной подготовки.');
      info.textContent=`Объектов: ${currentModel.projectCount} · исходных строк: ${currentModel.rows.length} · страниц: ${sheets.length} · ${layout.paper} · ${layout.font} pt`;
      message.textContent=sheets.length?'Предпросмотр готов. Названия объектов и этапов повторяются на продолжениях.':'Нет строк для печати. Измените детализацию или фильтры; данные плана сохранены.';
      print.disabled=!sheets.length;advice.hidden=sheets.length<=2;
    }catch(e){if(run===serial&&!closed){message.textContent=e.message;pages.replaceChildren();}}
    finally{measure.remove();if(run===serial){printing=false;if(!closed)expand.disabled=false;}}
  }
  await prepare();return{close,get busy(){return printing;}};
}
