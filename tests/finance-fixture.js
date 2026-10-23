import * as D from '../domain.js';
export function financeFixture() {
  function project(name) { const p = D.project(name); p.startDate = '2026-11-01'; p.endDate = '2026-11-30'; return p; }
  function attach(p, name, amount, date, archived = false) {
    const s = D.stage(p, archived ? 'Архивный этап' : 'Активный этап');
    if (archived) s.archivedAt = '2026-10-23T12:00:00.000Z';
    const w = D.work(s, 'Работа'), r = D.resource(w, name); r.unitPriceRub = amount;
    r.payments = [{ ...D.payment(r, amount), plannedDate: date, autoManaged: false }];
    p.stages.push(s); s.works.push(w); w.resources.push(r); return r;
  }
  const a = project('Объект А'), b = project('Объект Б');
  const concrete = attach(a, 'Бетон', 1001, '2026-11-05'); concrete.quantityHundredths = 250;
  concrete.payments = [
    { ...D.payment(concrete, 1000), name: 'Аванс', status: 'paid', paidDate: '2026-11-01', autoManaged: false, plannedDate: '2026-11-01' },
    { ...D.payment(concrete, 1503), name: 'Остаток', autoManaged: false, plannedDate: '2026-11-05' }
  ];
  const own = D.resource(a.stages[0].works[0], 'Свой инструмент'); own.category = 'equipment_tools'; own.isOwnEquipment = true;
  a.stages[0].works[0].resources.push(own);
  const delivery = D.resource(a, 'Доставка'); delivery.category = 'contract_services'; delivery.unitPriceRub = 500;
  delivery.payments = [{ ...D.payment(delivery, 500), plannedDate: '2026-11-05', autoManaged: false }]; a.generalExpenses.push(delivery);
  attach(a, 'Архивный ресурс', 200, '2026-11-05', true);
  const resourceB = attach(b, 'Ресурс Б', 700, '2026-11-06');
  return { projects: [a, b], a, b, concrete, delivery, own, resourceB };
}
