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
