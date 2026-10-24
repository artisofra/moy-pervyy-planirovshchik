import {setupDate,dateValue,setDateValue,dateCaption} from './date-input.js';
import * as D from './domain.js';
import { defaultFinanceFilters, financeModel, detailPayments } from './finance.js';

const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function button(text, action, cls = '') {
  const b = el('button', text, cls); b.type = 'button'; b.onclick = action; return b;
}
function field(title, input) {
  const l = el('label', title); input.setAttribute('aria-label', title); l.append(input); return l;
}
const options = (values, value, change) => {
  const s = el('select');
  for (const [key, text] of Object.entries(values)) { const o = el('option', text); o.value = key; s.append(o); }
  s.value = value; s.onchange = () => change(s.value); return s;
};
const periodTitle = c => c.start === c.end ? dateCaption(c.start) : `${D.fmtDate(c.start)} — ${dateCaption(c.end)}`;

export function createFinanceView(openResource) {
  let filters = defaultFinanceFilters(), model, root, projects;
  let selection = null, mismatchOpen = false, limit = 100, returnFocus, returnKey;
  const dialog = el('dialog', undefined, 'finance-dialog');
  dialog.setAttribute('aria-labelledby', 'finance-dialog-title');
  document.body.append(dialog);
  document.querySelector('#editor').addEventListener('close', () => {
    if (dialog.open) dialog.querySelector('button')?.focus();
  });
  function close() {
    dialog.close(); selection = null; mismatchOpen = false;
    const target = returnFocus?.isConnected ? returnFocus :
      [...root.querySelectorAll('button')].find(b => (b.dataset.financeKey || b.id) === returnKey);
    (target || root).focus();
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });

  function refresh() { render(root, projects); }
  function set(key, value) { filters = { ...filters, [key]: value }; refresh(); }
  function openDetails(context) {
    selection = context; mismatchOpen = false; limit = 100; returnFocus = document.activeElement;
    returnKey = returnFocus.dataset.financeKey || returnFocus.id;
    renderDetails(); dialog.showModal();
  }
  function openMismatch() {
    selection = null; mismatchOpen = true; limit = 100; returnFocus = document.activeElement;
    returnKey = returnFocus.dataset.financeKey || returnFocus.id;
    renderDetails(); dialog.showModal();
  }
  function editResource(entry) {
    const parent = entry.work || entry.project;
    openResource(entry.project, parent, entry.resource);
  }
  function checkbox(text, checked, action) {
    const input = el('input'); input.type = 'checkbox'; input.checked = checked;
    input.onchange = () => action(input.checked);
    const l = field(text, input); l.className = 'check'; return l;
  }

  function render(container, source) {
    root = container; projects = source; root.replaceChildren();
    const header = el('div', undefined, 'page-head'), title = el('div');
    title.append(el('p', 'ФИНАНСОВЫЙ ПЛАН', 'eyebrow'), el('h1', 'Финансы'),
      el('p', 'Стоимость плана и деньги, которые понадобятся по датам оплаты.', 'muted'));
    header.append(title); root.append(header);
    const bar = el('div', undefined, 'toolbar finance-filters');
    for (const [key, title] of [['start', 'Период с'], ['end', 'Период по']]) {
      const input = el('input'); setupDate(input); setDateValue(input, filters[key]);
      input.onchange = () => set(key, dateValue(input)); bar.append(field(title, input));
    }
    bar.append(field('Масштаб', options({ days: 'Дни', weeks: 'Недели', months: 'Месяцы' }, filters.scale, v => set('scale', v))),
      field('Группировка', options({ projects: 'По объектам', categories: 'По категориям' }, filters.group, v => set('group', v))));
    root.append(bar);
    const choices = el('div', undefined, 'finance-choices');
    const objects = el('details'); objects.open = true; objects.append(el('summary', 'Объекты'));
    objects.append(checkbox('Все объекты', filters.projectIds === null, on => set('projectIds', on ? null : [])));
    for (const p of source) {
      if (p.archivedAt && !filters.includeArchive) continue;
      objects.append(checkbox(p.name + (p.archivedAt ? ' · архив' : ''), filters.projectIds === null || filters.projectIds.includes(p.id), on => {
        const ids = new Set(filters.projectIds === null ? source.filter(p => filters.includeArchive || !p.archivedAt).map(p => p.id) : filters.projectIds);
        on ? ids.add(p.id) : ids.delete(p.id); set('projectIds', [...ids]);
      }));
    }
    const categories = el('details'); categories.open = true; categories.append(el('summary', 'Категории'));
    for (const [id, name] of Object.entries(D.CATEGORIES)) categories.append(checkbox(name, filters.categoryIds.includes(id), on => {
      const ids = new Set(filters.categoryIds); on ? ids.add(id) : ids.delete(id); set('categoryIds', [...ids]);
    }));
    choices.append(objects, categories); root.append(choices);
    const active = el('div', undefined, 'toolbar finance-active');
    active.append(checkbox('Включить архив', filters.includeArchive, on => set('includeArchive', on)),
      button('Сбросить фильтры', () => { filters = defaultFinanceFilters(); refresh(); }));
    root.append(active);
    const visibleProjects = source.filter(p => (filters.projectIds === null || filters.projectIds.includes(p.id)) && (filters.includeArchive || !p.archivedAt));
    root.append(el('p', `${filters.includeArchive ? 'Включён архив · ' : ''}Объекты: ${filters.projectIds === null ? 'все доступные' : visibleProjects.map(p => p.name).join(', ') || 'не выбраны'} · Категории: ${filters.categoryIds.map(id => D.CATEGORIES[id]).join(', ') || 'не выбраны'} · Период: ${periodTitle({ start: filters.start, end: filters.end })}`, 'finance-context'));
    if (!D.dateValid(filters.start) || !D.dateValid(filters.end) || filters.start > filters.end) {
      const error = el('p', 'Укажите корректный период: окончание не раньше начала.', 'error'); error.setAttribute('role', 'alert');
      root.append(error); return;
    }
    model = financeModel(source, filters);
    const cards = el('div', undefined, 'finance-kpis');
    const cost = el('section', undefined, 'card');
    cost.append(el('h2', 'Общая плановая стоимость'), el('p', D.rub(model.totalCost), 'cost'), el('p', 'За весь план · независимо от периода и отметок оплаты', 'muted small'));
    const planned = el('section', undefined, 'card');
    const allContext = { group: filters.group, rowId: null, start: filters.start, end: filters.end, title: 'Все планируемые оплаты' };
    const plannedButton = button(D.rub(model.planned), () => openDetails(allContext), 'kpi-amount'); plannedButton.id = 'finance-planned';
    planned.append(el('h2', 'Планируется к оплате'), plannedButton, el('p', 'Только запланированные платежи выбранного периода', 'muted small'));
    cards.append(cost, planned); root.append(cards);
    if (model.mismatches.length) {
      const warning = el('section', undefined, 'warning finance-mismatch');
      const mismatchButton = button('Проверить распределение платежей', openMismatch); mismatchButton.id = 'finance-check-distribution';
      warning.append(el('strong', `Ресурсов с расхождениями: ${model.mismatches.length}`),
        el('p', `Не распределено: ${D.rub(model.unallocated)} · Платежи превышают стоимость: ${D.rub(model.excess)}`),
        mismatchButton); root.append(warning);
    }
    if (!model.resources.length) root.append(el('p', source.length ? 'По заданным фильтрам ресурсов не найдено. Выберите объекты и категории или сбросьте фильтры.' : 'Данных пока нет. Создайте объект и добавьте ресурсы в разделе «Объекты».', 'empty'));
    else if (!model.planned) root.append(el('p', 'В выбранном периоде нет запланированных платежей. Стоимость плана показана отдельно.', 'empty'));
    const scroll = el('div', undefined, 'finance-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Таблица планируемых оплат');
    const table = el('table', undefined, 'finance-table');
    table.append(el('caption', 'Планируется к оплате, ₽ · нажмите сумму для детализации'));
    const thead = el('thead'), tr = el('tr'), first = el('th', filters.group === 'projects' ? 'Объект' : 'Категория'); first.scope = 'col'; tr.append(first);
    for (const c of model.columns) { const th = el('th', periodTitle(c)); th.scope = 'col'; tr.append(th); }
    const th = el('th', 'Итого'); th.scope = 'col'; tr.append(th); thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    for (const row of model.rows) {
      const tr = el('tr'), label = el('th', row.name + (row.archived ? ' · архив' : '')); label.scope = 'row'; tr.append(label);
      model.columns.forEach((c, index) => tr.append(amountCell(row.cells[index], { ...c, group: filters.group, rowId: row.id, title: row.name })));
      tr.append(amountCell(row.total, { ...allContext, rowId: row.id, title: row.name })); tbody.append(tr);
    }
    table.append(tbody); const foot = el('tfoot'), total = el('tr'), label = el('th', 'Итого'); label.scope = 'row'; total.append(label);
    model.columns.forEach((c, i) => total.append(amountCell(model.columnTotals[i], { ...c, group: filters.group, rowId: null, title: 'Все объекты и категории' })));
    total.append(amountCell(model.planned, allContext)); foot.append(total); table.append(foot); scroll.append(table); root.append(scroll);
    if (dialog.open) renderDetails();
  }

  function amountCell(amount, context) {
    const td = el('td'); const b = button(D.rub(amount), () => openDetails(context), 'money-cell');
    b.dataset.financeKey = JSON.stringify([context.group, context.rowId, context.start, context.end]);
    b.setAttribute('aria-label', `${context.title} · ${periodTitle(context)} · ${D.rub(amount)}`); td.append(b); return td;
  }

  function renderDetails() {
    const focused = document.activeElement;
    dialog.replaceChildren(); const box = el('div', undefined, 'finance-detail-body');
    const header = el('div', undefined, 'dialog-head'), title = el('h2', mismatchOpen ? 'Распределение платежей' : selection.title);
    title.id = 'finance-dialog-title'; header.append(title, button('Закрыть', close)); box.append(header);
    if (mismatchOpen) {
      box.append(el('p', `Не распределено: ${D.rub(model.unallocated)} · Платежи превышают стоимость: ${D.rub(model.excess)}`));
      if (!model.mismatches.length) box.append(el('p', 'Все платежи распределены по стоимости ресурсов.'));
      for (const entry of model.mismatches.slice(0, limit)) {
        const card = el('article', undefined, 'finance-payment');
        card.append(el('h3', entry.path.join(' → ')), el('p', `Стоимость: ${D.rub(entry.cost)} · Распределено (включая оплаченные): ${D.rub(entry.allocated)}`),
          el('p', entry.cost > entry.allocated ? 'Не распределено: ' + D.rub(entry.cost - entry.allocated) : 'Превышение: ' + D.rub(entry.allocated - entry.cost)),
          button(entry.archived ? 'Просмотреть ресурс' : 'Открыть ресурс и платежи', () => editResource(entry))); box.append(card);
      }
      if (model.mismatches.length > limit) box.append(button('Показать ещё', () => { limit += 100; renderDetails(); }));
    } else {
      const entries = detailPayments(model, selection);
      box.append(el('p', periodTitle(selection), 'muted'));
      if (!entries.length) box.append(el('p', 'В этой сумме нет запланированных платежей.', 'empty'));
      for (const entry of entries.slice(0, limit)) {
        const card = el('article', undefined, 'finance-payment'); const { project, stage, work, resource, payment } = entry;
        card.append(el('h3', payment.name + ' · ' + D.rub(payment.amountRub)),
          el('p', 'Объект: ' + project.name),
          el('p', 'Этап: ' + (stage?.name || 'Общие расходы')),
          el('p', 'Работа: ' + (work?.name || 'Общие расходы')),
          el('p', 'Ресурс: ' + resource.name),
          el('p', `${D.CATEGORIES[resource.category]} · Получатель: ${resource.supplier || 'Не указан'}`),
          el('p', 'Плановая оплата: ' + D.fmtDate(payment.plannedDate)));
        if (entry.archived) card.append(el('p', 'Архив · только просмотр', 'archive-label'));
        card.append(button(entry.archived ? 'Просмотреть ресурс' : 'Открыть ресурс и платежи', () => editResource(entry))); box.append(card);
      }
      if (entries.length > limit) box.append(button('Показать ещё', () => { limit += 100; renderDetails(); }));
      const total = el('p', 'Итого по всем платежам: ' + D.rub(D.sum(entries.map(e => e.payment.amountRub))), 'detail-total'); total.id = 'detail-total'; box.append(total);
    }
    dialog.append(box);
    if (dialog.open && !document.querySelector('#editor[open]') && !dialog.contains(focused)) dialog.querySelector('button')?.focus();
  }
  return { render };
}
