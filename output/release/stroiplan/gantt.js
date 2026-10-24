import {WORK_STATUS,today,addDays,dateValid,duration,byOrder} from './domain.js';

export const SCALES={days:'Дни',weeks:'Недели',months:'Месяцы'};
export const dayNumber=date=>Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
const dateAt=n=>new Date(n*86400000).toISOString().slice(0,10);
const ordered=byOrder;
export const defaultGanttFilters=()=>({projectIds:null,statusIds:Object.keys(WORK_STATUS),includeArchive:false,start:'',end:'',scale:'weeks',onlyPeriod:true,detail:'full'});

export function selectGanttRows(source,start,end,{onlyPeriod=true,detail='full',excludeCompleted=false,collapsed=new Set()}={}){
  duration(start,end);if(!['full','brief'].includes(detail))throw Error('Выберите детализацию графика.');
  const keep=new Set(),intersects=r=>r.start<=end&&r.end>=start;
  for(const r of source){
    const eligible=r.type==='work'?!(excludeCompleted&&r.status==='completed'):!r.hasChildren;
    if(eligible&&(!onlyPeriod||intersects(r))){keep.add(r.id);for(const id of r.parentIds)keep.add(id);}
  }
  const allRows=source.filter(r=>keep.has(r.id)&&(detail==='full'||r.type!=='work'));
  return{allRows,rows:allRows.filter(r=>!r.parentIds.some(id=>collapsed.has(id))),projectCount:allRows.filter(r=>r.type==='project').length};
}

export function printLayout(paper='A3',font=10){
  if(!['A3','A4'].includes(paper)||![9,10,11,12,14].includes(font))throw Error('Выберите поддерживаемые бумагу и размер шрифта.');
  const width=paper==='A3'?400:277,height=paper==='A3'?276:189,left=paper==='A3'?100:110,timeline=width-left;
  return{paper,font,width,height,left,timeline,axisHeight:Math.max(12,font*1.3),limits:{days:Math.min(31,Math.max(1,Math.floor(timeline/(font*25.4/72*1.4+.55)))),weeks:Math.min(13,Math.max(1,Math.floor(timeline/(font*1.7)))),months:Math.min(12,Math.max(1,Math.floor(timeline/(font*1.9))))}};
}

export function buildGantt(projects,filters=defaultGanttFilters(),collapsed=new Set()){
  if(!SCALES[filters.scale])throw Error('Выберите масштаб диаграммы.');
  const selected=projects.filter(p=>(filters.includeArchive||!p.archivedAt)&&(filters.projectIds===null||filters.projectIds.includes(p.id)));
  const statuses=filters.statusIds,unfiltered=Object.keys(WORK_STATUS).every(s=>statuses.includes(s));
  const allRows=[],dates=[];
  function row(entity,type,p,parents,archived){return{id:entity.id,projectId:p.id,parentIds:parents,type,depth:parents.length,name:entity.name,start:entity.startDate,end:entity.endDate,days:duration(entity.startDate,entity.endDate),status:type==='work'?entity.status:null,archived,hasChildren:type==='project'?entity.stages.some(s=>filters.includeArchive||!s.archivedAt):type==='stage'?entity.works.length>0:false};}
  for(const p of selected){
    dates.push(p);
    const children=[];
    for(const s of ordered(p.stages).filter(s=>filters.includeArchive||!s.archivedAt)){
      dates.push(s,...s.works);
      const works=ordered(s.works).filter(w=>statuses.includes(w.status));
      if(!unfiltered&&!works.length)continue;
      children.push(row(s,'stage',p,[p.id],!!(p.archivedAt||s.archivedAt)),...works.map(w=>row(w,'work',p,[p.id,s.id],!!(p.archivedAt||s.archivedAt))));
    }
    if(unfiltered||children.length)allRows.push(row(p,'project',p,[],!!p.archivedAt),...children);
  }
  let start=filters.start,end=filters.end;
  const automatic=!start&&!end;
  if(automatic){start=dates.reduce((v,e)=>e.startDate<v?e.startDate:v,dates[0]?.startDate||today());end=dates.reduce((v,e)=>e.endDate>v?e.endDate:v,dates[0]?.endDate||addDays(today(),30));}
  if(!dateValid(start)||!dateValid(end)||end<start)throw Error('Укажите корректный период: окончание не раньше начала.');
  const onlyPeriod=filters.onlyPeriod!==false,detail=filters.detail||'full';
  return{...selectGanttRows(allRows,start,end,{onlyPeriod,detail,collapsed}),sourceRows:allRows,start,end,automatic,scale:filters.scale,onlyPeriod,detail,collapsed:[...collapsed]};
}

export function barGeometry(row,start,end){
  if(row.end<start||row.start>end)return null;
  const length=duration(start,end),left=Math.max(dayNumber(row.start),dayNumber(start))-dayNumber(start);
  const days=Math.min(dayNumber(row.end),dayNumber(end))-Math.max(dayNumber(row.start),dayNumber(start))+1;
  return{left:100*left/length,width:100*days/length,continuesBefore:row.start<start,continuesAfter:row.end>end};
}

export function timeWindows(start,end,scale,limits={days:31,weeks:13,months:12}){
  duration(start,end);if(!SCALES[scale])throw Error('Неизвестный масштаб');
  const count=limits[scale],max={days:31,weeks:13,months:12}[scale];if(!Number.isInteger(count)||count<1||count>max)throw Error('Неверный размер временного окна');
  const windows=[];let cursor=start;
  while(cursor<=end){
    let boundary;
    if(scale==='days')boundary=dateAt(Math.min(dayNumber(end),dayNumber(cursor)+count-1));
    if(scale==='weeks'){
      const weekday=new Date(cursor+'T12:00:00Z').getUTCDay();
      boundary=dateAt(Math.min(dayNumber(end),dayNumber(cursor)+(7-weekday)%7+(count-1)*7));
    }
    if(scale==='months'){
      const d=new Date(cursor.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+count);d.setUTCDate(0);
      boundary=d.getUTCFullYear()>9999?end:d.toISOString().slice(0,10);if(boundary>end)boundary=end;
    }
    windows.push({start:cursor,end:boundary});
    if(boundary===end)break;cursor=addDays(boundary,1);
  }
  return windows;
}

// A parent and its first visible child travel together; continuation pages repeat ancestors.
// The browser supplies actual measured heights through fits(), so wrapping stays authoritative.
export function paginateRows(rows,fits){
  if(!rows.length)return[];
  const byId=new Map(rows.map(r=>[r.id,r])),pages=[];let chunk=[];
  for(let i=0;i<rows.length;){
    const block=[rows[i]];let j=i+1;
    while(j<rows.length&&rows[j].parentIds.includes(block.at(-1).id)){block.push(rows[j++]);}
    if(!fits([...chunk,...block])){
      if(chunk.length)pages.push(chunk);
      chunk=rows[i].parentIds.map(id=>({...byId.get(id),repeated:true}));
      if(!fits([...chunk,...block]))throw Error('Строка не помещается на листе. Проверьте настройки печати и размеры шрифта.');
    }
    chunk.push(...block);i=j;
  }
  if(chunk.length)pages.push(chunk);return pages;
}
