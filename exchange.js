import * as D from './domain.js';
import schema from './schema-data.js';
import { validateSchema } from './schema-validator.js';

export const MAX_BYTES = 20 * 1024 * 1024;
export const RELATIONS = { added: 'Новый объект', same: 'Без изменений', newer: 'Продолжает локальную версию',
  older: 'Устаревшая версия', conflict: 'Параллельные правки', unrelated: 'История версий не связана' };
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function guardTree(root) {
  const pending = [[root, 0]];
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (depth > 64) throw Error('Файл слишком глубоко вложен (более 64 уровней).');
    if (!value || typeof value !== 'object') continue;
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Недопустимый ключ в файле: ' + key);
      pending.push([value[key], depth + 1]);
    }
  }
}
function validateFileData(file, {previous=null}={}) {
  guardTree(file);
  if (file?.format !== 'construction-resource-planner') throw Error('Это не файл плана строительных работ.');
  if (file.schemaVersion !== 1) throw Error('Версия формата не поддерживается. Нужен формат 1 или обновление приложения.');
  validateSchema(file, schema, schema, '', {relaxCollectionLimits:!!previous});
  // Весь исходный файл уже проверен схемой выше; дальше — прикладные правила и суммарные пределы.
  D.validate({ projects: file.projects, deletedProjectMarkers: file.deletedProjectMarkers, settings: file.exportedBy },{previous,schemaChecked:true});
  const ids = new Set();
  for (const project of file.projects) {
    for (const id of flatten(project).keys()) {
      if (ids.has(id)) throw Error('Повторный идентификатор: ' + id); ids.add(id);
    }
    if (project.ancestorRevisionIds.includes(project.revisionId)) throw Error('Редакция объекта не может быть собственным предком: ' + project.name);
    for (const h of project.history) {
      if (ids.has(h.id)) throw Error('Повторный ID события истории'); ids.add(h.id);
      if (h.projectId !== project.id) throw Error('История принадлежит другому объекту: ' + project.name);
      for (const c of h.changes) {
        if (c.before === null && c.after === null) throw Error('Пустое изменение в истории: ' + project.name);
        if (c.before && c.after && canonical(Object.keys(c.before).sort()) !== canonical(Object.keys(c.after).sort())) throw Error('В истории различаются поля прежнего и нового значения: ' + project.name);
        for (const snapshot of [c.before, c.after]) if (snapshot?.id && snapshot.id !== c.entityId) throw Error('Неверная ссылка в истории: ' + project.name);
      }
    }
  }
  // События более раннего объекта не должны совпасть с живой сущностью более позднего.
  const liveIds = file.projects.flatMap(p => [...flatten(p).keys()]);
  const historyIds = new Set(file.projects.flatMap(p => p.history.map(h => h.id)));
  if (liveIds.some(id => historyIds.has(id))) throw Error('ID истории совпадает с ID сущности');
  const markers = new Set();
  for (const m of file.deletedProjectMarkers) {
    if (markers.has(m.id) || ids.has(m.id)) throw Error('Повторная или противоречивая отметка удаления'); markers.add(m.id);
  }
  if (!previous && new TextEncoder().encode(JSON.stringify(file)).length > MAX_BYTES) throw Error('Файл превышает 20 МиБ.');
  return file;
}
export function validateFile(file,options) {
  try { return validateFileData(file,options); }
  catch (error) {
    const match = /^(projects(?:\.[^:]+)?): (.+)$/.exec(error.message);
    if (match) {
      const names = [], types = { projects: 'Объект', stages: 'Этап', works: 'Работа', resources: 'Ресурс', generalExpenses: 'Общий расход', payments: 'Платёж' };
      let node = file, list = null;
      for (const part of match[1].split('.')) {
        if (!node || typeof node !== 'object') break;
        node = node[part];
        if (/^\d+$/.test(part) && types[list] && node?.name) names.push(`${types[list]} «${node.name}»`);
        if (types[part]) list = part;
      }
      if (names.length) error.message = names.join(' → ') + ': ' + match[2];
    } else if (error.entityId && Array.isArray(file?.projects)) {
      for (const p of file.projects) { const found = D.find(p, error.entityId); if (found) { error.message = found.path.join(' → ') + ': ' + error.message; break; } }
    }
    const labels = { plannedDate: '«Плановая дата оплаты»', paidDate: '«Фактическая дата оплаты»', requiredDate: '«Дата потребности»', startDate: '«Начало»', endDate: '«Окончание»', unitPriceRub: '«Цена за единицу»', quantityHundredths: '«Количество»', amountRub: '«Сумма платежа»' };
    for (const [key, label] of Object.entries(labels)) error.message = error.message.replace(new RegExp('\\b' + key + '\\b', 'g'), label);
    throw error;
  }
}
export function parseFile(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw Error('Файл превышает 20 МиБ.');
  // Проверяем глубину до JSON.parse, не считая скобки внутри строк.
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') { if (++depth > 64) throw Error('Файл слишком глубоко вложен.'); }
    else if (char === '}' || char === ']') depth--;
  }
  let file;
  try { file = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw Error('Не удалось прочитать JSON. Файл повреждён или имеет другой формат.'); }
  return validateFile(file);
}
export function relation(local, incoming) {
  if (!local) return 'added';
  if (local.revisionId === incoming.revisionId) {
    if (canonical(local) !== canonical(incoming)) throw Error(`Объект «${incoming.name}»: одинаковая редакция содержит разные данные. Импорт всего файла запрещён.`);
    return 'same';
  }
  const forward = incoming.ancestorRevisionIds.includes(local.revisionId), back = local.ancestorRevisionIds.includes(incoming.revisionId);
  if (forward && back) throw Error('Противоречивая цепочка редакций: ' + incoming.name);
  if (forward) return 'newer'; if (back) return 'older';
  const ancestry = new Set([local.revisionId, ...local.ancestorRevisionIds]);
  return [incoming.revisionId, ...incoming.ancestorRevisionIds].some(id => ancestry.has(id)) ? 'conflict' : 'unrelated';
}
const CHILDREN = ['stages', 'works', 'resources', 'payments', 'generalExpenses', 'history'];
export function flatten(project) {
  const map = new Map();
  function visit(entity, type, path, parentId) {
    const fields = Object.fromEntries(Object.entries(entity).filter(([key]) => ![...CHILDREN, 'updatedAt', 'revisionId', 'ancestorRevisionIds'].includes(key)));
    if (type === 'resource') fields.costRub = D.cost(entity);
    const amount = type === 'resource' ? D.cost(entity) : type === 'payment' ? entity.amountRub : type === 'project' ? D.total(entity, true) :
      type === 'stage' ? D.sum(entity.works.flatMap(w => w.resources.map(D.cost))) : D.sum(entity.resources.map(D.cost));
    map.set(entity.id, { id: entity.id, type, path, parentId, fields, amount });
    for (const stage of entity.stages || []) visit(stage, 'stage', [...path, stage.name], entity.id);
    for (const work of entity.works || []) visit(work, 'work', [...path, work.name], entity.id);
    for (const resource of entity.resources || []) visit(resource, 'resource', [...path, resource.name], entity.id);
    for (const resource of entity.generalExpenses || []) visit(resource, 'resource', [...path, 'Общие расходы', resource.name], entity.id);
    for (const payment of entity.payments || []) visit(payment, 'payment', [...path, payment.name], entity.id);
  }
  if (project) visit(project, 'project', [project.name], null);
  return map;
}
export function differences(local, incoming) {
  const before = flatten(local), after = flatten(incoming), changes = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id), b = after.get(id), row = b || a;
    if (!a || !b) changes.push({ ...row, action: a ? 'deleted' : 'added', before: a?.fields || null, after: b?.fields || null });
    else {
      const keys = Object.keys({ ...a.fields, ...b.fields }).filter(key => canonical(a.fields[key]) !== canonical(b.fields[key]));
      const old = Object.fromEntries(keys.map(k => [k, a.fields[k]])), next = Object.fromEntries(keys.map(k => [k, b.fields[k]]));
      if (a.parentId !== b.parentId) { old.path = a.path; next.path = b.path; }
      if (Object.keys(old).length) changes.push({ ...row, action: 'changed', before: old, after: next });
    }
  }
  return { changes, beforeCost: local ? D.total(local, true) : 0, afterCost: incoming ? D.total(incoming, true) : 0 };
}
export function compare(state, file) {
  validateFile(file);
  return file.projects.map(incoming => {
    const local = state.projects.find(p => p.id === incoming.id), status = relation(local, incoming);
    return { id: incoming.id, name: incoming.name, status, archived: !!incoming.archivedAt,
      deletedBefore: state.deletedProjectMarkers.some(m => m.id === incoming.id),
      duplicateName: state.projects.some(p => p.id !== incoming.id && p.name === incoming.name),
      diff: differences(local, incoming), choice: status === 'added' ? 'add' : status === 'newer' ? 'replace' : 'skip' };
  });
}
function mergeMarkers(markers, projects) {
  const live = new Set(projects.map(p => p.id)), map = new Map();
  for (const m of markers) if (!live.has(m.id) && (!map.has(m.id) || map.get(m.id).deletedAt < m.deletedAt)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt) || a.id.localeCompare(b.id)).slice(-1000);
}
export function prepareImport(state, file, choices, mode = 'merge') {
  const rows = compare(state, file);
  if (mode === 'restore' && file.exportKind !== 'all') throw Error('Полное восстановление доступно только для полной копии.');
  if (!['merge', 'restore'].includes(mode)) throw Error('Неизвестный режим загрузки');
  const next = structuredClone(state);
  next.fileMeta = metadata(state);
  const applied = [];
  if (mode === 'restore') next.projects = structuredClone(file.projects);
  else for (const row of rows) {
    const choice = choices[row.id] || 'skip';
    if (choice === 'skip') continue;
    if (choice !== (row.status === 'added' ? 'add' : 'replace')) throw Error('Недопустимое действие для объекта ' + row.name);
    if (row.status === 'same') continue;
    const incoming = structuredClone(file.projects.find(p => p.id === row.id)), index = next.projects.findIndex(p => p.id === row.id);
    if (index < 0) next.projects.push(incoming); else next.projects[index] = incoming;
    applied.push(row);
  }
  next.deletedProjectMarkers = mode === 'restore' ? structuredClone(file.deletedProjectMarkers) : mergeMarkers([...state.deletedProjectMarkers, ...file.deletedProjectMarkers], next.projects);
  if (!next.projects.some(p => p.id === next.demoId)) next.demoId = null;
  // Проверяем весь конечный набор, включая неизменяемые объекты получателя.
  validateFile(D.envelope(next.projects, next.deletedProjectMarkers, next.settings),{previous:state});
  const meta = metadata(next);
  for (const row of rows) if (mode === 'restore' || row.status === 'same' || applied.some(a => a.id === row.id)) {
    const p = next.projects.find(p => p.id === row.id); if (p) meta.exportedRevisions[p.id] = p.revisionId;
  }
  if (mode === 'restore') meta.exportedRevisions = Object.fromEntries(next.projects.map(p => [p.id, p.revisionId]));
  meta.lastImport = { at: D.now(), exportedAt: file.exportedAt, exportedBy: file.exportedBy, mode,
    rows: mode === 'restore' ? rows : applied,
    removed: mode === 'restore' ? state.projects.filter(p => !next.projects.some(n => n.id === p.id)).map(p => ({ name: p.name, id: p.id, diff: differences(p, null) })) : [] };
  next.fileMeta = meta;
  return next;
}
export function exportFile(state, projectId = null) {
  const projects = projectId ? state.projects.filter(p => p.id === projectId) : state.projects;
  if (projectId && projects.length !== 1) throw Error('Объект больше не существует.');
  const file = D.envelope(structuredClone(projects), projectId ? [] : structuredClone(state.deletedProjectMarkers), state.settings);
  file.exportKind = projectId ? 'object' : 'all'; return validateFile(file);
}
export function exportName(file, suffix = '', date = new Date()) {
  const name = file.exportKind === 'object' ? file.projects[0].name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'object' : 'all';
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `plan-${name}${suffix ? '-' + suffix : ''}-${local}.json`;
}
export function distribution(projects) {
  const rows = projects.flatMap(p => [...flatten(p).values()].filter(e => e.type === 'resource').map(e => ({ path: e.path, cost: e.fields.costRub,
    allocated: D.allocated(D.find(p, e.id).entity) }))).filter(e => e.cost !== e.allocated);
  return { rows, unallocated: D.sum(rows.map(e => Math.max(0, e.cost - e.allocated))), excess: D.sum(rows.map(e => Math.max(0, e.allocated - e.cost))) };
}
export function metadata(state) {
  const prior = state.fileMeta;
  const oldEvents = !prior ? state.projects.flatMap(p => p.id === state.demoId ? p.history.slice(1) : (p.history.length ? p.history : [{ occurredAt: p.createdAt }])) : [];
  const first = oldEvents.map(e => e.occurredAt).sort()[0] || null;
  return { exportedRevisions: {}, firstChangeAt: first, changeGeneration: first ? 1 : 0, fullExport: null, snoozedUntil: null, lastImport: null,
    ...structuredClone(prior || {}) };
}
export function signature(state) { return canonical({ revisions: Object.fromEntries(state.projects.map(p => [p.id, p.revisionId])), markers: state.deletedProjectMarkers }); }
export function markUserChange(before, after, time = D.now()) {
  const meta = metadata(after);
  if (canonical(before.projects) !== canonical(after.projects) || canonical(before.deletedProjectMarkers) !== canonical(after.deletedProjectMarkers)) {
    meta.firstChangeAt ||= metadata(before).firstChangeAt || time; meta.changeGeneration = Math.max(metadata(before).changeGeneration || 0, meta.changeGeneration || 0) + 1;
  }
  after.fileMeta = meta; return after;
}
export function markExport(state, file, time = D.now()) {
  const next = structuredClone(state), meta = metadata(next);
  for (const p of file.projects) meta.exportedRevisions[p.id] = p.revisionId;
  if (file.exportKind === 'all') meta.fullExport = { at: time, signature: signature(state), changeGeneration: meta.changeGeneration };
  next.fileMeta = meta; return next;
}
export function hasUnexported(state) {
  const meta = metadata(state);
  let exportedMarkers = [];
  if (meta.fullExport) { try { exportedMarkers = JSON.parse(meta.fullExport.signature).markers; } catch { /* До первой полной копии меток нет. */ } }
  return canonical(state.deletedProjectMarkers) !== canonical(exportedMarkers) || state.projects.some(p => meta.exportedRevisions[p.id] !== p.revisionId && !(p.id === state.demoId && p.history.length === 1));
}
export function fullDirty(state) { const meta = metadata(state); return meta.fullExport ? meta.fullExport.signature !== signature(state) : !!meta.firstChangeAt; }
export function reminderDue(state, time = Date.now()) {
  const meta = metadata(state); if (!fullDirty(state) || !meta.firstChangeAt) return false;
  if (meta.fullExport && meta.changeGeneration <= meta.fullExport.changeGeneration) return false;
  const from = meta.fullExport?.at || meta.firstChangeAt;
  return time - Date.parse(from) >= 86400000 && (!meta.snoozedUntil || time >= Date.parse(meta.snoozedUntil));
}
export function deletionInfo(project, id) {
  const f = D.find(project, id); if (!f) throw Error('Запись уже удалена.');
  const all = flatten(project), selected = new Set([id]); let changed;
  do { changed = false; for (const row of all.values()) if (selected.has(row.parentId) && !selected.has(row.id)) { selected.add(row.id); changed = true; } } while (changed);
  const rows = [...all.values()].filter(e => selected.has(e.id));
  return { name: f.entity.name, type: f.type, counts: Object.fromEntries(['project', 'stage', 'work', 'resource', 'payment'].map(t => [t, rows.filter(r => r.type === t).length])),
    descendants: rows.length - 1, paid: rows.filter(e => e.type === 'payment' && e.fields.status === 'paid').length };
}
export function deleteEntity(state, projectId, entityId, time = D.now()) {
  const next = structuredClone(state), p = next.projects.find(p => p.id === projectId), original = state.projects.find(p => p.id === projectId);
  if (!p) throw Error('Объект уже удалён.'); const f = D.find(p, entityId); if (!f) throw Error('Запись уже удалена.');
  if (f.type === 'project') {
    next.projects = next.projects.filter(p => p.id !== projectId);
    next.deletedProjectMarkers = mergeMarkers([...next.deletedProjectMarkers, { id: p.id, name: p.name, deletedAt: time }], next.projects);
    if (next.demoId === p.id) next.demoId = null;
    const meta = metadata(next);
    delete meta.exportedRevisions[p.id];
    if (meta.lastImport) {
      meta.lastImport.rows = meta.lastImport.rows.filter(row => row.id !== p.id);
      meta.lastImport.removed = meta.lastImport.removed.filter(row => row.id !== p.id);
    }
    next.fileMeta = meta;
  } else {
    if (f.type === 'stage') p.stages = p.stages.filter(e => e.id !== entityId);
    if (f.type === 'work') f.parent.works = f.parent.works.filter(e => e.id !== entityId);
    if (f.type === 'resource') {
      if (f.parent === p) p.generalExpenses = p.generalExpenses.filter(e => e.id !== entityId);
      else f.parent.resources = f.parent.resources.filter(e => e.id !== entityId);
    }
    if (f.type === 'payment') f.parent.payments = f.parent.payments.filter(e => e.id !== entityId);
    D.record(original, p, state.settings, 'delete');
  }
  D.validate(next,{previous:state}); return next;
}
