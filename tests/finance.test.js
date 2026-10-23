import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../domain.js';
import { defaultFinanceFilters, financeModel, periods, detailPayments } from '../finance.js';
import { financeFixture } from './finance-fixture.js';
const filters = (extra = {}) => ({ ...defaultFinanceFilters('2026-11-01'), start: '2026-11-05', end: '2026-11-06', scale: 'days', ...extra });

test('Контрольный пример ТЗ: 3703 стоимость, 2703 оплаты без архива', () => {
  const f = financeFixture(), m = financeModel(f.projects, filters());
  assert.equal(m.totalCost, 3703); assert.equal(m.planned, 2703);
  assert.deepEqual(m.columnTotals, [2003, 700]); assert.deepEqual(m.rows.map(r => r.total), [2003, 700]);
  assert.equal(financeModel(f.projects, filters({ projectIds: [f.a.id] })).totalCost, 3003);
});
test('Архив: 3903 стоимость, 2903 оплаты; нет двойного учёта', () => {
  const f = financeFixture(), m = financeModel(f.projects, filters({ includeArchive: true }));
  assert.equal(m.totalCost, 3903); assert.equal(m.planned, 2903);
  f.a.archivedAt = D.now();
  assert.equal(financeModel(f.projects, filters()).totalCost, 700);
  assert.equal(financeModel(f.projects, filters({ includeArchive: true })).totalCost, 3903);
});
test('Paid исключается из оплат, стоимость не меняется', () => {
  const f = financeFixture(); f.delivery.payments[0].status = 'paid'; f.delivery.payments[0].paidDate = '2026-11-05';
  const m = financeModel(f.projects, filters()); assert.equal(m.totalCost, 3703); assert.equal(m.planned, 2203);
});
test('Границы дней, недель и месяцев включительны', () => {
  assert.deepEqual(periods('2026-11-01', '2026-11-10', 'weeks'), [
    { start: '2026-11-01', end: '2026-11-01' }, { start: '2026-11-02', end: '2026-11-08' }, { start: '2026-11-09', end: '2026-11-10' }
  ]);
  assert.deepEqual(periods('2026-12-30', '2027-01-02', 'months'), [{ start: '2026-12-30', end: '2026-12-31' }, { start: '2027-01-01', end: '2027-01-02' }]);
  assert.equal(periods('2024-02-01', '2024-03-01', 'months')[0].end, '2024-02-29');
  assert.equal(periods('9999-12-30', '9999-12-31', 'weeks')[0].end, '9999-12-31');
});
test('За ноябрь суммы дневных, недельных и месячных столбцов равны', () => {
  const f = financeFixture();
  for (const scale of ['days', 'weeks', 'months']) {
    const m = financeModel(f.projects, filters({ start: '2026-11-01', end: '2026-11-30', scale }));
    assert.equal(m.planned, 2703); assert.equal(D.sum(m.columnTotals), 2703); assert.equal(D.sum(m.rows.map(r => r.total)), 2703);
  }
  assert.equal(financeModel(f.projects, filters({ start: '2026-11-02', end: '2026-11-08', scale: 'weeks' })).planned, 2703);
});
test('Фильтр категории влияет на оба показателя, группировка сохраняет итог', () => {
  const f = financeFixture();
  const m = financeModel(f.projects, filters({ categoryIds: ['contract_services'], group: 'categories' }));
  assert.equal(m.totalCost, 500); assert.equal(m.planned, 500);
  const all = financeModel(f.projects, filters({ group: 'categories' }));
  assert.equal(all.planned, 2703); assert.equal(all.totalCost, 3703); assert.equal(D.sum(all.rows.map(r => r.total)), 2703);
});
test('Период не влияет на стоимость, прошедшие planned не исчезают', () => {
  const f = financeFixture(); const m = financeModel(f.projects, filters({ start: '2026-01-01', end: '2026-01-02' }));
  assert.equal(m.totalCost, 3703); assert.equal(m.planned, 0);
  assert.equal(financeModel(f.projects, filters()).planned, 2703);
});
test('Детализация каждой ячейки и итогов совпадает с её суммой', () => {
  const f = financeFixture();
  for (const group of ['projects', 'categories']) {
    const m = financeModel(f.projects, filters({ group }));
    for (const row of m.rows) m.columns.forEach((c, i) => assert.equal(D.sum(detailPayments(m, { ...c, rowId: row.id, group }).map(e => e.payment.amountRub)), row.cells[i]));
    assert.equal(D.sum(detailPayments(m, { start: m.filters.start, end: m.filters.end }).map(e => e.payment.amountRub)), m.planned);
    assert.ok(m.rows.some(r => r.cells.includes(0)));
  }
});
test('Пустой выбор не превращается в выбор всех объектов или категорий', () => {
  const f = financeFixture();
  for (const extra of [{ projectIds: [] }, { categoryIds: [] }]) {
    const m = financeModel(f.projects, filters(extra)); assert.equal(m.totalCost, 0); assert.equal(m.planned, 0); assert.equal(m.resources.length, 0);
  }
});
test('Недораспределение и превышение считаются раздельно, стоимость не добавляется к оплате', () => {
  const f = financeFixture(); f.concrete.unitPriceRub = 2000; f.resourceB.payments[0].amountRub = 1700;
  const m = financeModel(f.projects, filters());
  assert.equal(m.unallocated, 2497); assert.equal(m.excess, 1000); assert.equal(m.mismatches.length, 2);
  assert.equal(m.planned, 3703); assert.equal(m.totalCost, 6200);
});
test('После правки paid или переноса даты платёж исчезает из прежней детализации', () => {
  const f = financeFixture(), selection = { group: 'projects', rowId: f.a.id, start: '2026-11-05', end: '2026-11-05' };
  f.delivery.payments[0].status = 'paid'; f.concrete.payments[1].plannedDate = '2026-11-07';
  assert.deepEqual(detailPayments(financeModel(f.projects, filters()), selection), []);
});
test('Расчёт не изменяет данные, настройки по умолчанию — текущий месяц и недели', () => {
  const f = financeFixture(), before = JSON.stringify(f.projects); financeModel(f.projects, filters()); assert.equal(JSON.stringify(f.projects), before);
  const d = defaultFinanceFilters('2024-02-15'); assert.equal(d.start, '2024-02-01'); assert.equal(d.end, '2024-02-29'); assert.equal(d.scale, 'weeks');
  assert.throws(() => periods('2026-02-30', '2026-03-01', 'days')); assert.throws(() => periods('2026-03-02', '2026-03-01', 'days'));
});
