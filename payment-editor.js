import {setupDate,dateValue,setDateValue,rawDateText,onDateChange} from './date-input.js';
import * as D from './domain.js';

const KEYS=['name','amountRub','plannedDate','status','paidDate','comment'];
const TITLES={name:'Название платежа *',amountRub:'Сумма, ₽ *',plannedDate:'Плановая дата оплаты *',status:'Статус платежа',paidDate:'Фактическая дата оплаты',comment:'Комментарий к платежу'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function createPaymentEditor(box,{resource,locked,onDirty,onError,onSummary}){
  const raw=new Map();let page=0;
  const ordered=()=>D.byCreation(resource().payments);
  function fields(pay){
    if(!raw.has(pay.id))raw.set(pay.id,Object.fromEntries(KEYS.map(k=>[k,String(pay[k]??'')])));
    return raw.get(pay.id);
  }
  function invalid(pay,key,message){const error=Error(message);error.paymentId=pay.id;error.path=key;throw error;}
  function parsed(pay){
    const f=fields(pay),next={...pay,name:f.name.trim(),comment:f.comment.trim(),plannedDate:f.plannedDate,status:f.status,paidDate:f.status==='paid'?f.paidDate:null};
    if(!next.name||next.name.length>120)invalid(pay,'name','Название платежа: от 1 до 120 символов.');
    try{next.amountRub=D.integer(f.amountRub);}catch(e){invalid(pay,'amountRub','Сумма платежа: '+e.message);}
    if(!next.amountRub)invalid(pay,'amountRub','Сумма платежа должна быть больше нуля.');
    if(!D.dateValid(next.plannedDate))invalid(pay,'plannedDate','Укажите корректную плановую дату оплаты.');
    if(!['planned','paid'].includes(next.status))invalid(pay,'status','Выберите статус платежа.');
    if(next.status==='paid'&&!D.dateValid(next.paidDate))invalid(pay,'paidDate','Укажите фактическую дату оплаты.');
    if(next.comment.length>4000)invalid(pay,'comment','Комментарий к платежу: до 4000 символов.');
    return next;
  }
  function read(){const r=resource(),next=r.payments.map(parsed);next.forEach((pay,i)=>Object.assign(r.payments[i],pay));return r.payments;}
  function touch(pay){pay.autoManaged=false;onDirty();}
  function render(){
    const pays=ordered(),ids=new Set(pays.map(p=>p.id));for(const id of raw.keys())if(!ids.has(id))raw.delete(id);
    for(const pay of pays)if(pay.autoManaged)Object.assign(fields(pay),Object.fromEntries(KEYS.map(k=>[k,String(pay[k]??'')])));
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(pays.length/100)-1)));box.replaceChildren();
    const start=page*100,end=Math.min(start+100,pays.length),nav=el('div');nav.className='payment-pages';
    nav.append(el('p',pays.length?`Платежи ${start+1}–${end} из ${pays.length}`:'Платежей пока нет.'));
    function paging(title,target){const b=el('button',title);b.type='button';b.dataset.readonlyAction='true';b.onclick=()=>{page=target;render();box.querySelector('input,button')?.focus();};return b;}
    if(page>0)nav.append(paging('Предыдущие платежи',page-1));
    if(end<pays.length)nav.append(paging('Следующие платежи',page+1));
    box.append(nav);
    for(const pay of pays.slice(start,end)){
      const f=fields(pay),row=el('div'),grid=el('div');row.className='payment';row.dataset.id=pay.id;row.setAttribute('role','group');row.setAttribute('aria-label','Платёж: '+f.name);grid.className='field-grid';
      for(const key of KEYS){
        const input=el(key==='status'?'select':'input'),id=`payment-${pay.id}-${key}`,errorId=id+'-error';
        if(key==='status'){for(const[value,title]of Object.entries({planned:'Запланирован',paid:'Оплачен'})){const option=el('option',title);option.value=value;input.append(option);}}
        else if(key.endsWith('Date'))setupDate(input);else input.type='text';
        input.id=id;input.name=id;input.dataset.key=key;if(key.endsWith('Date'))setDateValue(input,f[key]);else input.value=f[key];input.setAttribute('aria-label',TITLES[key]);input.setAttribute('aria-describedby',errorId);
        input.disabled=locked()||(key==='paidDate'&&f.status!=='paid');if(key==='amountRub')input.inputMode='numeric';
        const label=el('label',TITLES[key]),error=el('span');error.id=errorId;error.className='field-error';label.append(input,error);grid.append(label);
        if(key!=='status')input.addEventListener('input',()=>{touch(pay);f[key]=key.endsWith('Date')?dateValue(input):input.value;onSummary();});
        const changed=()=>{
          if(key==='status'){
            if(input.value==='planned'&&f.status==='paid'&&!confirm('Вернуть в запланированные? Фактическая дата будет очищена.')){input.value=f.status;return;}
            touch(pay);f.status=input.value;f.paidDate=f.status==='paid'?(f.paidDate||D.today()):'';
            const date=row.querySelector('[data-key="paidDate"]');date.disabled=f.status!=='paid';setDateValue(date,f.paidDate);
          }else{touch(pay);f[key]=key.endsWith('Date')?dateValue(input):input.value;}
          try{Object.assign(pay,parsed(pay));error.textContent='';input.removeAttribute('aria-invalid');onSummary();}catch(e){onError(e);}
        };
        if(key.endsWith('Date'))onDateChange(input,changed);else input.addEventListener('change',changed);
      }
      row.append(grid);
      if(!locked()){
        const remove=el('button','Убрать из графика');remove.type='button';remove.className='danger';remove.onclick=()=>{
          if(!confirm('Убрать этот платёж? '+(f.status==='paid'?'Внимание: платёж отмечен оплаченным. ':'')+'Перед удалением можно скачать резервную копию объекта кнопкой выше. Изменение применится после сохранения ресурса.'))return;
          resource().payments=resource().payments.filter(p=>p.id!==pay.id);raw.delete(pay.id);for(const p of resource().payments)p.autoManaged=false;onDirty();render();
        };row.append(remove);
      }
      box.append(row);
    }
    onSummary();
  }
  function reveal(id){const index=ordered().findIndex(p=>p.id===id);if(index<0)return;page=Math.floor(index/100);render();}
  function showError(error){
    if(!error.paymentId)return false;
    reveal(error.paymentId);const id=`payment-${error.paymentId}-${error.path}`,input=document.getElementById(id),message=document.getElementById(id+'-error');
    if(!input)return false;input.setAttribute('aria-invalid','true');message.textContent=error.message;input.focus();return true;
  }
  function total(){return D.sum(ordered().map(pay=>{try{return D.integer(fields(pay).amountRub);}catch{invalid(pay,'amountRub','Проверьте сумму платежа.');}}));}
  function snapshot(){return ordered().map(pay=>({id:pay.id,...Object.fromEntries(Object.entries(fields(pay)).map(([key,value])=>[key,key.endsWith('Date')?rawDateText(value):value])),autoManaged:pay.autoManaged}));}
  return{render,read,reveal,showError,total,snapshot};
}
