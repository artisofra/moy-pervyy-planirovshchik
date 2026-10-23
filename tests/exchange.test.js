import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../domain.js';
import * as X from '../exchange.js';
import { financeFixture } from './finance-fixture.js';
function state() { const f = financeFixture(); return { generation: 0, projects: f.projects, settings: { name: 'Получатель', role: 'financier' }, deletedProjectMarkers: [], demoId: null, initialized: true,
  fileMeta: { exportedRevisions: {}, firstChangeAt: null, changeGeneration: 0, fullExport: null, snoozedUntil: null, lastImport: null } }; }
function changed(p, name = 'Правка') { const next = structuredClone(p); next.comment = name; D.record(p, next, { name: 'Прораб', role: 'foreman' }); return next; }
function fileOf(p) { const s = state(); s.projects = [p]; return X.exportFile(s, p.id); }

test('Экспорт и обратное чтение сохраняют всё содержимое, настройки не экспортируются', () => {
  const s = state(), file = X.parseFile(JSON.stringify(X.exportFile(s)));
  assert.deepEqual(file.projects, s.projects); assert.equal(file.exportKind, 'all'); assert.equal(file.fileMeta, undefined); assert.equal(file.settings, undefined);
  const one = X.exportFile(s, s.projects[0].id); assert.equal(one.projects.length, 1); assert.equal(one.exportKind, 'object'); assert.ok(one.projects[0].stages[1].archivedAt);
});
test('Каноническое сравнение не зависит от порядка ключей', () => {
  const s = state(), p = s.projects[0], reversed = Object.fromEntries(Object.entries(p).reverse());
  assert.equal(X.relation(p, reversed), 'same'); assert.equal(X.compare(s, fileOf(reversed))[0].choice, 'skip');
});
test('Одинаковая редакция с другим содержимым запрещает весь файл', () => {
  const s = state(), p = structuredClone(s.projects[0]); p.comment = 'Незаконная правка';
  assert.throws(() => X.compare(s, fileOf(p)), /одинаковая редакция/);
});
test('Новая, устаревшая, параллельная и несвязанная редакции распознаются', () => {
  const s = state(), p = s.projects[0], next = changed(p), branch = changed(p, 'Вторая ветвь');
  assert.equal(X.relation(p, next), 'newer'); assert.equal(X.relation(next, p), 'older'); assert.equal(X.relation(next, branch), 'conflict');
  const unknown = structuredClone(p); unknown.revisionId = D.uuid(); assert.equal(X.relation(next, unknown), 'unrelated');
  assert.equal(X.compare(s, fileOf(next))[0].choice, 'replace');
});
test('Импорт А сохраняет Б и настройки, не создаёт редакцию или события импорта', () => {
  const s = state(), old = structuredClone(s), incoming = changed(s.projects[0]); const f = fileOf(incoming);
  const next = X.prepareImport(s, f, { [incoming.id]: 'replace' });
  assert.deepEqual(next.projects[1], old.projects[1]); assert.deepEqual(next.settings, old.settings); assert.deepEqual(next.projects[0], incoming); assert.deepEqual(s, old);
  assert.equal(X.hasUnexported({ ...next, projects: [incoming] }), false);
  const again = X.prepareImport(next, f, { [incoming.id]: 'skip' }); assert.equal(again.projects.length, 2); assert.deepEqual(again.projects, next.projects);
});
test('Одинаковое название с разными ID добавляется отдельно', () => {
  const s = state(), p = D.project(s.projects[0].name), f = fileOf(p); const rows = X.compare(s, f);
  assert.equal(rows[0].duplicateName, true); const next = X.prepareImport(s, f, { [p.id]: 'add' }); assert.equal(next.projects.length, 3);
});
test('Восстановление полной копии удаляет отсутствующие объекты и пример, merge сохраняет', () => {
  const s = state(); s.demoId = s.projects[1].id;
  const f = X.exportFile({ ...s, projects: [s.projects[0]] });
  assert.equal(X.prepareImport(s, f, {}).projects.length, 2);
  const restored = X.prepareImport(s, f, {}, 'restore'); assert.equal(restored.projects.length, 1); assert.equal(restored.demoId, null); assert.deepEqual(restored.settings, s.settings);
  const empty = X.exportFile({ ...s, projects: [] }); assert.equal(X.prepareImport(s, empty, {}, 'restore').projects.length, 0);
  assert.throws(() => X.prepareImport(s, fileOf(s.projects[0]), {}, 'restore'));
});
test('Отсутствие объекта или отметка удаления в merge не удаляет локальный объект', () => {
  const s = state(), f = X.exportFile({ ...s, projects: [], deletedProjectMarkers: [{ id: s.projects[0].id, name: s.projects[0].name, deletedAt: D.now() }] });
  const next = X.prepareImport(s, f, {}); assert.deepEqual(next.projects, s.projects); assert.equal(next.deletedProjectMarkers.length, 0);
});
test('ID входящего потомка, совпавший с сохраняемым объектом, отклоняет весь результат', () => {
  const s = state(), incoming = D.project('Новый'); const st = D.stage(incoming, 'Этап'); st.id = s.projects[1].id; incoming.stages.push(st);
  const f = fileOf(incoming); assert.throws(() => X.prepareImport(s, f, { [incoming.id]: 'add' }), /повторный ID/i);
});
test('Повреждённый, неизвестный, чрезмерно вложенный JSON и опасные ключи отклоняются', () => {
  for (const text of ['{', 'null', '[]', '{"format":"other"}', '['.repeat(65) + '0' + ']'.repeat(65)]) assert.throws(() => X.parseFile(text));
  const f = X.exportFile(state()); f.schemaVersion = 2; assert.throws(() => X.validateFile(f), /Версия/);
  f.schemaVersion = 1; assert.throws(() => X.parseFile(JSON.stringify(f).replace('"comment":""', '"comment":"","__proto__":{}')), /ключ/);
  assert.throws(() => X.parseFile(' '.repeat(X.MAX_BYTES + 1)), /20 МиБ/);
});
test('Неверные даты, лишние поля, отсутствующие поля и деньги отклоняются до записи', () => {
  for (const change of [p => p.startDate = '2026-02-30', p => p.extra = 1, p => delete p.stages, p => p.createdAt = '2026-02-31T12:00:00Z', p => p.generalExpenses[0].unitPriceRub = -1]) {
    const f = X.exportFile(state()); change(f.projects[0]); assert.throws(() => X.validateFile(f));
  }
});
test('История: чужой объект, повтор события и неверные ссылки отклоняются', () => {
  const s = state(), p = s.projects[0]; D.record(null, p, {}, 'create');
  const f = X.exportFile(s); f.projects[0].history[0].projectId = D.uuid(); assert.throws(() => X.validateFile(f));
  const f2 = X.exportFile(s); f2.projects[0].history.push(structuredClone(f2.projects[0].history[0])); assert.throws(() => X.validateFile(f2), /Повторный/);
  const f3 = X.exportFile(s); f3.projects[0].history[0].changes[0].after.id = D.uuid(); assert.throws(() => X.validateFile(f3), /ссылка/);
});
test('Перемещение работы сравнивается изменением пути, а не удалением и созданием', () => {
  const s = state(), a = s.projects[0], b = structuredClone(a), w = b.stages[0].works.shift(); b.stages[1].works.push(w);
  const diff = X.differences(a, b), row = diff.changes.find(c => c.id === w.id); assert.equal(row.action, 'changed'); assert.ok(row.before.path); assert.ok(row.after.path);
});
test('Сравнение показывает изменения стоимости и не суммирует стоимость с платежами', () => {
  const s = state(), p = s.projects[0], next = structuredClone(p); next.stages[0].works[0].resources[0].unitPriceRub = 2000;
  const diff = X.differences(p, next); assert.equal(diff.beforeCost, 3203); assert.equal(diff.afterCost, 5700);
  assert.ok(diff.changes.some(r => r.after?.costRub === 5000));
});
test('Каскадное удаление этапа сохраняет общие расходы и даёт одно событие истории', () => {
  const s = state(), p = s.projects[0], id = p.stages[0].id, info = X.deletionInfo(p, id);
  assert.ok(info.descendants >= 4); assert.equal(info.paid, 1);
  const next = X.deleteEntity(s, p.id, id); assert.equal(next.projects[0].generalExpenses.length, 1); assert.equal(next.projects[0].stages.length, 1); assert.deepEqual(next.projects[1], s.projects[1]);
  assert.equal(next.projects[0].history.length, 1); assert.equal(next.projects[0].history[0].action, 'delete'); assert.ok(next.projects[0].history[0].changes.some(c => c.entityType === 'payment' && c.after === null));
});
test('Удаление платежа не удаляет ресурс, ресурса — удаляет его платежи', () => {
  const s = state(), p = s.projects[0], r = p.stages[0].works[0].resources[0];
  const n = X.deleteEntity(s, p.id, r.payments[0].id); assert.ok(D.find(n.projects[0], r.id)); assert.equal(D.find(n.projects[0], r.id).entity.payments.length, 1);
  const n2 = X.deleteEntity(s, p.id, r.id); assert.equal(D.find(n2.projects[0], r.id), null); assert.equal(D.find(n2.projects[0], r.payments[1].id), null);
});
test('Удаление объекта оставляет только метку, повторный импорт требует восстановления', () => {
  const s = state(), p = s.projects[0], file = fileOf(p), n = X.deleteEntity(s, p.id, p.id);
  assert.equal(n.projects.length, 1); assert.deepEqual(Object.keys(n.deletedProjectMarkers[0]).sort(), ['deletedAt', 'id', 'name']);
  assert.equal(X.compare(n, file)[0].deletedBefore, true);
  const restored = X.prepareImport(n, file, { [p.id]: 'add' }); assert.equal(restored.projects.length, 2); assert.equal(restored.deletedProjectMarkers.length, 0);
});
test('Метки удаления ограничены 1000, старые удаляются детерминированно', () => {
  const s = state(), p = s.projects[0]; s.deletedProjectMarkers = Array.from({length:1000},(_,i)=>({id:D.uuid(),name:'Старый '+i,deletedAt:new Date(Date.UTC(2020,0,1,0,0,i)).toISOString()}));
  const oldId = s.deletedProjectMarkers[0].id; const n = X.deleteEntity(s, p.id, p.id, '2026-10-23T12:00:00Z'); assert.equal(n.deletedProjectMarkers.length, 1000); assert.ok(!n.deletedProjectMarkers.some(m=>m.id===oldId));
});
test('Экспорт одного объекта снимает индикатор только с его редакции', () => {
  const s = state(), file = X.exportFile(s, s.projects[0].id), n = X.markExport(s, file);
  assert.equal(X.hasUnexported(n), true); assert.equal(X.hasUnexported({...n,projects:[n.projects[0]]}),false);
  assert.equal(n.fileMeta.fullExport,null); assert.equal(s.fileMeta.exportedRevisions[s.projects[0].id],undefined);
});
test('Напоминание: 24 часа, позже, полная выгрузка, новая правка и отдельный объект', () => {
  const s=state(),changedState=structuredClone(s),t='2026-10-20T12:00:00Z';changedState.projects[0]=changed(s.projects[0]);X.markUserChange(s,changedState,t);
  const start=Date.parse(t);assert.equal(X.reminderDue(changedState,start+86400000-1),false);assert.equal(X.reminderDue(changedState,start+86400000),true);
  const one=X.markExport(changedState,X.exportFile(changedState,changedState.projects[0].id),t);assert.equal(X.reminderDue(one,start+86400000),true);
  one.fileMeta.snoozedUntil='2026-10-22T12:00:00Z';assert.equal(X.reminderDue(one,start+86400000),false);
  const full=X.markExport(changedState,X.exportFile(changedState),'2026-10-21T12:00:00Z');assert.equal(X.fullDirty(full),false);assert.equal(X.reminderDue(full,start+86400000*5),false);
  const next=structuredClone(full);next.projects[0]=changed(full.projects[0],'Ещё');X.markUserChange(full,next,'2026-10-21T14:00:00Z');assert.equal(X.reminderDue(next,Date.parse('2026-10-22T12:00:00Z')),true);
});
test('Учебный пример сам по себе не запускает напоминание', () => {
  const p=D.demo(),s={...state(),projects:[p],demoId:p.id};delete s.fileMeta;
  assert.equal(X.reminderDue(s,Date.now()+86400000*30),false);assert.equal(X.hasUnexported(s),false);
});
test('Имена выгрузки безопасны, все редакции и подпись остаются в оболочке', () => {
  const s=state();s.projects[0].name='Дом / "A"';const file=X.exportFile(s,s.projects[0].id),name=X.exportName(file,'локальная',new Date(2026,9,23,15,6));
  assert.match(name,/^plan-/);assert.ok(!/[<>:"/\\|?*]/.test(name));assert.ok(name.endsWith('-2026-10-23-1506.json'));assert.deepEqual(file.exportedBy,s.settings);
});
test('Ошибка файла содержит путь к платежу и понятное имя поля', () => {
  const f=X.exportFile(state());delete f.projects[0].generalExpenses[0].payments[0].plannedDate;
  assert.throws(()=>X.validateFile(f),error=>error.message.includes('Объект «Объект А»')&&error.message.includes('Платёж «Оплата»')&&error.message.includes('Плановая дата оплаты'));
});
test('После удаления объекта последняя загрузка не сохраняет его финансовые детали', () => {
  const s=state(),p=s.projects[0],f=fileOf(changed(p));const imported=X.prepareImport(s,f,{[p.id]:'replace'});
  const removed=X.deleteEntity(imported,p.id,p.id);assert.ok(!removed.fileMeta.lastImport.rows.some(r=>r.id===p.id));assert.equal(removed.fileMeta.exportedRevisions[p.id],undefined);assert.equal(X.hasUnexported(removed),true);
});
