/** Treasury module: contribution grid (2026–2030), ledger, debtors, fee schedule and forecasting. */
import { YEARS, CATEGORIES, PAYMENT_METHODS, STATUSES } from '../config.js';
import { esc, fmtMoney, fmtPct, fullName, parseMoney, round2, sum, normText, fmtDate } from '../utils.js';
import { icon, badge, sectionHead, dataTable, tabs, wireTabs, toast, confirmDialog, kpiCard, trendBadge } from '../ui.js';
import { makeCtx, memberYear, memberTotals, memberDebt, yearSummary, allYears, forecast, growth, trendOf, compliance } from '../treasury.js';
import { barConfig, lineConfig } from '../charts.js';
import { chartCard, ChartHost, yearOptions, exportMenu } from './shared.js';
import { paymentDialog } from './forms.js';
import { REPORTS, getReport } from '../reports.js';
import { exportAs } from '../exporter.js';

const money2 = (n) => Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default {
  id: 'treasury', title: 'Ταμείο',
  async render(root, app, params) {
    const { store } = app; const canW = app.can('treasury.write');
    let year = +(store.ui.treasuryYear || app.asOf); if (!YEARS.includes(year)) year = YEARS[0];
    let ctx = app.ctx();
    const q = { text: '', status: 'active' };
    const visible = () => { const t = normText(q.text); return store.members.filter((m) => m.status !== 'deleted' && (!q.status || m.status === q.status) && (!t || normText(`${m.registryNumber} ${m.lastName} ${m.firstName}`).includes(t))).sort((a, b) => a.registryNumber.localeCompare(b.registryNumber)); };

    root.innerHTML = `${sectionHead('Ταμείο', `<label class="inline">Έτος <select id="t-year" aria-label="Έτος">${yearOptions(YEARS, year)}</select></label>${canW ? `<button class="btn primary" id="t-addpay">${icon('plus', { size: 16 })} Νέα πληρωμή</button>` : ''}${app.can('export') ? exportMenu('treasury', ['pdf', 'xlsx', 'csv', 'print']) : ''}`, 'Εισφορές 2026–2030 ως πραγματικά χρηματικά ποσά · αυτόματοι υπολογισμοί')}
      ${canW ? '' : `<div class="notice" role="note">${icon('lock')}<div>Ο ρόλος σας (${esc(app.roleLabel)}) δεν επιτρέπει επεξεργασία οικονομικών στοιχείων.</div></div>`}
      <div id="t-kpis" class="kpi-grid compact"></div>
      ${tabs('treasury', [['grid', 'Εισφορές ανά μέλος'], ['ledger', 'Κινήσεις'], ['debtors', 'Οφειλές'], ['fees', 'Πρόγραμμα εισφορών'], ['analysis', 'Ανάλυση & πρόβλεψη']], params.tab || 'grid')}
      <div id="treasury-p-grid" role="tabpanel" aria-labelledby="treasury-t-grid" tabindex="0"></div>
      <div id="treasury-p-ledger" role="tabpanel" aria-labelledby="treasury-t-ledger" tabindex="0" hidden></div>
      <div id="treasury-p-debtors" role="tabpanel" aria-labelledby="treasury-t-debtors" tabindex="0" hidden></div>
      <div id="treasury-p-fees" role="tabpanel" aria-labelledby="treasury-t-fees" tabindex="0" hidden></div>
      <div id="treasury-p-analysis" role="tabpanel" aria-labelledby="treasury-t-analysis" tabindex="0" hidden></div>`;

    const host = new ChartHost(app, root);

    /* ------------------------------- KPIs ------------------------------- */
    function paintKpis() {
      const s = yearSummary(ctx, year); const all = allYears(ctx).map((y) => yearSummary(ctx, y)); const idx = all.findIndex((x) => x.year === year); const prev = all[idx - 1];
      const g = prev && prev.paid ? ((s.paid - prev.paid) / prev.paid) * 100 : null;
      const life = round2(sum(store.ledger, (p) => p.amount)); const avgAnnual = all.filter((x) => x.paid).length ? sum(all, (x) => x.paid) / all.filter((x) => x.paid).length : 0;
      root.querySelector('#t-kpis').innerHTML = [
        kpiCard({ label: `Αναμενόμενα ${year}`, value: fmtMoney(s.expected), sub: `${s.owed} μέλη`, ic: 'coins' }),
        kpiCard({ label: 'Εισπράχθηκαν', value: fmtMoney(s.paid), tone: 'gold', trend: g === null ? null : { direction: g > 0 ? 'up' : g < 0 ? 'down' : 'flat', text: `${g > 0 ? '+' : ''}${fmtPct(g)} vs ${year - 1}` }, ic: 'coins' }),
        kpiCard({ label: 'Υπόλοιπο οφειλών', value: fmtMoney(s.outstanding), tone: s.outstanding ? 'bad' : 'good', sub: `Λόγος οφειλών ${fmtPct(s.debtRatio)}`, ic: 'alert' }),
        kpiCard({ label: 'Ποσοστό είσπραξης', value: fmtPct(s.collectionRate), tone: s.collectionRate >= 85 ? 'good' : 'warn', sub: `${s.full} εξοφλημένοι · ${s.partial} μερικώς · ${s.unpaid} απλήρωτοι`, ic: 'chart' }),
        kpiCard({ label: 'Μέση εισφορά πληρωτή', value: fmtMoney(s.averageContribution), sub: `${s.payers} πληρωτές`, ic: 'user' }),
        kpiCard({ label: 'Διαχρονικές εισπράξεις', value: fmtMoney(life), sub: `Μέσο ετήσιο ${fmtMoney(avgAnnual)}`, ic: 'star' }),
      ].join('');
    }

    /* ------------------------------- grid ------------------------------- */
    function gridHtml() {
      const list = visible();
      const head = `<tr><th scope="col" class="sticky">Αρ.</th><th scope="col" class="sticky2">Μέλος</th><th scope="col">Κατηγορία</th>${YEARS.map((y) => `<th scope="col" class="r">${y}<small> καταβλ. / εισφορά</small></th>`).join('')}<th scope="col" class="r">Σύνολο καταβλ.</th><th scope="col" class="r">Σύνολο εισφορών</th><th scope="col" class="r">Οφειλή</th><th scope="col" class="r">%</th></tr>`;
      const body = list.map((m) => `<tr data-row="${m.id}"><td class="sticky mono">${esc(m.registryNumber)}</td><th scope="row" class="sticky2"><a href="#/member/${m.id}">${esc(fullName(m))}</a></th><td>${esc(CATEGORIES[m.category] || '')}</td>${YEARS.map((y) => { const r = memberYear(ctx, m, y); return `<td class="r cellmoney"><input class="money ${r.state}" inputmode="decimal" value="${money2(r.paid)}" data-m="${m.id}" data-y="${y}" ${canW ? '' : 'readonly'} aria-label="Καταβληθέντα ${y} — ${esc(fullName(m))}"><small class="dim" data-k="${m.id}:e${y}">/ ${money2(r.expected)}</small></td>`; }).join('')}<td class="r" data-k="${m.id}:paid"></td><td class="r" data-k="${m.id}:exp"></td><td class="r strong" data-k="${m.id}:debt"></td><td class="r" data-k="${m.id}:pct"></td></tr>`).join('');
      const foot = `<tr><th scope="row" colspan="3" class="sticky2">Σύνολα (${list.length} μέλη)</th>${YEARS.map((y) => `<td class="r" data-k="foot:${y}"></td>`).join('')}<td class="r" data-k="foot:paid"></td><td class="r" data-k="foot:exp"></td><td class="r" data-k="foot:debt"></td><td class="r" data-k="foot:pct"></td></tr>`;
      return `<div class="card toolbar"><div class="search-field"><label class="sr-only" for="t-q">Φίλτρο μελών</label>${icon('search', { size: 18 })}<input id="t-q" type="search" placeholder="Φίλτρο: αρ. μητρώου ή όνομα…" value="${esc(q.text)}"></div><label class="inline">Κατάσταση <select id="t-status"><option value="active"${q.status === 'active' ? ' selected' : ''}>Ενεργά</option><option value="former"${q.status === 'former' ? ' selected' : ''}>Πρώην</option><option value=""${q.status === '' ? ' selected' : ''}>Όλα</option></select></label><span class="dim">Πληκτρολογήστε νέο ποσό και πατήστε Enter/Tab· η διαφορά καταχωρείται ως κίνηση στο ιστορικό.</span></div>
        <div class="card flush"><div class="table-wrap grid-wrap" tabindex="0" role="region" aria-label="Πίνακας εισφορών"><table class="tbl treasury-grid"><caption class="sr-only">Εισφορές ανά μέλος και έτος</caption><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div></div>`;
    }

    function refreshTotals() {
      const list = visible(); const tot = { paid: 0, exp: 0, debt: 0 }; const yt = Object.fromEntries(YEARS.map((y) => [y, 0]));
      const set = (k, v) => { const el = root.querySelector(`[data-k="${k}"]`); if (el) el.textContent = v; };
      for (const m of list) {
        const t = memberTotals(ctx, m, YEARS); tot.paid += t.paid; tot.exp += t.expected; tot.debt += t.debt; t.perYear.forEach((r) => { yt[r.year] += r.paid; set(`${m.id}:e${r.year}`, `/ ${money2(r.expected)}`); });
        set(`${m.id}:paid`, fmtMoney(t.paid)); set(`${m.id}:exp`, fmtMoney(t.expected)); set(`${m.id}:debt`, fmtMoney(t.debt)); set(`${m.id}:pct`, t.expected ? fmtPct((Math.min(t.paid, t.expected) / t.expected) * 100, 0) : '—');
        root.querySelectorAll(`input[data-m="${m.id}"]`).forEach((inp) => { const r = t.perYear.find((x) => x.year === +inp.dataset.y); inp.className = `money ${r.state}`; });
      }
      YEARS.forEach((y) => set(`foot:${y}`, fmtMoney(yt[y]))); set('foot:paid', fmtMoney(tot.paid)); set('foot:exp', fmtMoney(tot.exp)); set('foot:debt', fmtMoney(tot.debt)); set('foot:pct', tot.exp ? fmtPct((Math.min(tot.paid, tot.exp) / tot.exp) * 100, 0) : '—');
    }

    /* ------------------------------ panels ------------------------------ */
    function paintGrid() { root.querySelector('#treasury-p-grid').innerHTML = gridHtml(); refreshTotals(); }

    function paintLedger() {
      const rows = [...store.ledger].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map((p) => ({ ...p, name: fullName(store.getMember(p.memberId) || {}), reg: store.getMember(p.memberId)?.registryNumber }));
      root.querySelector('#treasury-p-ledger').innerHTML = `<div class="card"><p class="sub">${rows.length} κινήσεις · σύνολο ${fmtMoney(sum(rows, (r) => r.amount))}</p>${dataTable({ caption: 'Κινήσεις ταμείου', cls: 'compact', columns: [{ key: 'date', label: 'Ημερομηνία', type: 'date' }, { key: 'receipt', label: 'Απόδειξη' }, { key: 'reg', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'year', label: 'Έτος' }, { key: 'amount', label: 'Ποσό', type: 'money' }, { key: 'method', label: 'Τρόπος' }, { key: 'note', label: 'Σημείωση' }, ...(canW ? [{ key: 'id', label: '' }] : [])], rows: rows.slice(0, 500), render: { method: (v) => esc(PAYMENT_METHODS[v] || v), name: (v, r) => `<a href="#/member/${r.memberId}">${esc(v)}</a>`, id: (v) => `<button class="icon-btn danger" data-delpay="${v}" aria-label="Διαγραφή κίνησης">${icon('trash', { size: 16 })}</button>` } })}${rows.length > 500 ? '<p class="dim">Εμφανίζονται οι 500 πιο πρόσφατες κινήσεις· η πλήρης λίστα υπάρχει στις εξαγωγές.</p>' : ''}</div>`;
    }

    function paintDebtors() {
      const rows = ctx.members.filter((m) => m.status !== 'deleted').map((m) => ({ id: m.id, reg: m.registryNumber, name: fullName(m), phone: m.mobilePhone, email: m.email, ...Object.fromEntries(YEARS.filter((y) => y <= ctx.asOf).map((y) => [`y${y}`, Math.max(0, memberYear(ctx, m, y).balance)])), total: memberDebt(ctx, m) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
      const ys = YEARS.filter((y) => y >= (store.settings.debtFromYear || YEARS[0]) && y <= ctx.asOf);
      root.querySelector('#treasury-p-debtors').innerHTML = `<div class="card"><p class="sub">Οφειλές για τα έτη ${ys[0] ?? '—'}–${ys.at(-1) ?? '—'} · ${rows.length} μέλη · σύνολο <strong>${fmtMoney(sum(rows, (r) => r.total))}</strong></p>${dataTable({ caption: 'Οφειλές μελών', columns: [{ key: 'reg', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'phone', label: 'Κινητό' }, ...ys.map((y) => ({ key: `y${y}`, label: String(y), type: 'money' })), { key: 'total', label: 'Σύνολο', type: 'money' }, ...(canW ? [{ key: 'id', label: '' }] : [])], rows, empty: 'Δεν υπάρχουν οφειλές.', render: { name: (v, r) => `<a href="#/member/${r.id}">${esc(v)}</a>`, id: (v) => `<button class="btn sm" data-pay="${v}">Πληρωμή</button>` } })}</div>`;
    }

    function paintFees() {
      const years = [...new Set([...YEARS, ...Object.values(store.settings.fees).flatMap((f) => Object.keys(f).map(Number))])].sort();
      root.querySelector('#treasury-p-fees').innerHTML = `<div class="card"><p class="sub">Ετήσια εισφορά ανά κατηγορία μέλους. Η αλλαγή επηρεάζει αμέσως τα αναμενόμενα ποσά, τις οφειλές και τις προβλέψεις.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Πρόγραμμα εισφορών"><table class="tbl"><caption class="sr-only">Πρόγραμμα εισφορών</caption><thead><tr><th scope="col">Κατηγορία</th>${years.map((y) => `<th scope="col" class="r">${y}</th>`).join('')}</tr></thead><tbody>${Object.keys(CATEGORIES).map((c) => `<tr><th scope="row">${esc(CATEGORIES[c])}</th>${years.map((y) => `<td class="r"><input class="money" inputmode="decimal" data-fee="${c}" data-y="${y}" value="${money2(store.settings.fees[c]?.[y] ?? 0)}" ${canW ? '' : 'readonly'} aria-label="Εισφορά ${esc(CATEGORIES[c])} ${y}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }

    async function paintAnalysis() {
      const el = root.querySelector('#treasury-p-analysis'); const ys = allYears(ctx); const sums = ys.map((y) => yearSummary(ctx, y)); const f = forecast(ctx, 4); const gr = growth(sums.map((s) => s.paid));
      const cmp = compliance(ctx, year);
      el.innerHTML = `<div class="grid g2">${chartCard('t-annual', 'Ετήσια σύγκριση', { sub: 'Αναμενόμενα, εισπράξεις, οφειλές' })}${chartCard('t-yoy', 'Μεταβολή εσόδων (YoY)', { sub: 'Ποσοστιαία αύξηση σε σχέση με το προηγούμενο έτος' })}${chartCard('t-unpaid', 'Απλήρωτες συνδρομές', { sub: 'Αριθμός μελών ανά κατάσταση πληρωμής' })}${chartCard('t-future', 'Αναμενόμενα μελλοντικά έσοδα', { sub: `Πρόβλεψη με μέσο ποσοστό είσπραξης ${fmtPct(f.rate)}` })}</div>
        <div class="card"><h3>Συμμόρφωση πληρωμών ${year}</h3><div class="kpi-grid compact">${kpiCard({ label: 'Εμπρόθεσμα', value: `${cmp.onTime}`, sub: fmtPct(cmp.onTimeRate), ic: 'check', tone: 'good' })}${kpiCard({ label: 'Εκπρόθεσμα', value: `${cmp.late}`, sub: `μέσος χρόνος καθυστέρησης ${Math.round(cmp.avgLateDays)} ημ.`, ic: 'calendar', tone: 'warn' })}${kpiCard({ label: 'Μερικώς πληρωμένα', value: `${cmp.partial}`, ic: 'coins' })}${kpiCard({ label: 'Απλήρωτα', value: `${cmp.unpaid}`, ic: 'alert', tone: 'bad' })}</div></div>
        <div class="card">${dataTable({ caption: 'Σύνοψη ετών', columns: [{ key: 'year', label: 'Έτος' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'paid', label: 'Εισπράξεις', type: 'money' }, { key: 'outstanding', label: 'Οφειλές', type: 'money' }, { key: 'collectionRate', label: 'Είσπραξη', type: 'percent' }, { key: 'debtRatio', label: 'Λόγος οφειλών', type: 'percent' }, { key: 'averageContribution', label: 'Μέση εισφορά', type: 'money' }, { key: 'growth', label: 'YoY', type: 'percent' }], rows: sums.map((s, i) => ({ ...s, growth: gr[i] })) })}</div>`;
      await host.mount('t-annual', barConfig(ys, [{ label: 'Αναμενόμενα', data: sums.map((s) => s.expected) }, { label: 'Εισπράξεις', data: sums.map((s) => s.paid) }, { label: 'Οφειλές', data: sums.map((s) => s.outstanding) }], { money: true }));
      await host.mount('t-yoy', barConfig(ys, [{ label: 'Μεταβολή %', data: gr.map((v) => (v === null ? null : round2(v))) }]));
      const py = sums.filter((s) => s.year >= (store.settings.debtFromYear || YEARS[0]));
      await host.mount('t-unpaid', barConfig(py.map((s) => s.year), [{ label: 'Εξοφλημένα', data: py.map((s) => s.full) }, { label: 'Μερικά', data: py.map((s) => s.partial) }, { label: 'Απλήρωτα', data: py.map((s) => s.unpaid) }], { stacked: true }));
      await host.mount('t-future', barConfig(f.rows.map((r) => r.year), [{ label: 'Αναμενόμενα', data: f.rows.map((r) => r.expected) }, { label: 'Πρόβλεψη εισπράξεων', data: f.rows.map((r) => r.forecast) }, { label: 'Προπληρωμένα', data: f.rows.map((r) => r.prepaid) }], { money: true }));
    }

    function repaint(which) {
      ctx = app.ctx(); paintKpis();
      const w = which || root.querySelector('[role=tab][aria-selected=true]')?.dataset.tab;
      if (w === 'grid') paintGrid(); else if (w === 'ledger') paintLedger(); else if (w === 'debtors') paintDebtors(); else if (w === 'fees') paintFees(); else if (w === 'analysis') paintAnalysis();
    }
    wireTabs(root, 'treasury', (k) => repaint(k));

    /* ------------------------------- events ------------------------------- */
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 't-year') { year = +t.value; store.setUi('treasuryYear', year); repaint(); return; }
      if (t.id === 't-status') { q.status = t.value; paintGrid(); return; }
      if (t.matches('input.money[data-m]')) {
        if (!app.guard('treasury.write')) { repaint('grid'); return; }
        const v = parseMoney(t.value); const m = t.dataset.m; const y = +t.dataset.y;
        if (!Number.isFinite(v) || v < 0) { toast('Μη έγκυρο ποσό.', 'error'); t.value = money2(ctx.paidOf(m, y)); return; }
        store.setPaid(m, y, v); t.value = money2(v); ctx = app.ctx(); refreshTotals(); paintKpis();
      }
      if (t.matches('input[data-fee]')) {
        if (!app.guard('settings') && !app.guard('treasury.write')) return;
        const v = parseMoney(t.value); if (!Number.isFinite(v) || v < 0) { toast('Μη έγκυρο ποσό.', 'error'); return; }
        const fees = JSON.parse(JSON.stringify(store.settings.fees)); (fees[t.dataset.fee] ||= {})[t.dataset.y] = v; store.updateSettings({ fees }); t.value = money2(v); toast('Το πρόγραμμα εισφορών ενημερώθηκε.', 'success');
      }
    });
    root.addEventListener('input', (e) => { if (e.target.id === 't-q') { q.text = e.target.value; const pos = e.target.selectionStart; paintGrid(); const n = root.querySelector('#t-q'); n.focus(); n.setSelectionRange(pos, pos); } });
    root.addEventListener('focusin', (e) => { if (e.target.matches('input.money')) e.target.select(); });
    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#t-addpay')) { const pick = store.members.filter((m) => m.status === 'active'); if (!pick.length) return; const m = await pickMember(app); if (m) await paymentDialog(app, m, year); return; }
      const pay = t.closest('[data-pay]'); if (pay) { await paymentDialog(app, pay.dataset.pay); return; }
      const del = t.closest('[data-delpay]'); if (del && await confirmDialog('Διαγραφή της κίνησης;', { danger: true, ok: 'Διαγραφή' })) { store.removePayment(del.dataset.delpay); return; }
      const ex = t.closest('[data-export]');
      if (ex) {
        if (!app.guard('export')) return;
        const tab = root.querySelector('[role=tab][aria-selected=true]')?.dataset.tab;
        const rep = getReport(tab === 'debtors' ? 'debt' : tab === 'analysis' ? 'annual' : 'treasurer');
        const table = rep.build({ members: store.members, ledger: store.ledger, audit: store.state.audit, settings: { ...store.settings, asOfYear: app.asOf }, year });
        try { await exportAs(ex.dataset.export, table, `tameio-${rep.id}`, { delimiter: store.settings.csvDelimiter }); toast('Η εξαγωγή ολοκληρώθηκε.', 'success'); } catch (err) { toast(err.message, 'error'); }
      }
    });

    const off = store.subscribe((type) => { if (/ledger|reset|bulk|settings|member/.test(type)) { const focus = document.activeElement; if (focus?.matches?.('input.money')) { ctx = app.ctx(); return; } repaint(); } });
    return () => off();
  },
};

/** Small member picker dialog (used by "Νέα πληρωμή"). */
async function pickMember(app) {
  const { openDialog, field } = await import('../ui.js');
  const list = app.store.members.filter((m) => m.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName, 'el'));
  const res = await openDialog({ title: 'Επιλογή μέλους', size: 'sm', body: field({ id: 'pm', label: 'Μέλος', type: 'select', value: list[0]?.id, options: list.map((m) => [m.id, `${m.registryNumber} — ${fullName(m)}`]) }), actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Συνέχεια', kind: 'primary', collect: (d) => d.querySelector('#pm').value }] });
  return res;
}
