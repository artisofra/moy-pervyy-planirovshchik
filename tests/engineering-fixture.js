import * as D from '../domain.js';
export function engineeringFixture(){
 const state={generation:1,projects:[],settings:{name:'Проверка',role:'foreman'},deletedProjectMarkers:[],initialized:true,demoId:null};
 for(let pi=0;pi<10;pi++){
  const p=D.project('Объект '+pi);p.startDate=D.today().slice(0,7)+'-01';p.endDate=D.addDays(p.startDate,27);state.projects.push(p);
  for(let si=0;si<10;si++){const s=D.stage(p,'Этап '+si);p.stages.push(s);
   for(let wi=0;wi<5;wi++){const w=D.work(s,'Работа '+si+'/'+wi);w.status=wi%2?'in_progress':'not_started';s.works.push(w);
    for(let ri=0;ri<5;ri++){const r=D.resource(w,'Ресурс '+ri);r.category=Object.keys(D.CATEGORIES)[ri%4];r.unitPriceRub=1000;r.payments=[D.payment(r,300),D.payment(r,700)];r.payments.forEach(a=>a.autoManaged=false);w.resources.push(r);}
   }
  }
  for(let hi=0;hi<500;hi++)p.history.push({id:D.uuid(),projectId:p.id,occurredAt:p.updatedAt,actor:{name:'Проверка',role:'foreman'},action:'update',changes:[{entityType:'project',entityId:p.id,path:[p.name],before:{comment:'Прежний комментарий'},after:{comment:'Новый комментарий'}}]});
 }
 return state;
}
