import * as D from '../domain.js';
export function ganttFixture(count=4){
  const a=D.project('Сосны — корпус А'),b=D.project('Берёзы — корпус Б');
  Object.assign(a,{startDate:'2026-11-01',endDate:'2026-11-30'});Object.assign(b,{startDate:'2026-12-01',endDate:'2026-12-31'});
  const s=D.stage(a,'Подготовка и фундамент'),s2=D.stage(a,'Архивный этап');a.stages.push(s,s2);Object.assign(s,{startDate:'2026-11-02',endDate:'2026-11-20'});s2.archivedAt='2026-10-23T10:00:00.000Z';
  for(let i=0;i<count;i++){const w=D.work(s,i===0?'Работа за сроками родителя':i===1?'Длинное русское название: устройство монолитного железобетонного перекрытия с подготовкой опалубки и армированием':`Работа ${String(i+1).padStart(3,'0')}`);Object.assign(w,{startDate:i===0?'2026-10-20':'2026-11-05',endDate:i===0?'2027-01-15':'2026-11-07',status:Object.keys(D.WORK_STATUS)[i%4]});s.works.push(w);}
  const wa=D.work(s2,'Архивная работа');s2.works.push(wa);
  const sb=D.stage(b,'Сети'),wb=D.work(sb,'Наружные сети');b.stages.push(sb);sb.works.push(wb);
  return{projects:[a,b],settings:{name:'',role:'unspecified'},deletedProjectMarkers:[],initialized:true,demoId:null,generation:0};
}
