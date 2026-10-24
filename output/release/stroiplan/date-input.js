import {dateValid,fmtDate} from './domain.js';

export function parseDateText(text){
  const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if(!match)return null;
  const iso=`${match[3]}-${match[2]}-${match[1]}`;
  return dateValid(iso)?iso:null;
}

export const dateCaption=(value,empty='—')=>!value?empty:dateValid(value)?fmtDate(value):'неверная дата';
export const rawDateText=value=>String(value??'').replace(/^invalid:/,'');

export function setupDate(input){
  input.type='date';
  if(input.type==='date')return input;
  input.type='text';input.dataset.dateFallback='true';
  input.placeholder='ДД.ММ.ГГГГ';input.title='Дата в формате ДД.ММ.ГГГГ';
  input.maxLength=10;
  return input;
}

// Invalid text remains in the field and draft; it must never pass ISO validation.
export function dateValue(input){
  if(!input.dataset.dateFallback)return input.value;
  return parseDateText(input.value)||(input.value?'invalid:'+input.value:'');
}
export function setDateValue(input,value){
  value=value??'';
  input.value=input.dataset.dateFallback?(dateValid(value)?fmtDate(value):rawDateText(value)):value;
}

let pointerDown=false,focusTasks=new Set(),watchingPointer=false;
function watchDatePointer(){
  if(!watchingPointer){
    watchingPointer=true;
    const finish=()=>{pointerDown=false;for(const pending of focusTasks)setTimeout(pending,0);focusTasks.clear();};
    document.addEventListener('pointerdown',()=>{pointerDown=true;},true);
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('pointercancel',finish,true);
    window.addEventListener('blur',finish);
  }
}
function afterDateBlur(task){watchDatePointer();if(pointerDown)focusTasks.add(task);else setTimeout(task,0);}

// Native date fields emit change after EACH year digit (0002, 0020, ...).
// Keep the field intact until keyboard editing finishes; calendar changes stay immediate.
export function onDateChange(input,change,{draft=()=>{}}={}){
  let keyboard=false,pending=false;
  // Start tracking before the pointer action that can cause this field to blur.
  watchDatePointer();
  function commit(){
    if(!pending||!input.isConnected)return;
    pending=false;keyboard=false;
    if(input.validity.badInput){
      let hint=input.parentElement.querySelector('.date-entry-error');
      if(!hint){hint=document.createElement('span');hint.className='date-entry-error field-error';hint.setAttribute('role','alert');input.after(hint);}
      hint.textContent='Завершите ввод дня, месяца и года.';return;
    }
    input.parentElement.querySelector('.date-entry-error')?.remove();
    const focused=document.activeElement,label=focused?.getAttribute('aria-label');
    change();
    if(label&&!focused.isConnected&&document.activeElement===document.body){
      [...document.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===label)?.focus();
    }
  }
  input.addEventListener('pointerdown',()=>{keyboard=false;});
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){keyboard=false;if(pending){event.preventDefault();commit();}return;}
    if(!['Tab','Escape'].includes(event.key)&&!event.altKey&&!event.metaKey)keyboard=true;
  });
  input.addEventListener('change',()=>{
    pending=true;
    if(!input.validity.badInput)draft();
    if(!keyboard)commit();else if(document.activeElement!==input)afterDateBlur(()=>{if(document.activeElement!==input)commit();});
  });
  input.addEventListener('blur',()=>afterDateBlur(()=>{if(document.activeElement!==input)commit();}));
}
