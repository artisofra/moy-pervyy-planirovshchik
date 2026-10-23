import * as D from './domain.js';
import * as X from './exchange.js';

const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (text, fn, cls = '') => { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
const typeNames = { project: 'Объект', stage: 'Этап', work: 'Работа', resource: 'Ресурс', payment: 'Платёж' };
const fields = { name: 'Название', comment: 'Комментарий', startDate: 'Начало', endDate: 'Окончание', archivedAt: 'Архив',
  sortOrder: 'Порядок', status: 'Статус', category: 'Категория', quantityHundredths: 'Количество (сотые единицы)', unit: 'Единица',
  unitPriceRub: 'Цена, ₽', requiredDate: 'Потребность', supplier: 'Исполнитель', isOwnEquipment: 'Своя техника', amountRub: 'Сумма, ₽',
  plannedDate: 'Плановая оплата', paidDate: 'Фактическая оплата', autoManaged: 'Автоматический платёж', costRub: 'Стоимость, ₽', path: 'Путь', createdAt: 'Создано' };
function show(value) { if (value === null || value === undefined) return '—'; if (typeof value === 'boolean') return value ? 'Да' : 'Нет'; return Array.isArray(value) ? value.join(' → ') : D.CATEGORIES[value] || D.WORK_STATUS[value] || D.SUPPLY[value] || ({ paid: 'Оплачен', planned: 'Запланирован' }[value]) || String(value); }
function inputLabel(text, input) { const l = el('label', text); input.setAttribute('aria-label', text); l.append(input); return l; }
function select(values, current, change) { const s = el('select'); for (const [v, text] of Object.entries(values)) { const o = el('option', text); o.value = v; s.append(o); } s.value = current; s.onchange = () => change(s.value); return s; }
function download(file, name) {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = name;
  document.body.append(link); try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

export function createFilesView(api) {
  let state, session = null, busy = false, backFocus, popupKind;
  const business = s => X.canonical({ projects: s.projects, markers: s.deletedProjectMarkers });
  const popup = el('dialog', undefined, 'files-dialog'); popup.setAttribute('aria-labelledby', 'files-title'); document.body.append(popup);
  const fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.id = 'plan-file'; fileInput.hidden = true; document.body.append(fileInput);
  const errorBox = () => popup.querySelector('.file-error');
  const fail = error => { const target = errorBox(); if (target) target.textContent = error.message; else api.note(error.message); };
  function close() { if (busy) return; popup.close(); popup.replaceChildren(); fileInput.value = ''; session = null; popupKind = null; if (backFocus?.isConnected) backFocus.focus(); else document.querySelector('[data-nav="settings"]')?.focus(); }
  popup.addEventListener('cancel', e => { e.preventDefault(); close(); });
  function open(title, kind) {
    if (!popup.open) backFocus = document.activeElement;
    popupKind = kind; popup.replaceChildren(); const head = el('div', undefined, 'dialog-head'), heading = el('h2', title); heading.id = 'files-title'; head.append(heading, button('Закрыть', close)); popup.append(head);
    const error = el('p', undefined, 'error file-error'); error.setAttribute('role', 'alert'); popup.append(error);
    if (!popup.open) popup.showModal();
  }
  function confirmDistribution(issue) {
    if (!issue.rows.length) return Promise.resolve(true);
    return new Promise(resolve => {
      const focus = document.activeElement, warning = el('dialog', undefined, 'files-dialog export-warning');
      const title = el('h2', 'Проверьте распределение платежей'); title.id = 'export-warning-title'; warning.setAttribute('aria-labelledby', title.id);
      warning.append(title, el('p', `Ресурсов с расхождениями: ${issue.rows.length}. Не распределено: ${D.rub(issue.unallocated)}; платежи превышают стоимость: ${D.rub(issue.excess)}.`),
        el('p', 'Незавершённый план разрешено сохранить и передать файлом после явного выбора.'));
      const list = el('div'); list.hidden = true;
      let count = 0;
      function appendRows() {
        const end = Math.min(issue.rows.length, count + 100);
        for (const row of issue.rows.slice(count, end)) list.append(el('p', `${row.path.join(' → ')} · стоимость ${D.rub(row.cost)} · распределено ${D.rub(row.allocated)}`));
        count = end;
        if (count < issue.rows.length) { const more = button('Показать ещё ресурсы', () => { more.remove(); appendRows(); }); list.append(more); }
      }
      appendRows();
      function finish(ok) { warning.close(); warning.remove(); if (focus?.isConnected) focus.focus(); resolve(ok); }
      warning.append(button('Проверить распределение', () => { list.hidden = false; }), list,
        button('Выгрузить как есть', () => finish(true), 'primary'), button('Вернуться', () => finish(false)));
      warning.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      document.body.append(warning); warning.showModal();
    });
  }
  async function exportSnapshot(id = null, suffix = '') {
    if (!(await api.guardForm())) return false;
    const current = await api.read(), file = X.exportFile(current, id), issue = X.distribution(file.projects);
    if (file.projects.some(p => p.id === current.demoId) && !confirm('В файл входит учебный пример. Продолжить выгрузку?')) return false;
    if (!(await confirmDistribution(issue))) return false;
    download(file, X.exportName(file, suffix));
    try { await api.apply(X.markExport(current, file), current.generation, 'metadata'); }
    catch (e) { api.note('Файл подготовлен, но отметку о выгрузке сохранить не удалось. Индикатор изменений не снят. ' + e.message); return true; }
    api.note('Файл подготовлен. Проверьте, что он сохранён.'); return true;
  }
  async function exportSafe(id = null, suffix = '') { try { return await exportSnapshot(id, suffix); } catch (e) { fail(e); return false; } }
  async function openExport() {
    if (!(await api.guardForm())) return;
    try {
      const current = await api.read(); open('Скачать план', 'export');
      popup.append(el('p', 'Полная копия содержит все объекты, архив и историю. Настройки устройства в файл не входят.'), button('Скачать все объекты', () => exportSafe(), 'primary'));
      if (current.projects.length) {
        const s = select(Object.fromEntries(current.projects.map(p => [p.id, p.name + (p.archivedAt ? ' · архив' : '')])), current.projects[0].id, () => {});
        popup.append(inputLabel('Объект для выгрузки', s), button('Скачать выбранный объект', () => exportSafe(s.value)));
      }
    } catch (e) { api.note(e.message); }
  }
  async function chooseFile() { if (!(await api.guardForm())) return; fileInput.value = ''; fileInput.click(); }
  fileInput.onchange = async () => {
    const file = fileInput.files[0]; if (!file) return;
    open('Загрузка плана', 'loading'); popup.append(el('p', 'Проверяем файл…'));
    try {
      if (file.size > X.MAX_BYTES) throw Error('Файл превышает 20 МиБ. Выберите меньший файл.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!popup.open || popupKind !== 'loading') return;
      const incoming = X.parseFile(text), current = await api.read();
      session = { file: incoming, generation: current.generation, business: business(current), rows: X.compare(current, incoming), mode: 'merge', choices: {}, stale: false };
      for (const r of session.rows) session.choices[r.id] = r.choice;
      drawImport();
    } catch (e) { open('Файл не загружен', 'error'); fail(e instanceof TypeError ? Error('Файл должен содержать текст UTF-8 и корректные поля.') : e); popup.append(el('p', 'Текущие данные сохранены без изменений.'), button('Выбрать другой файл', chooseFile)); }
  };
  function diffView(diff) {
    const node = el('div', undefined, 'file-diff');
    node.append(el('p', `Стоимость с архивом: ${D.rub(diff.beforeCost)} → ${D.rub(diff.afterCost)}`));
    for (const [kind, title] of [['added', 'Добавлено'], ['deleted', 'Удалено'], ['changed', 'Изменено']]) {
      const rows = diff.changes.filter(c => c.action === kind), group = el('details');
      group.append(el('summary', `${title}: ${rows.length}`));
      const byId = new Map(rows.map(row => [row.id, row])), descendants = new Map();
      if (kind === 'deleted') for (const row of rows) {
        let parent = row.parentId;
        while (parent && byId.has(parent)) { descendants.set(parent, (descendants.get(parent) || 0) + 1); parent = byId.get(parent).parentId; }
      }
      let shown = 0;
      function appendBatch() {
      const end = Math.min(rows.length, shown + 100);
      for (const row of rows.slice(shown, end)) {
        const line = el('details'); line.append(el('summary', `${typeNames[row.type]} · ${row.path.join(' → ')} · ${D.rub(row.amount)}`));
        for (const key of Object.keys(row.after || row.before || {}).filter(k => k !== 'id' && k !== 'createdAt')) line.append(el('p', `${fields[key] || key}: ${show(row.before?.[key])} → ${show(row.after?.[key])}`, 'small'));
        if (kind === 'deleted') {
          const count = descendants.get(row.id) || 0;
          if (count) line.append(el('p', `Дочерних записей в списке: ${count}. Стоимости родителей и потомков не складываются повторно.`, 'hint'));
        }
        group.append(line);
      }
      shown = end;
      if (shown < rows.length) { const more = button('Показать ещё изменения', () => { more.remove(); appendBatch(); }); group.append(more); }
      }
      appendBatch();
      node.append(group);
    }
    return node;
  }
  function drawImport() {
    const s = session; open('Сравнение перед загрузкой', 'import');
    popup.append(el('p', `Файл подготовлен: ${new Date(s.file.exportedAt).toLocaleString('ru-RU')} · ${s.file.exportedBy.name || 'Автор не указан'} · ${s.file.exportedBy.role === 'foreman' ? 'Прораб' : s.file.exportedBy.role === 'financier' ? 'Финансист' : 'Роль не указана'}`));
    if (s.file.exportKind === 'all') popup.append(inputLabel('Режим загрузки', select({ merge: 'Добавить/обновить объекты из файла', restore: 'Восстановить полную копию' }, s.mode, v => { s.mode = v; drawImport(); })));
    if (s.stale) {
      popup.append(el('p', 'Данные изменились в другой вкладке. Сравнение устарело; применение запрещено.', 'warning'), button('Пересчитать сравнение', async () => {
        try { const current = await api.read(); s.rows = X.compare(current, s.file); s.generation = current.generation; s.business = business(current); s.stale = false; s.choices = Object.fromEntries(s.rows.map(r => [r.id, r.choice])); drawImport(); } catch (e) { fail(e); }
      }));
    }
    if (!s.rows.length) popup.append(el('p', 'Полная копия не содержит объектов. В режиме добавления текущие объекты сохранятся.'));
    for (const row of s.rows) {
      const card = el('article', undefined, 'file-project'); card.append(el('h3', row.name), el('p', X.RELATIONS[row.status] + (row.archived ? ' · архивный объект' : ' · активный объект')));
      if (row.status === 'conflict') card.append(el('p', 'Вы оба изменили копии одного плана. Замена сохранит только выбранную версию; правки второй версии не объединятся.', 'warning'));
      if (row.status === 'unrelated') card.append(el('p', 'История этих версий не связана или неизвестна. Автоматического объединения нет.', 'warning'));
      if (row.deletedBefore) card.append(el('p', 'Объект ранее был удалён на этом устройстве. Для восстановления из файла потребуется подтверждение.', 'warning'));
      if (row.duplicateName) card.append(el('p', 'Уже есть другое кодовое название с таким именем. ID отличаются: объект добавится отдельно.', 'warning'));
      const incoming = s.file.projects.find(p => p.id === row.id), diagnostics = el('details'); diagnostics.append(el('summary', 'Сведения о редакции'), el('p', incoming.revisionId, 'small')); card.append(diagnostics);
      const choices = row.status === 'added' ? { add: 'Добавить объект', skip: 'Пропустить' } : row.status === 'same' ? { skip: 'Без изменений — пропустить' } : { skip: 'Пропустить', replace: 'Заменить этот объект целиком' };
      const choice = select(choices, s.choices[row.id], v => { s.choices[row.id] = v; drawImport(); }); choice.disabled = s.mode === 'restore'; card.append(inputLabel('Действие: ' + row.name, choice));
      if (row.status !== 'added') card.append(button('Скачать локальную версию', () => exportSafe(row.id, 'локальная')));
      card.append(button('Скачать входящую версию', async () => {
        try { const file = D.envelope([structuredClone(incoming)], [], s.file.exportedBy); file.exportKind = 'object'; X.validateFile(file); if (!(await confirmDistribution(X.distribution(file.projects)))) return; download(file, X.exportName(file, 'входящая')); api.note('Входящая версия подготовлена. База не изменена. Проверьте сохранение файла.'); } catch (e) { fail(e); }
      }), diffView(row.diff)); popup.append(card);
    }
    const replacements = s.rows.filter(r => s.mode === 'restore' ? r.status !== 'added' : s.choices[r.id] === 'replace');
    const missing = s.mode === 'restore' ? state.projects.filter(p => !s.file.projects.some(n => n.id === p.id)) : [];
    popup.append(el('p', `Добавлений: ${s.rows.filter(r => r.status === 'added' && (s.mode === 'restore' || s.choices[r.id] === 'add')).length} · замен: ${replacements.filter(r => r.status !== 'same').length} · удалений: ${missing.length}`));
    if (s.mode === 'restore') {
      popup.append(el('p', 'Полное восстановление заменит весь набор объектов и отметок удаления, включая отсутствующие в файле. Настройки устройства сохранятся.', 'warning'));
      if (missing.length) popup.append(el('p', 'Будут удалены: ' + missing.map(p => p.name).join(', ')));
      const input = el('input'); input.id = 'restore-phrase'; input.autocomplete = 'off'; popup.append(inputLabel('Введите ЗАМЕНИТЬ ВСЕ ДАННЫЕ', input));
    }
    popup.append(button('Скачать текущую резервную копию', () => exportSafe()),
      button('Применить загрузку', applyImport, 'primary')); popup.lastChild.id = 'apply-import'; popup.lastChild.disabled = s.stale || busy;
    popup.append(el('p', 'Перед заменой скачайте резервную копию либо явно подтвердите её пропуск в следующем сообщении. При ошибке весь импорт отменяется.', 'hint'));
  }
  async function applyImport() {
    if (busy || !session) return; const s = session;
    try {
      const current = await api.read();
      if (current.generation !== s.generation) { s.stale = true; drawImport(); return; }
      if (s.mode === 'restore' && popup.querySelector('#restore-phrase')?.value !== 'ЗАМЕНИТЬ ВСЕ ДАННЫЕ') throw Error('Введите фразу ЗАМЕНИТЬ ВСЕ ДАННЫЕ точно, чтобы подтвердить полное восстановление.');
      const selected = s.rows.filter(r => s.mode === 'restore' || s.choices[r.id] !== 'skip');
      for (const r of selected) {
        if (r.deletedBefore && !confirm(`Восстановить ранее удалённый объект «${r.name}» из файла?`)) return;
        if (['older', 'conflict', 'unrelated'].includes(r.status) && !confirm(`Заменить локальную версию «${r.name}»? Её правки не объединятся с входящими. Скачайте обе версии перед заменой; нужные правки можно повторить вручную.`)) return;
      }
      if ((s.mode === 'restore' || selected.some(r => r.status !== 'added' && r.status !== 'same')) && !confirm('Вы подготовили резервную копию или осознанно пропускаете её скачивание? ОК — продолжить; Отмена — вернуться и скачать.')) return;
      const next = X.prepareImport(current, s.file, s.choices, s.mode);
      busy = true; popup.querySelector('#apply-import').disabled = true;
      await api.apply(next, s.generation, 'import'); busy = false; close(); api.note('План загружен. Результат последней загрузки доступен в настройках.');
    } catch (e) { busy = false; if (e.code === 'STALE') { s.stale = true; drawImport(); } else { fail(e); const b = popup.querySelector('#apply-import'); if (b) b.disabled = false; } }
  }
  async function remove(projectId, entityId) {
    if (!(await api.guardForm())) return;
    try {
      const current = await api.read(), p = current.projects.find(p => p.id === projectId); if (!p) throw Error('Объект не найден.');
      const info = X.deletionInfo(p, entityId); open('Удалить навсегда', 'delete');
      popup.append(el('h3', info.name), el('p', `Дочерних записей: ${info.descendants}. ` + Object.entries(info.counts).filter(([,n]) => n).map(([t,n]) => `${typeNames[t]}: ${n}`).join(' · ')),
        el('p', 'Запись и её потомки будут удалены вместе. Корзины нет; восстановление возможно из ранее сохранённого файла.', 'warning'),
        button('Скачать резервную копию объекта', () => exportSafe(projectId)));
      let typed, paid;
      if (['project', 'stage'].includes(info.type)) { typed = el('input'); typed.autocomplete = 'off'; popup.append(inputLabel('Введите название для удаления', typed)); }
      if (info.paid) { paid = el('input'); paid.type = 'checkbox'; const l = inputLabel(`Подтверждаю удаление оплаченных платежей: ${info.paid}`, paid); l.className = 'check'; popup.append(l); }
      popup.append(button('Удалить навсегда', async () => {
        if (busy) return;
        try {
          if (typed && typed.value !== info.name) throw Error('Введите точное название записи.');
          if (paid && !paid.checked) throw Error('Подтвердите удаление оплаченных платежей.');
          const fresh = await api.read(); if (business(fresh) !== business(current)) throw Error('Данные изменились. Закройте окно и откройте удаление заново.');
          busy = true; await api.apply(X.deleteEntity(fresh, projectId, entityId), fresh.generation, 'user'); busy = false; close(); api.note('Запись удалена навсегда.');
        } catch (e) { busy = false; fail(e); }
      }, 'danger'));
    } catch (e) { api.note(e.message); }
  }
  function sync(next) {
    state = next;
    if (session && popupKind === 'import' && business(next) === session.business) session.generation = next.generation;
    if (session && popupKind === 'import' && next.generation !== session.generation) {
      session.stale = true; const apply = popup.querySelector('#apply-import'); if (apply) apply.disabled = true;
      if (!popup.querySelector('.comparison-stale')) {
        const warning = el('p', 'Данные изменились. Пересчитайте сравнение перед загрузкой.', 'warning comparison-stale');
        warning.append(button('Пересчитать сравнение', async () => {
          try { const fresh = await api.read(); session.rows = X.compare(fresh, session.file); session.generation = fresh.generation; session.business = business(fresh); session.choices = Object.fromEntries(session.rows.map(r => [r.id, r.choice])); session.stale = false; drawImport(); } catch (e) { fail(e); }
        })); popup.prepend(warning);
      }
    }
    let reminder = document.querySelector('#backup-reminder');
    if (X.reminderDue(next)) {
      if (!reminder) { reminder = el('div', undefined, 'warning'); reminder.id = 'backup-reminder'; document.querySelector('#main').before(reminder); }
      reminder.replaceChildren(el('span', 'Скачайте резервную копию всех объектов. '), button('Скачать все объекты', () => exportSafe()), button('Позже', async () => {
        try { const current = await api.read(), copy = structuredClone(current); copy.fileMeta = X.metadata(copy); copy.fileMeta.snoozedUntil = new Date(Date.now() + 86400000).toISOString(); await api.apply(copy, current.generation, 'metadata'); } catch (e) { api.note(e.message); }
      }));
    } else reminder?.remove();
  }
  function settings(container) {
    const meta = X.metadata(state); container.append(el('h2', 'Файлы и резервные копии'),
      el('p', 'Прораб и финансист редактируют объект по очереди. Скачайте объект, отправьте файл привычным способом, а получатель загрузит его и проверит отличия. Приложение не отправляет файлы и не блокирует другие устройства.'),
      button('Скачать все объекты', () => exportSafe()), button('Загрузить план', chooseFile),
      el('p', 'Последняя подготовка полной копии: ' + (meta.fullExport ? new Date(meta.fullExport.at).toLocaleString('ru-RU') : 'ещё не выполнялась')),
      el('p', X.fullDirty(state) ? 'Есть изменения после полной выгрузки.' : 'Изменений после полной выгрузки нет.'));
    container.append(el('p', 'Проверьте сохранение JSON-файла на устройстве. Очистка данных сайта может удалить план; копия внутри того же браузера не заменяет внешний файл. JSON не зашифрован.', 'hint'));
    const storage = el('p', 'Проверяем поддержку устойчивого хранения…'); container.append(storage);
    if (!navigator.storage?.persisted || !navigator.storage?.persist) storage.textContent = 'Запрос устойчивого хранения в этом браузере недоступен. Работа с планом разрешена.';
    else {
      const update = async () => { try { storage.textContent = await navigator.storage.persisted() ? 'Устойчивое хранение разрешено. Это не заменяет резервный файл.' : 'Браузер может очищать временное хранилище. Вы можете запросить устойчивое хранение.'; } catch { storage.textContent = 'Статус устойчивого хранения недоступен. Работа с планом разрешена.'; } };
      update(); container.append(button('Запросить устойчивое хранение', async () => {
        try { const granted = await navigator.storage.persist(); storage.textContent = granted ? 'Устойчивое хранение разрешено. Скачивайте резервные файлы.' : 'Браузер не разрешил устойчивое хранение. Работа продолжается; сохраняйте внешние копии.'; } catch { storage.textContent = 'Запрос не выполнен. Работа с планом продолжается.'; }
      }));
    }
    if (meta.lastImport) container.append(button('Результат последней загрузки', () => {
      open('Результат последней загрузки', 'result'); popup.append(el('p', new Date(meta.lastImport.at).toLocaleString('ru-RU')));
      if (!meta.lastImport.rows.length && !meta.lastImport.removed.length) popup.append(el('p', 'Объекты не изменены.'));
      for (const row of [...meta.lastImport.rows, ...meta.lastImport.removed]) { popup.append(el('h3', row.name), diffView(row.diff)); }
    }));
  }
  return { sync, settings, remove, exportSafe, openExport, chooseFile };
}
