import { CATEGORIES, addDays, dateValid, today, cost, sum, allocated } from './domain.js';

export function defaultFinanceFilters(date = today()) {
  const start = date.slice(0, 7) + '-01';
  return { start, end: monthEnd(start), scale: 'weeks', group: 'projects', projectIds: null,
    categoryIds: Object.keys(CATEGORIES), includeArchive: false };
}

function monthEnd(date) {
  if (date.slice(0, 7) === '9999-12') return '9999-12-31';
  const d = new Date(date.slice(0, 7) + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function periods(start, end, scale) {
  if (!dateValid(start) || !dateValid(end) || end < start) throw Error('Укажите корректный период: окончание не раньше начала.');
  if (!['days', 'weeks', 'months'].includes(scale)) throw Error('Неизвестный масштаб');
  const result = [];
  let cursor = start;
  while (cursor <= end) {
    let stop = cursor;
    if (scale === 'weeks') {
      const weekday = (new Date(cursor + 'T12:00:00Z').getUTCDay() + 6) % 7;
      const last = Math.min(Date.parse(cursor + 'T12:00:00Z') + (6 - weekday) * 86400000, Date.parse(end + 'T12:00:00Z'));
      stop = new Date(last).toISOString().slice(0, 10);
    } else if (scale === 'months') stop = monthEnd(cursor);
    if (stop > end) stop = end;
    result.push({ start: cursor, end: stop });
    if (stop === end) break;
    cursor = addDays(stop, 1);
  }
  return result;
}

export function financeModel(projects, filters) {
  const columns = periods(filters.start, filters.end, filters.scale);
  const selected = projects.filter(p => (filters.projectIds === null || filters.projectIds.includes(p.id)) &&
    (filters.includeArchive || !p.archivedAt));
  const resources = [];
  function add(p, s, w, r) {
    if (!filters.categoryIds.includes(r.category)) return;
    resources.push({ project: p, stage: s, work: w, resource: r,
      archived: !!(p.archivedAt || s?.archivedAt), path: [p.name, s?.name, w?.name, r.name].filter(Boolean) });
  }
  for (const p of selected) {
    for (const r of p.generalExpenses) add(p, null, null, r);
    for (const s of p.stages) {
      if (s.archivedAt && !filters.includeArchive) continue;
      for (const w of s.works) for (const r of w.resources) add(p, s, w, r);
    }
  }
  const payments = resources.flatMap(entry => entry.resource.payments
    .filter(p => p.status === 'planned' && p.plannedDate >= filters.start && p.plannedDate <= filters.end)
    .map(payment => ({ ...entry, payment })))
    .sort((a, b) => a.payment.plannedDate.localeCompare(b.payment.plannedDate) ||
      a.project.name.localeCompare(b.project.name, 'ru') || a.payment.id.localeCompare(b.payment.id));
  const groups = filters.group === 'projects' ? selected.map(p => ({ id: p.id, name: p.name, archived: !!p.archivedAt }))
    : Object.entries(CATEGORIES).filter(([id]) => filters.categoryIds.includes(id)).map(([id, name]) => ({ id, name }));
  const key = entry => filters.group === 'projects' ? entry.project.id : entry.resource.category;
  const rows = groups.map(group => {
    const matching = payments.filter(p => key(p) === group.id);
    const cells = columns.map(c => sum(matching.filter(e => e.payment.plannedDate >= c.start && e.payment.plannedDate <= c.end).map(e => e.payment.amountRub)));
    return { ...group, cells, total: sum(cells) };
  });
  const mismatches = resources.map(entry => ({ ...entry, cost: cost(entry.resource), allocated: allocated(entry.resource) }))
    .filter(e => e.cost !== e.allocated);
  return { filters, columns, rows, resources, payments, mismatches,
    totalCost: sum(resources.map(e => cost(e.resource))),
    planned: sum(payments.map(e => e.payment.amountRub)),
    columnTotals: columns.map((_, i) => sum(rows.map(r => r.cells[i]))),
    unallocated: sum(mismatches.map(e => Math.max(0, e.cost - e.allocated))),
    excess: sum(mismatches.map(e => Math.max(0, e.allocated - e.cost))) };
}

// Одна и та же выборка используется при открытии ячейки и после изменения платежа.
export function detailPayments(model, selection) {
  return model.payments.filter(entry =>
    (!selection.rowId || (selection.group === 'projects' ? entry.project.id : entry.resource.category) === selection.rowId) &&
    entry.payment.plannedDate >= selection.start && entry.payment.plannedDate <= selection.end);
}
