// Проверка подмножества JSON Schema, используемого нашим форматом 1.
export function validateSchema(value,schema,root=schema,path=''){
 const fail=message=>{const e=Error(`${path||'Файл'}: ${message}`);e.path=path.split('.').at(-1);throw e;};
 if(schema.$ref)return validateSchema(value,root.$defs[schema.$ref.split('/').at(-1)],root,path);
 if(schema.anyOf){for(const choice of schema.anyOf){try{validateSchema(value,choice,root,path);return true;}catch{}}fail('Значение не соответствует допустимому типу');}
 if(schema.const!==undefined&&value!==schema.const)fail('Неизвестное значение');
 if(schema.enum&&!schema.enum.includes(value))fail('Недопустимое значение');
 if(schema.type==='null'&&value!==null)fail('Ожидалось пустое значение');
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Ожидалась запись');
  for(const k of schema.required||[])if(!Object.hasOwn(value,k))fail(`Отсутствует поле ${k}`);
  for(const k of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(k))fail('Недопустимый ключ');if(!Object.hasOwn(schema.properties||{},k)){if(schema.additionalProperties===false)fail(`Неизвестное поле ${k}`);}else validateSchema(value[k],schema.properties[k],root,path?path+'.'+k:k);}
 }
 if(schema.type==='array'){
  if(!Array.isArray(value))fail('Ожидался список');if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)fail('Недопустимое число записей');
  if(schema.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)fail('Повторные значения');
  if(schema.items)value.forEach((v,i)=>validateSchema(v,schema.items,root,path+'.'+i));
 }
 if(schema.type==='string'){
  if(typeof value!=='string')fail('Ожидался текст');if(value.length<(schema.minLength||0)||schema.maxLength!==undefined&&value.length>schema.maxLength)fail('Недопустимая длина текста');
  if(schema.format==='uuid'&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))fail('Неверный идентификатор');
  if(schema.format==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail('Некорректная дата');}
  if(schema.format==='date-time'&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)||!Number.isFinite(Date.parse(value))))fail('Некорректная метка времени UTC');
 }
 if(schema.type==='integer'&&(!Number.isSafeInteger(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))fail('Недопустимое целое число');
 if(schema.type==='boolean'&&typeof value!=='boolean')fail('Ожидалось Да/Нет');
 for(const rule of schema.allOf||[]){let applies=true;try{validateSchema(value,rule.if,root,path);}catch{applies=false;}if(applies)validateSchema(value,rule.then,root,path);}
 // properties/items также применяются в условных схемах без type.
 if(!schema.type&&schema.properties&&value&&typeof value==='object')for(const[k,sub]of Object.entries(schema.properties))if(Object.hasOwn(value,k))validateSchema(value[k],sub,root,path?path+'.'+k:k);
 if(!schema.type&&Array.isArray(value)){if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)fail('Недопустимое число записей');}
 return true;
}
