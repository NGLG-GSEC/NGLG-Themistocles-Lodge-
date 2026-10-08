/** Executive dashboard: KPIs and charts. */
import { fmtMoney, fmtPct, fmtNum, fullName, esc, fmtDate } from '../utils.js';
import { kpiCard, sectionHead, badge, dataTable, icon } from '../ui.js';
import { counts, executive, membershipGrowth, degreeDistribution, anomalies, describeTrend } from '../analytics.js';
import { allYears, yearSummary, forecast, memberDebt, growth } from '../treasury.js';
import { lineConfig, barConfig, pieConfig } from '../charts.js';
import { chartCard, ChartHost, yearOptions } from './shared.js';
import { STATUSES, DEGREES } from '../config.js';

export default {
  id: 'dashboard', title: 'Πίνακας Ελέγχου',
  async render(root, app) {
    const { store } = app; const asOf = app.asOf;
    const year = store.ui.dashboard?.year || asOf;
    const members = store.members; const c = counts(members);
    const e = executive(members.filter((m) => m.status !== 'deleted'), store.ledger, store.settings, { year, status: '' });
    const ctx = e.ctx; const years = allYears(ctx);
    const sums = years.map((y) => yearSummary(ctx, y)); const f = e.forecast; const next = f.rows[0];
    const lifetime = e.lifetime; const revTrend = describeTrend('Έσοδα', sums.filter((s) => s.paid).map((s) => s.paid));
    const alerts = anomalies(members, store.ledger, store.settings);
    const high = alerts.filter((a) => a.severity === 'high').length;

    const dir = (v) => (v === null || Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down');
    root.innerHTML = `
      ${sectionHead('Πίνακας Ελέγχου', `<label class="inline">Έτος <select id="dash-year" aria-label="Έτος αναφοράς">${yearOptions(years, year)}</select></label><a class="btn sm" href="#/analytics">${icon('chart', { size: 15 })} Πλήρης ανάλυση</a>`, `${store.settings.lodge.fullName} · Ενημέρωση σε πραγματικό χρόνο`)}
      ${store.isSample ? `<div class="notice" role="note">${icon('info')}<div><strong>Δεδομένα δείγματος.</strong> Η εφαρμογή περιέχει τα 22 μέλη του μητρώου της Στοάς (χωρίς πληρωμές). Εισάγετε το πραγματικό σας αρχείο από την ενότητα «Εισαγωγή» και καθαρίστε το δείγμα από τις «Ρυθμίσεις».</div></div>` : ''}
      <div class="kpi-grid" aria-label="Βασικοί δείκτες">
        ${kpiCard({ label: 'Σύνολο μελών', value: fmtNum(c.total), sub: `${c.deleted ? c.deleted + ' διαγραμμένα' : 'εγγεγραμμένα'}`, ic: 'users', href: '#/members?status=' })}
        ${kpiCard({ label: 'Ενεργά μέλη', value: fmtNum(c.active), ic: 'check', tone: 'good', href: '#/members?status=active' })}
        ${kpiCard({ label: 'Πρώην μέλη', value: fmtNum(c.former), sub: c.archived ? `${c.archived} αρχειοθετημένα` : '', ic: 'archive', href: '#/members?status=former' })}
        ${kpiCard({ label: 'Διαγραμμένα', value: fmtNum(c.deleted), ic: 'trash', href: '#/members?status=deleted' })}
        ${kpiCard({ label: 'Μαθητές (Εισδοχή)', value: fmtNum(c.initiated), ic: 'star', href: '#/members?status=active&degree=ΜΑΘΗΤΗΣ' })}
        ${kpiCard({ label: 'Εταίροι (Διέλευση)', value: fmtNum(c.passed), ic: 'star', href: '#/members?status=active&degree=ΕΤΑΙΡΟΣ' })}
        ${kpiCard({ label: 'Διδάσκαλοι (Έγερση)', value: fmtNum(c.raised), ic: 'star', href: '#/members?status=active&degree=ΔΙΔΑΣΚΑΛΟΣ' })}
        ${kpiCard({ label: `Συνολικά έσοδα ${year}`, value: fmtMoney(e.summary.paid), sub: `Διαχρονικά: ${fmtMoney(lifetime)}`, ic: 'coins', tone: 'gold', href: '#/treasury' })}
        ${kpiCard({ label: 'Εκκρεμείς οφειλές', value: fmtMoney(e.debt), sub: `${e.debtCount} μέλη`, ic: 'alert', tone: e.debt ? 'bad' : 'good', href: '#/treasury?tab=debtors' })}
        ${kpiCard({ label: 'Ποσοστό είσπραξης', value: fmtPct(e.summary.collectionRate), sub: `Οφειλές ${fmtPct(e.summary.debtRatio)} των αναμενόμενων`, ic: 'chart', tone: e.summary.collectionRate >= 85 ? 'good' : 'warn' })}
        ${kpiCard({ label: 'Μεταβολή εσόδων', value: e.revenueGrowth === null ? '—' : `${e.revenueGrowth > 0 ? '+' : ''}${fmtPct(e.revenueGrowth)}`, trend: { direction: dir(e.revenueGrowth), text: `έναντι ${year - 1}` }, ic: 'chart' })}
        ${kpiCard({ label: `Πρόβλεψη εσόδων ${next?.year ?? ''}`, value: next ? fmtMoney(next.forecast) : '—', sub: next ? `Εύρος ${fmtMoney(next.low)} – ${fmtMoney(next.high)}` : '', ic: 'coins', tone: 'gold' })}
      </div>
      <div class="grid g2">
        ${chartCard('c-members', 'Τάση μελών', { sub: 'Σωρευτικός αριθμός μελών και νέες εισδοχές ανά έτος' })}
        ${chartCard('c-annual', 'Ετήσια στατιστικά', { sub: 'Αναμενόμενα, εισπράξεις και οφειλές' })}
      </div>
      <div class="grid g3">
        ${chartCard('c-status', 'Κατάσταση μελών', { h: 250 })}
        ${chartCard('c-degree', 'Κατανομή βαθμών', { h: 250 })}
        ${chartCard('c-pay', 'Αναλυτικά πληρωμών', { sub: 'Εξοφλημένοι / μερικώς / απλήρωτοι', h: 250 })}
      </div>
      <div class="grid g2">
        ${chartCard('c-forecast', 'Πρόβλεψη εσόδων', { sub: `Μέσο ποσοστό είσπραξης ${fmtPct(f.rate)} · ${revTrend.text}` })}
        <section class="card" aria-labelledby="alerts-h"><header class="card-head"><div><h3 id="alerts-h">Ειδοποιήσεις & ανωμαλίες</h3><p class="sub">${alerts.length} ευρήματα · ${high} υψηλής σημασίας</p></div></header>
          <ul class="alert-list">${alerts.slice(0, 6).map((a) => `<li>${badge(a.severity === 'high' ? 'Υψηλή' : a.severity === 'medium' ? 'Μεσαία' : 'Χαμηλή', a.severity === 'high' ? 'bad' : a.severity === 'medium' ? 'warn' : 'neutral')} <span>${esc(a.text)}</span>${a.memberId ? ` <a href="#/member/${a.memberId}">Άνοιγμα</a>` : ''}</li>`).join('') || '<li class="dim">Δεν εντοπίστηκαν ανωμαλίες.</li>'}</ul>
          <p><a href="#/analytics">Όλες οι ανωμαλίες στα Analytics →</a></p></section>
      </div>
      <div class="grid g2">
        <section class="card" aria-labelledby="recent-h"><header class="card-head"><h3 id="recent-h">Τελευταίες πληρωμές</h3></header>
          ${dataTable({ caption: 'Τελευταίες πληρωμές', cls: 'compact', columns: [{ key: 'date', label: 'Ημ/νία', type: 'date' }, { key: 'name', label: 'Μέλος' }, { key: 'year', label: 'Έτος' }, { key: 'amount', label: 'Ποσό', type: 'money' }], rows: [...store.ledger].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((p) => ({ ...p, name: fullName(store.getMember(p.memberId) || {}) })), render: { name: (v, r) => `<a href="#/member/${r.memberId}">${esc(v)}</a>` } })}</section>
        <section class="card" aria-labelledby="debtors-h"><header class="card-head"><h3 id="debtors-h">Μεγαλύτερες οφειλές</h3></header>
          ${dataTable({ caption: 'Μεγαλύτερες οφειλές', cls: 'compact', columns: [{ key: 'name', label: 'Μέλος' }, { key: 'reg', label: 'Αρ.' }, { key: 'debt', label: 'Οφειλή', type: 'money' }], rows: ctx.members.map((m) => ({ id: m.id, name: fullName(m), reg: m.registryNumber, debt: memberDebt(ctx, m) })).filter((r) => r.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 7), render: { name: (v, r) => `<a href="#/member/${r.id}">${esc(v)}</a>` }, empty: 'Δεν υπάρχουν οφειλές 🎉' })}</section>
      </div>`;

    root.querySelector('#dash-year').addEventListener('change', (ev) => { store.setUi('dashboard', { ...store.ui.dashboard, year: +ev.target.value }); app.refresh(); });

    const host = new ChartHost(app, root);
    const g = membershipGrowth(members.filter((m) => m.status !== 'deleted'), asOf);
    await host.mount('c-members', lineConfig(g.rows.map((r) => r.year), [{ label: 'Σύνολο ενεργών μελών', data: g.rows.map((r) => r.total), fill: true }, { label: 'Νέες εισδοχές', data: g.rows.map((r) => r.joined), borderDash: [5, 4] }]));
    await host.mount('c-annual', barConfig(years, [{ label: 'Αναμενόμενα', data: sums.map((s) => s.expected) }, { label: 'Εισπράξεις', data: sums.map((s) => s.paid) }, { label: 'Οφειλές', data: sums.map((s) => s.outstanding) }], { money: true }));
    const sc = Object.keys(STATUSES).map((k) => [STATUSES[k], members.filter((m) => m.status === k).length]).filter((x) => x[1]);
    await host.mount('c-status', pieConfig(sc.map((x) => x[0]), sc.map((x) => x[1])));
    const dd = degreeDistribution(members.filter((m) => m.status === 'active'));
    await host.mount('c-degree', pieConfig(dd.labels, dd.values, { doughnut: false }));
    const pay = years.filter((y) => y >= (store.settings.debtFromYear || 2026) && y <= asOf + 1).map((y) => yearSummary(ctx, y));
    await host.mount('c-pay', barConfig(pay.map((s) => s.year), [{ label: 'Εξοφλημένα', data: pay.map((s) => s.full) }, { label: 'Μερικά', data: pay.map((s) => s.partial) }, { label: 'Απλήρωτα', data: pay.map((s) => s.unpaid) }], { stacked: true }));
    const hist = f.history; const labels = [...hist.map((h) => h.year), ...f.rows.map((r) => r.year)];
    const pad = (arr, lead) => [...Array(lead).fill(null), ...arr];
    await host.mount('c-forecast', lineConfig(labels, [
      { label: 'Εισπράξεις (πραγματικά)', data: [...hist.map((h) => h.paid), ...f.rows.map(() => null)] },
      { label: 'Πρόβλεψη (πρόγραμμα εισφορών)', data: pad(f.rows.map((r) => r.forecast), hist.length), borderDash: [6, 4] },
      { label: 'Πρόβλεψη (τάση)', data: pad(f.rows.map((r) => r.trend), hist.length), borderDash: [2, 4] },
      { label: 'Άνω όριο', data: pad(f.rows.map((r) => r.high), hist.length), borderWidth: 1, pointRadius: 0 },
      { label: 'Κάτω όριο', data: pad(f.rows.map((r) => r.low), hist.length), borderWidth: 1, pointRadius: 0 },
    ], { money: true }));
    return () => host.items.clear();
  },
};
