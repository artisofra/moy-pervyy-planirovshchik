import{test}from'node:test';import assert from'node:assert/strict';import * as D from'../domain.js';import * as X from'../exchange.js';import{engineeringFixture}from'./engineering-fixture.js';
const state=projects=>({projects,settings:{},deletedProjectMarkers:[]});
test('Каждый защитный предел включителен; +1 запрещён и не изменяет данные',()=>{
 assert.deepEqual(D.LIMITS,{project:100,stage:1000,work:10000,resource:50000,payment:100000,history:50000,ancestor:100000,bytes:20971520});
 for(const key of Object.keys(D.LIMITS)){
  const usage=Object.fromEntries(Object.keys(D.LIMITS).map(k=>[k,0]));usage[key]=D.LIMITS[key];D.checkProtection(usage);const before=structuredClone(usage);usage[key]++;assert.throws(()=>D.checkProtection(usage),{code:'LIMIT'});assert.equal(before[key],D.LIMITS[key]);
 }
});
test('Старое превышение можно уменьшать, но нельзя сохранять неизменным, наращивать или создавать новое',()=>{
 const old=Object.fromEntries(Object.keys(D.LIMITS).map(k=>[k,0]));old.project=110;old.history=50010;
 D.checkProtection({...old,project:109},old);D.checkProtection({...old,project:99},old);
 for(const next of [{...old},{...old,project:111,history:50009},{...old,project:109,payment:100001}])assert.throws(()=>D.checkProtection(next,old),{code:'LIMIT'});
});
test('Реальные 100/101 объектов: строгий импорт, допускается только локальное уменьшение старой базы',()=>{
 const s=state(Array.from({length:102},(_,i)=>D.project('Объект '+i))),next=structuredClone(s);next.projects.pop();
 assert.throws(()=>D.validate(s),{code:'LIMIT'});assert.throws(()=>X.validateFile(D.envelope(s.projects)),/число записей/);D.validate(next,{previous:s});assert.throws(()=>D.validate(next),{code:'LIMIT'});
 next.projects[0].extra=true;assert.throws(()=>D.validate(next,{previous:s}),/Неизвестное поле/);delete next.projects[0].extra;next.projects[0].endDate='2026-02-30';assert.throws(()=>D.validate(next,{previous:s}),/дата/);
});
test('Реальный JSON свыше 20 МиБ отклонён; уменьшение без обрезания истории разрешено',()=>{
 const p=D.project('Большой'),s=state([p]);for(let i=0;i<2800;i++){const r=D.resource(p,'Ресурс '+i);r.comment='Я'.repeat(4000);p.generalExpenses.push(r);}
 assert.ok(D.protectionUsage(s).bytes>D.LIMITS.bytes);assert.throws(()=>D.validate(s),{code:'LIMIT'});const next=structuredClone(s);next.projects[0].generalExpenses.pop();D.validate(next,{previous:s});assert.equal(next.projects[0].history.length,0);assert.equal(s.projects[0].generalExpenses.length,2800);
});
test('Инженерный минимум ТЗ валиден и сохраняется при цикле JSON',()=>{
 const s=engineeringFixture(),usage=D.protectionUsage(s);assert.deepEqual(Object.fromEntries(Object.entries(usage).filter(([k])=>k!=='bytes')),{project:10,stage:100,work:500,resource:2500,payment:5000,history:5000,ancestor:0});assert.ok(usage.bytes<20*1024*1024);D.validate(s);const file=X.parseFile(JSON.stringify(D.envelope(s.projects)));assert.deepEqual(file.projects,s.projects);
});
