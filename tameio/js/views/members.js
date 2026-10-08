/** Member registry: search, filters, sorting, pagination, CRUD and exports. */
import { DEGREES, CATEGORIES, STATUSES } from '../config.js';
import { esc, fmtDate, fullName, debounce, uid } from '../utils.js';
import { icon, badge, sectionHead, confirmDialog, toast, announce } from '../ui.js';
import { Autocomplete } from '../autocomplete.js';
import { memberDialog } from './forms.js';
import { exportAs, MEMBER_COLUMNS, memberRows } from '../exporter.js';
import { exportMenu } from './shared.js';

const SORTS = { registryNumber: (m) => m.registryNumber, name: (m) => `${m.lastName} ${m.firstName}`, degree: (m) => DEGREES[m.degree]?.order ?? 0, category: (m) => m.category, status: (m) => m.status, office: (m) => m.office || '' };
export const statusTone = { active: 'good', former: 'warn', archived: 'neutral', deleted: 'bad' };

export default {
  id: 'members', title: 'Μητρώο Μελών',
  async render(root, app, params) {
    const { store, engine } = app;
    const saved = store.ui.filters?.members || {};
    const st = { q: params.q ?? saved.q ?? '', status: params.status ?? saved.status ?? 'active', degree: params.degree ?? saved.degree ?? '', category: params.category ?? saved.category ?? '', province: saved.province ?? '', sort: saved.sort || 'name', dir: saved.dir || 1, page: 1, size: store.settings.pageSize || 25 };
    let rows = []; let total = 0;
    const provinces = () => [...new Set(store.members.map((m) => m.province).filter(Boolean))].sort();
    const canWrite = app.can('members.write'); const canDel = app.can('members.delete');

    root.innerHTML = `${sectionHead('Μητρώο Μελών', `${canWrite ? `<button class="btn primary" id="m-add">${icon('plus', { size: 16 })} Νέο μέλος</button>` : ''}${app.can('import') ? '<a class="btn" href="#/import">' + icon('upload', { size: 16 }) + ' Εισαγωγή Excel</a>' : ''}${app.can('export') ? exportMenu('members', ['xlsx', 'csv', 'pdf', 'json', 'print']) : ''}`)}
      <div class="card toolbar">
        <div class="search-field"><label for="m-q" class="sr-only">Αναζήτηση μελών</label>${icon('search', { size: 18 })}<input id="m-q" type="search" placeholder="Αναζήτηση: αρ. μητρώου, όνομα, επώνυμο, email, τηλέφωνο, κατοικία, αξίωμα, βαθμός, σημειώσεις…" value="${esc(st.q)}"></div>
        <label class="inline">Βαθμός <select id="m-degree"><option value="">Όλοι</option>${Object.entries(DEGREES).map(([k, v]) => `<option value="${k}"${st.degree === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="inline">Κατηγορία <select id="m-cat"><option value="">Όλες</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}"${st.category === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="inline">Επαρχία <select id="m-prov"><option value="">Όλες</option>${provinces().map((p) => `<option${st.province === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      </div>
      <div id="m-tabs" class="pill-tabs" role="group" aria-label="Φίλτρο κατάστασης"></div>
      <div id="m-result" class="card flush" aria-live="polite"></div>`;

    const q = root.querySelector('#m-q');
    const ac = new Autocomplete({
      input: q, label: 'Αναζήτηση μελών', delay: 80,
      source: async (text) => { const r = await engine.search(text, { limit: 8, filter: st.status ? { status: st.status } : null }); return r.results; },
      onSelect: (it) => { store.addSearchHistory(q.value); app.navigate(`#/member/${it.id}`); },
      onSubmit: (text) => { store.addSearchHistory(text); st.q = text; st.page = 1; load(); },
      history: () => store.ui.searchHistory,
      onInput: debounce((text) => { st.q = text; st.page = 1; load(); }, 160),
    });

    function counts() { const c = { all: 0 }; for (const m of store.members) { c[m.status] = (c[m.status] || 0) + 1; if (m.status !== 'deleted') c.all++; } return c; }

    function tabsHtml() {
      const c = counts(); const items = [['active', 'Ενεργά'], ['former', 'Πρώην'], ['archived', 'Αρχειοθετημένα'], ['deleted', 'Διαγραμμένα'], ['', 'Όλα']];
      return items.map(([k, l]) => `<button type="button" class="pill" data-st="${k}" aria-pressed="${st.status === k}">${l} <span class="count">${k === '' ? c.all : c[k] || 0}</span></button>`).join('');
    }

    async function load() {
      store.setUi('filters', { ...store.ui.filters, members: { q: st.q, status: st.status, degree: st.degree, category: st.category, province: st.province, sort: st.sort, dir: st.dir } });
      const filter = { status: st.status, degree: st.degree, category: st.category, province: st.province };
      const res = await engine.search(st.q, { limit: 1e6, filter });
      let list = res.results.map((r) => store.getMember(r.id)).filter(Boolean);
      if (!st.status) list = list.filter((m) => m.status !== 'deleted');
      if (!st.q.trim()) { const f = SORTS[st.sort]; list.sort((a, b) => { const x = f(a); const y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); } else if (st.sort !== 'name' || st.dir !== 1) { const f = SORTS[st.sort]; list.sort((a, b) => { const x = f(a); const y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
      rows = list; total = list.length; paint(res);
    }

    function paint(res) {
      root.querySelector('#m-tabs').innerHTML = tabsHtml();
      const pages = Math.max(1, Math.ceil(total / st.size)); st.page = Math.min(st.page, pages);
      const slice = rows.slice((st.page - 1) * st.size, st.page * st.size);
      const th = (key, label) => `<th scope="col" aria-sort="${st.sort === key ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort" data-sort="${key}">${label}${st.sort === key ? icon(st.dir > 0 ? 'up' : 'down', { size: 14 }) : ''}</button></th>`;
      const act = (m) => {
        const a = [`<a class="icon-btn" href="#/member/${m.id}" aria-label="Προβολή ${esc(fullName(m))}" title="Προφίλ">${icon('eye', { size: 17 })}</a>`];
        if (canWrite) a.push(`<button class="icon-btn" data-act="edit" data-id="${m.id}" aria-label="Επεξεργασία ${esc(fullName(m))}" title="Επεξεργασία">${icon('edit', { size: 17 })}</button>`);
        if (canDel) {
          if (m.status === 'deleted' || m.status === 'archived' || m.status === 'former') a.push(`<button class="icon-btn" data-act="restore" data-id="${m.id}" aria-label="Επαναφορά ${esc(fullName(m))}" title="Επαναφορά σε ενεργό">${icon('restore', { size: 17 })}</button>`);
          if (m.status === 'active') a.push(`<button class="icon-btn" data-act="former" data-id="${m.id}" aria-label="Πρώην μέλος: ${esc(fullName(m))}" title="Μετατροπή σε πρώην μέλος">${icon('user', { size: 17 })}</button>`);
          if (m.status !== 'archived' && m.status !== 'deleted') a.push(`<button class="icon-btn" data-act="archive" data-id="${m.id}" aria-label="Αρχειοθέτηση ${esc(fullName(m))}" title="Αρχειοθέτηση">${icon('archive', { size: 17 })}</button>`);
          if (m.status !== 'deleted') a.push(`<button class="icon-btn danger" data-act="delete" data-id="${m.id}" aria-label="Διαγραφή ${esc(fullName(m))}" title="Διαγραφή (μετακίνηση στα διαγραμμένα)">${icon('trash', { size: 17 })}</button>`);
          else a.push(`<button class="icon-btn danger" data-act="purge" data-id="${m.id}" aria-label="Οριστική διαγραφή ${esc(fullName(m))}" title="Οριστική διαγραφή">${icon('close', { size: 17 })}</button>`);
        }
        return `<div class="row-actions">${a.join('')}</div>`;
      };
      root.querySelector('#m-result').innerHTML = total ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Λίστα μελών"><table class="tbl members-tbl"><caption class="sr-only">Μητρώο μελών, ${total} εγγραφές</caption><thead><tr>${th('registryNumber', 'Αρ.')}${th('name', 'Μέλος')}${th('degree', 'Βαθμός')}${th('category', 'Κατηγορία')}<th scope="col">Κινητό</th>${th('office', 'Αξίωμα')}${th('status', 'Κατάσταση')}<th scope="col"><span class="sr-only">Ενέργειες</span></th></tr></thead><tbody>${slice.map((m) => `<tr data-id="${m.id}"><td data-label="Αρ."><span class="mono">${esc(m.registryNumber)}</span></td><td data-label="Μέλος"><a class="strong" href="#/member/${m.id}">${esc(fullName(m))}</a>${m.fatherName ? `<small class="dim"> του ${esc(m.fatherName)}</small>` : ''}</td><td data-label="Βαθμός">${esc(DEGREES[m.degree]?.label || '—')}</td><td data-label="Κατηγορία">${esc(CATEGORIES[m.category] || m.category)}</td><td data-label="Κινητό">${esc(m.mobilePhone || '—')}</td><td data-label="Αξίωμα">${esc(m.office || '—')}</td><td data-label="Κατάσταση">${badge(STATUSES[m.status], statusTone[m.status])}</td><td>${act(m)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pager"><span>${total} εγγραφές${res?.mode ? ` · αναζήτηση: ${res.mode === 'worker' ? 'Web Worker' : 'τοπική μηχανή'} ${res.ms.toFixed(1)} ms${res.cached ? ' (cache)' : ''}` : ''}</span><span class="grow"></span>
        <label class="inline">Ανά σελίδα <select id="m-size">${[10, 25, 50, 100].map((n) => `<option${n === st.size ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn sm" id="m-prev" ${st.page <= 1 ? 'disabled' : ''}>‹ Προηγούμενη</button><span aria-current="page">Σελίδα ${st.page} / ${pages}</span><button class="btn sm" id="m-next" ${st.page >= pages ? 'disabled' : ''}>Επόμενη ›</button></div>`
        : `<div class="empty">${icon('users', { size: 36 })}<p>Δεν βρέθηκαν μέλη${st.q ? ` για «${esc(st.q)}»` : ''}.</p>${canWrite ? '<button class="btn primary" id="m-add2">Προσθήκη μέλους</button>' : ''}</div>`;
      announce(`${total} αποτελέσματα`);
    }

    const act = async (name, id) => {
      const m = store.getMember(id); if (!m) return;
      if (name === 'edit') { await memberDialog(app, m); return; }
      if (name === 'delete' && await confirmDialog(`Διαγραφή του μέλους ${fullName(m)}; Θα μετακινηθεί στα «Διαγραμμένα» και μπορεί να επαναφερθεί.`, { danger: true, ok: 'Διαγραφή', title: 'Διαγραφή μέλους' })) { store.setStatus(id, 'deleted'); toast('Το μέλος διαγράφηκε (μπορεί να επαναφερθεί).', 'success'); }
      if (name === 'restore') { store.setStatus(id, 'active', 'επαναφορά'); toast('Το μέλος επανήλθε σε ενεργό.', 'success'); }
      if (name === 'archive') { store.setStatus(id, 'archived'); toast('Το μέλος αρχειοθετήθηκε.', 'success'); }
      if (name === 'former' && await confirmDialog(`Μετατροπή του ${fullName(m)} σε πρώην μέλος;`, { ok: 'Μετατροπή' })) { store.setStatus(id, 'former'); toast('Το μέλος μεταφέρθηκε στους πρώην.', 'success'); }
      if (name === 'purge' && await confirmDialog(`ΟΡΙΣΤΙΚΗ διαγραφή του ${fullName(m)} και όλων των πληρωμών του; Η ενέργεια δεν αναιρείται.`, { danger: true, ok: 'Οριστική διαγραφή', title: 'Οριστική διαγραφή' })) { store.purgeMember(id); toast('Το μέλος διαγράφηκε οριστικά.', 'success'); }
    };

    root.addEventListener('click', async (e) => {
      const t = e.target;
      const pill = t.closest('[data-st]'); if (pill) { st.status = pill.dataset.st; st.page = 1; load(); return; }
      const s = t.closest('[data-sort]'); if (s) { const k = s.dataset.sort; st.dir = st.sort === k ? -st.dir : 1; st.sort = k; load(); return; }
      const a = t.closest('[data-act]'); if (a) { await act(a.dataset.act, a.dataset.id); return; }
      if (t.closest('#m-add, #m-add2')) { const m = await memberDialog(app, null); if (m) app.navigate(`#/member/${m.id}`); return; }
      if (t.closest('#m-prev')) { st.page--; paint(); return; }
      if (t.closest('#m-next')) { st.page++; paint(); return; }
      const ex = t.closest('[data-export]');
      if (ex) {
        if (!app.guard('export')) return;
        const table = { title: 'Μητρώο Μελών', subtitle: `${store.settings.lodge.fullName} — ${total} μέλη`, sheet: 'Μέλη', columns: MEMBER_COLUMNS, rows: memberRows(rows) };
        try { await exportAs(ex.dataset.export, table, 'meleti-mitroo', { delimiter: store.settings.csvDelimiter }); toast('Η εξαγωγή ολοκληρώθηκε.', 'success'); } catch (err) { toast(err.message, 'error'); }
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'm-degree') st.degree = t.value; else if (t.id === 'm-cat') st.category = t.value; else if (t.id === 'm-prov') st.province = t.value;
      else if (t.id === 'm-size') { st.size = +t.value; store.updateSettings({ pageSize: st.size }); } else return;
      st.page = 1; load();
    });

    const off = store.subscribe((type) => { if (/member|bulk|reset|load/.test(type)) load(); });
    await load();
    return () => { off(); ac.destroy(); };
  },
};
