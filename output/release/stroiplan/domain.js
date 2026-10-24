import schema from './schema-data.js';
import {validateSchema} from './schema-validator.js';
export const CATEGORIES={materials:'Материалы',labor:'Рабочие',contract_services:'Подрядные работы и услуги',equipment_tools:'Техника и инструмент'};
export const byOrder=items=>[...items].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
export const byCreation=items=>[...items].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
export const nextOrder=items=>items.reduce((max,item)=>Math.max(max,item.sortOrder),-1)+1;
export const WORK_STATUS={not_started:'Не начата',in_progress:'В работе',completed:'Завершена',paused:'Приостановлена'};
export const SUPPLY={not_ordered:'Не заказано',ordered:'Заказано',received:'Получено'};
export const uuid=()=>{
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
export const now=()=>new Date().toISOString();
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function dateValid(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'0001-01-01')return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
export function addDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function duration(a,b){if(!dateValid(a)||!dateValid(b)||b<a)throw Error('Проверьте диапазон дат');return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)+1;}
export const fmtDate=s=>s?s.split('-').reverse().join('.'):'—';
export const rub=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
export function integer(s,max=1e15){if(!/^\d+$/.test(String(s)))throw Error('Введите целое неотрицательное число');const n=Number(s);if(!Number.isSafeInteger(n)||n>max)throw Error('Значение превышает допустимый предел');return n;}
export function quantity(s){s=String(s).trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Количество: положительное число, до двух знаков после запятой');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<1||n>1e8)throw Error('Количество должно быть от 0,01 до 1 000 000');return n;}
export function cost(r){const n=(BigInt(r.quantityHundredths)*BigInt(r.unitPriceRub)+50n)/100n;if(n>1000000000000000n)throw Error('Стоимость превышает предел');return Number(n);}
export function sum(values){let n=0n;for(const v of values)n+=BigInt(v);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Общая сумма превышает безопасный предел');return Number(n);}
export function resources(p,archive=false){return [...p.generalExpenses,...p.stages.filter(s=>archive||!s.archivedAt).flatMap(s=>s.works.flatMap(w=>w.resources))];}
export function total(p,archive=false){return !archive&&p.archivedAt?0:sum(resources(p,archive).map(cost));}
export const allocated=r=>sum(r.payments.map(p=>p.amountRub));
export function base(name=''){const t=now();return{id:uuid(),name,comment:'',createdAt:t,updatedAt:t};}
export function project(name=''){return{...base(name),startDate:today(),endDate:addDays(today(),30),archivedAt:null,revisionId:uuid(),ancestorRevisionIds:[],stages:[],generalExpenses:[],history:[]};}
export function stage(p,name=''){return{...base(name),startDate:p.startDate,endDate:p.endDate,archivedAt:null,sortOrder:nextOrder(p.stages),works:[]};}
export function work(s,name=''){return{...base(name),startDate:s.startDate,endDate:s.endDate,status:'not_started',sortOrder:nextOrder(s.works),resources:[]};}
export function resource(parent,name=''){return{...base(name),category:'materials',quantityHundredths:100,unit:'шт.',unitPriceRub:0,requiredDate:parent.startDate,status:'not_ordered',supplier:'',isOwnEquipment:false,payments:[]};}
export function payment(r,amount){return{...base('Оплата'),amountRub:amount,plannedDate:r.requiredDate,status:'planned',paidDate:null,autoManaged:true};}
export function syncPayments(r){if(r.isOwnEquipment){r.unitPriceRub=0;r.payments=[];return;}const c=cost(r);if(r.payments.length===1&&r.payments[0].autoManaged&&r.payments[0].status==='planned'){if(c)r.payments[0].amountRub=c;else r.payments=[];}else if(!r.payments.length&&c)r.payments=[payment(r,c)];}
export function find(p,id){if(p.id===id)return{entity:p,type:'project',parent:null,path:[p.name],locked:!!p.archivedAt};for(const s of p.stages){if(s.id===id)return{entity:s,type:'stage',parent:p,path:[p.name,s.name],locked:!!(p.archivedAt||s.archivedAt)};for(const w of s.works){if(w.id===id)return{entity:w,type:'work',parent:s,path:[p.name,s.name,w.name],locked:!!(p.archivedAt||s.archivedAt)};for(const r of w.resources){if(r.id===id)return{entity:r,type:'resource',parent:w,path:[p.name,s.name,w.name,r.name],locked:!!(p.archivedAt||s.archivedAt)};for(const pay of r.payments)if(pay.id===id)return{entity:pay,type:'payment',parent:r,path:[p.name,s.name,w.name,r.name,pay.name],locked:!!(p.archivedAt||s.archivedAt)};}}}for(const r of p.generalExpenses){if(r.id===id)return{entity:r,type:'resource',parent:p,path:[p.name,'Общие расходы',r.name],locked:!!p.archivedAt};for(const pay of r.payments)if(pay.id===id)return{entity:pay,type:'payment',parent:r,path:[p.name,'Общие расходы',r.name,pay.name],locked:!!p.archivedAt};}return null;}
function flat(p){const m=new Map();if(!p)return m;const ids=[p.id,...p.stages.flatMap(s=>[s.id,...s.works.flatMap(w=>[w.id,...w.resources.flatMap(r=>[r.id,...r.payments.map(a=>a.id)])])]),...p.generalExpenses.flatMap(r=>[r.id,...r.payments.map(a=>a.id)])];for(const id of ids){const f=find(p,id);const v={};for(const [k,value]of Object.entries(f.entity))if(!['stages','works','resources','payments','generalExpenses','history','revisionId','ancestorRevisionIds','updatedAt'].includes(k))v[k]=value;m.set(id,{...f,value:v,parentId:f.parent?.id});}return m;}
export function record(before,after,actor,action='update'){
 const a=flat(before),b=flat(after),changes=[];
 for(const id of new Set([...a.keys(),...b.keys()])){const old=a.get(id),next=b.get(id);let prev=old?.value??null,newv=next?.value??null;
 if(old&&next){const keys=Object.keys({...prev,...newv}).filter(k=>JSON.stringify(prev[k])!==JSON.stringify(newv[k]));if(old.parentId!==next.parentId){keys.push('path');prev={...prev,path:old.path};newv={...newv,path:next.path};}if(!keys.length)continue;prev=Object.fromEntries(keys.map(k=>[k,prev[k]]));newv=Object.fromEntries(keys.map(k=>[k,newv[k]]));}
 const f=next||old;changes.push({entityType:f.type,entityId:id,path:f.path,before:prev,after:newv});if(next)next.entity.updatedAt=now();}
 if(!changes.length)return false;const t=now();after.history.push({id:uuid(),projectId:after.id,occurredAt:t,actor:{name:actor?.name||'',role:actor?.role||'unspecified'},action,changes});after.updatedAt=t;
 if(before)after.ancestorRevisionIds=[...new Set([...before.ancestorRevisionIds,before.revisionId])];after.revisionId=uuid();return true;
}
export function demo(){const p=project('Пример — Сосны');const month=today().slice(0,7);p.startDate=month+'-01';p.endDate=addDays(month+'-01',27);const s=stage(p,'Фундамент');p.stages.push(s);const w=work(s,'Подготовка основания');s.works.push(w);for(const [category,name,price]of [['materials','Бетон М300',6500],['labor','Бригада',18000],['contract_services','Доставка',5000],['equipment_tools','Свой генератор',0]]){const r=resource(w,name);r.category=category;r.unitPriceRub=price;r.isOwnEquipment=category==='equipment_tools';syncPayments(r);w.resources.push(r);}const r=w.resources[0];r.payments=[{...payment(r,2000),name:'Аванс',status:'paid',paidDate:today(),autoManaged:false},{...payment(r,4500),name:'Остаток',autoManaged:false}];const s2=stage(p,'Стены');p.stages.push(s2);s2.works.push(work(s2,'Кладка стен'));record(null,p,{},'create');return p;}
function fail(path,message){const e=Error(message);e.path=path;throw e;}
export const LIMITS={project:100,stage:1000,work:10000,resource:50000,payment:100000,history:50000,ancestor:100000,bytes:20*1024*1024};
const LIMIT_NAMES={project:'объекты',stage:'этапы',work:'работы',resource:'ресурсы',payment:'платежи',history:'события истории',ancestor:'предки редакций',bytes:'размер полной копии (20 МиБ)'};
export function protectionUsage(state){
 const n={project:state.projects.length,stage:0,work:0,resource:0,payment:0,history:0,ancestor:0};
 const add=r=>{n.resource++;n.payment+=r.payments.length;};
 for(const p of state.projects){n.stage+=p.stages.length;n.history+=p.history.length;n.ancestor+=p.ancestorRevisionIds.length;for(const s of p.stages){n.work+=s.works.length;for(const w of s.works)for(const r of w.resources)add(r);}p.generalExpenses.forEach(add);}
 n.bytes=new TextEncoder().encode(JSON.stringify(envelope(state.projects,state.deletedProjectMarkers,state.settings))).length;return n;
}
export function checkProtection(next,previous=null){
 const excess=Object.keys(LIMITS).filter(k=>next[k]>LIMITS[k]);if(!excess.length)return;
 const reduced=previous&&Object.keys(LIMITS).some(k=>previous[k]>LIMITS[k]&&next[k]<previous[k]);
 if(previous&&reduced&&excess.every(k=>previous[k]>LIMITS[k]&&next[k]<=previous[k]))return;
 const e=Error('Превышен предел: '+excess.map(k=>LIMIT_NAMES[k]).join(', ')+'. Скачайте отдельные объекты и удалите ненужные записи. История автоматически не сокращается.');e.code='LIMIT';throw e;
}
export function validate(state,{previous=null,schemaChecked=false}={}){
 // Количества проверяются суммарно ниже. Остальная схема всегда строгая.
 const file=envelope(state.projects,state.deletedProjectMarkers,state.settings);
 if(!schemaChecked)validateSchema(file,schema,schema,'',{relaxCollectionLimits:true});
 const counts={project:0,stage:0,work:0,resource:0,payment:0,history:0,ancestor:0},ids=new Set();let all=0n,allPayments=0n;
 function check(e,type,path){counts[type]++;if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id)||ids.has(e.id))fail(path,'Некорректный или повторный ID');ids.add(e.id);if(typeof e.name!=='string'||!e.name.trim()||e.name!==e.name.trim()||e.name.length>120)fail('name','Название: от 1 до 120 символов');if(typeof e.comment!=='string'||e.comment.length>4000)fail('comment','Комментарий: до 4000 символов');for(const key of ['createdAt','updatedAt'])if(!e[key]||!Number.isFinite(Date.parse(e[key])))fail(path,'Некорректное время записи');
 if(['project','stage','work'].includes(type)){if(!dateValid(e.startDate)||!dateValid(e.endDate)||e.endDate<e.startDate)fail('endDate','Окончание не раньше начала; укажите корректные даты');}
 if(type==='stage'||type==='work')if(!Number.isSafeInteger(e.sortOrder)||e.sortOrder<0)fail(path,'Некорректный порядок');
 if(type==='project'||type==='stage')if(e.archivedAt!==null&&!Number.isFinite(Date.parse(e.archivedAt)))fail(path,'Некорректная дата архива');
 if(type==='work'&&!WORK_STATUS[e.status])fail('status','Неизвестный статус работы');
 if(type==='resource'){if(!CATEGORIES[e.category]||!SUPPLY[e.status])fail('category','Неизвестная категория или статус');if(!Number.isSafeInteger(e.quantityHundredths)||e.quantityHundredths<1||e.quantityHundredths>1e8)fail('quantity','Количество: от 0,01 до 1 000 000');try{integer(e.unitPriceRub,1e9);}catch(err){fail('unitPriceRub',err.message);}if(!e.unit.trim()||e.unit.length>30)fail('unit','Единица: от 1 до 30 символов');if(e.supplier.length>200)fail('supplier','Исполнитель: до 200 символов');if(!dateValid(e.requiredDate))fail('requiredDate','Укажите корректную дату потребности');if(e.isOwnEquipment&&(e.category!=='equipment_tools'||e.unitPriceRub!==0||e.payments.length))fail('isOwnEquipment','У своей техники цена 0 и нет платежей');all+=BigInt(cost(e));}
 if(type==='payment'){try{integer(e.amountRub);}catch(err){fail('amountRub',err.message);}if(e.amountRub===0)fail('amountRub','Сумма платежа должна быть больше нуля');if(!dateValid(e.plannedDate))fail('plannedDate','Укажите дату оплаты');if(!['planned','paid'].includes(e.status)||(e.status==='paid'?!dateValid(e.paidDate):e.paidDate!==null))fail('paidDate','Проверьте статус и фактическую дату');if(typeof e.autoManaged!=='boolean'||e.autoManaged&&e.status!=='planned')fail(path,'Некорректный автоматический платёж');allPayments+=BigInt(e.amountRub);}}
 const checkEntity=(entity,type)=>{try{check(entity,type,entity.name);}catch(error){error.entityId=entity.id;throw error;}};
 for(const p of state.projects){checkEntity(p,'project');counts.history+=p.history.length;counts.ancestor+=p.ancestorRevisionIds.length;for(const s of p.stages){checkEntity(s,'stage');for(const w of s.works){checkEntity(w,'work');for(const r of w.resources){checkEntity(r,'resource');for(const pay of r.payments)checkEntity(pay,'payment');}}}for(const r of p.generalExpenses){checkEntity(r,'resource');for(const pay of r.payments)checkEntity(pay,'payment');}}
 if(all>BigInt(Number.MAX_SAFE_INTEGER)||allPayments>BigInt(Number.MAX_SAFE_INTEGER))fail('','Общая сумма превышает безопасный предел');
 checkProtection({...counts,bytes:new TextEncoder().encode(JSON.stringify(file)).length},previous?protectionUsage(previous):null);return true;
}
export function envelope(projects,markers=[],actor={}){return{format:'construction-resource-planner',schemaVersion:1,exportId:uuid(),exportKind:'all',exportedAt:now(),exportedBy:{name:actor.name||'',role:actor.role||'unspecified'},currency:'RUB',projects,deletedProjectMarkers:markers};}
