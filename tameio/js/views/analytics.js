/** Business-intelligence analytics: filters, KPI, 15+ analyses, anomaly detection, projections and exports. */
import { DEGREES, CATEGORIES, STATUSES, NO_OFFICE, YEARS } from '../config.js';
import { esc, fmtMoney, fmtPct, fmtNum, fullName, round2, sum, stamp, download } from '../utils.js';
import { icon, badge, sectionHead, dataTable, kpiCard, toast, trendBadge } from '../ui.js';
import * as A from '../analytics.js';
import { makeCtx, allYears, yearSummary, forecast, growth, compliance, memberDebt, trendOf } from '../treasury.js';
import { lineConfig, barConfig, pieConfig, chartDataURL, montageDataURL, dataURLtoBlob } from '../charts.js';
import { chartCard, ChartHost, yearOptions } from './shared.js';
import { exportXLSX, tableToPDF } from '../exporter.js';

const dir = (v) => (Math.abs(v) < 0.5 ? 'flat' : v > 0 ? 'up' : 'down');

export default {
  id: 'analytics', title: 'Analytics & BI',
  async render(root, app) {
    const { store } = app; const asOf = app.asOf;
    const f = { year: asOf, degree: '', province: '', office: '', status: '', category: '', ...(store.ui.analyticsFilters || {}) };
    const all = store.members;
    const uniq = (k) => [...new Set(all.map((m) => m[k]).filter(Boolean))].sort();
    const sel = (id, label, opts, val) => `<label class="inline">${label} <select id="${id}"><option value="">Όλα</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${val === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const yrs = [...new Set([...YEARS, asOf])].sort();

    root.innerHTML = `${sectionHead('Analytics & Business Intelligence', `<button class="btn" data-ax="pdf">${icon('download', { size: 15 })} PDF</button><button class="btn" data-ax="xlsx">${icon('download', { size: 15 })} Excel</button><button class="btn" data-ax="png">${icon('image', { size: 15 })} PNG</button>`, 'Ανάλυση μελών, ταμείου, προβλέψεων και ανωμαλιών')}
      <form class="card toolbar filters" id="a-filters" aria-label="Φίλτρα ανάλυσης">
        <label class="inline">Έτος <select id="f-year">${yearOptions(yrs, f.year)}</select></label>
        ${sel('f-degree', 'Βαθμός', Object.entries(DEGREES).map(([k, v]) => [k, v.label]), f.degree)}
        ${sel('f-province', 'Επαρχία', uniq('province').map((x) => [x, x]), f.province)}
        ${sel('f-office', 'Αξίωμα', [[NO_OFFICE, 'Άνευ αξιώματος'], ...uniq('office').filter((o) => o !== NO_OFFICE).map((x) => [x, x])], f.office)}
        ${sel('f-status', 'Κατάσταση', Object.entries(STATUSES), f.status)}
        ${sel('f-category', 'Κατηγορία', Object.entries(CATEGORIES), f.category)}
        <button type="button" class="btn sm" id="f-reset">Καθαρισμός</button>
      </form>
      <div id="a-body" aria-live="polite"></div>`;

    const host = new ChartHost(app, root);
    let model = null;

    async function paint() {
      app.charts.destroyAll(); host.items.clear();
      store.setUi('analyticsFilters', f);
      const ex = A.executive(all, store.ledger, { ...store.settings, asOfYear: asOf }, f);
      const scope = ex.scope; const ctx = ex.ctx; const years = allYears(ctx);
      const sums = years.map((y) => yearSummary(ctx, y)); const g = growth(sums.map((s) => s.paid));
      const growthM = A.membershipGrowth(scope, asOf); const age = A.ageDistribution(scope, asOf); const deg = A.degreeDistribution(scope);
      const res = A.distributionBy(scope, 'residence', 9); const prov = A.distributionBy(scope, 'province', 6);
      const off = A.officerParticipation(scope.filter((m) => m.status === 'active')); const ret = A.retention(scope, asOf); const prog = A.progression(scope);
      const rc = A.revenueByCategory(ctx, years); const debt = A.debtAnalysis(ctx); const cmp = compliance(ctx, f.year); const fc = ex.forecast;
      const anomalies = A.anomalies(scope, store.ledger.filter((p) => scope.some((m) => m.id === p.memberId)), { ...store.settings, asOfYear: asOf });
      const trends = [A.describeTrend('Έσοδα', sums.filter((s) => s.paid).map((s) => s.paid)), A.describeTrend('Μέλη', growthM.rows.map((r) => r.total)), A.describeTrend('Ποσοστό είσπραξης', sums.filter((s) => s.expected && s.year < asOf).map((s) => s.collectionRate), ' μον.')];
      model = { ex, years, sums, g, growthM, age, deg, res, prov, off, ret, prog, rc, debt, cmp, fc, anomalies, trends };
      const c = ex.counts;
      root.querySelector('#a-body').innerHTML = `
        <section aria-labelledby="exec-h"><h3 id="exec-h" class="sr-only">Εκτελεστική σύνοψη</h3><div class="kpi-grid">
          ${kpiCard({ label: 'Ενεργά μέλη', value: fmtNum(c.active), sub: `${fmtNum(c.total)} σύνολο στο φίλτρο`, ic: 'users' })}
          ${kpiCard({ label: `Έσοδα ${f.year}`, value: fmtMoney(ex.summary.paid), trend: ex.revenueGrowth === null ? null : { direction: dir(ex.revenueGrowth), text: `${fmtPct(ex.revenueGrowth)} vs ${f.year - 1}` }, ic: 'coins', tone: 'gold' })}
          ${kpiCard({ label: 'Ποσοστό είσπραξης', value: fmtPct(ex.summary.collectionRate), ic: 'chart', tone: ex.summary.collectionRate >= 85 ? 'good' : 'warn' })}
          ${kpiCard({ label: 'Εκκρεμείς οφειλές', value: fmtMoney(ex.debt), sub: `${ex.debtCount} μέλη`, ic: 'alert', tone: ex.debt ? 'bad' : 'good' })}
          ${kpiCard({ label: 'Διατήρηση μελών', value: fmtPct(ret.overall), sub: 'ενεργά / σύνολο εγγραφών', ic: 'check' })}
          ${kpiCard({ label: 'Συμμετοχή σε αξιώματα', value: fmtPct(off.rate), sub: `${off.officers} αξιωματούχοι`, ic: 'star' })}
          ${kpiCard({ label: 'Μέση ηλικία', value: age.known ? age.average.toFixed(1) : '—', sub: `διάμεσος ${age.median || '—'} · ${age.known} γνωστές`, ic: 'user' })}
          ${kpiCard({ label: 'Μέσος χρόνος εισδοχή → έγερση', value: prog.avgTotal ? `${prog.avgTotal.toFixed(1)} μήν.` : '—', ic: 'calendar' })}
        </div></section>
        <section class="card" aria-labelledby="trend-h"><h3 id="trend-h">Ανίχνευση τάσεων</h3><ul class="trend-list">${trends.map((t) => `<li>${trendBadge(t.direction, t.text)}</li>`).join('')}</ul></section>
        <h3 class="band">Μέλη</h3>
        <div class="grid g2">${chartCard('a-growth', 'Ανάλυση ανάπτυξης μελών', { sub: 'Σωρευτικά μέλη και ετήσιες εισδοχές' })}${chartCard('a-trend', 'Ενεργά έναντι ανενεργών', { sub: 'Σωρευτικά ανά έτος' })}</div>
        <div class="grid g3">${chartCard('a-age', 'Κατανομή ηλικιών', { h: 240 })}${chartCard('a-degree', 'Κατανομή βαθμών', { h: 240 })}${chartCard('a-geo', 'Γεωγραφική κατανομή (κατοικία)', { h: 240 })}</div>
        <div class="grid g3">${chartCard('a-prov', 'Κατανομή ανά επαρχία', { h: 240 })}${chartCard('a-office', 'Συμμετοχή αξιωματούχων', { h: 240 })}${chartCard('a-ret', 'Διατήρηση ανά έτος εισδοχής (%)', { h: 240 })}</div>
        <div class="grid g3">${chartCard('a-churn', 'Ανάλυση αποχωρήσεων (churn %)', { h: 240 })}${chartCard('a-p1', 'Εισδοχή → Διέλευση (μήνες)', { h: 240 })}${chartCard('a-p2', 'Διέλευση → Έγερση (μήνες)', { h: 240 })}</div>
        <div class="card"><h3>Ιστορική πρόοδος βαθμών (εισδοχή → έγερση)</h3><p class="sub">Εισδοχή: ${prog.stages.initiated} · Διέλευση: ${prog.stages.passed} · Έγερση: ${prog.stages.raised} · μέσος χρόνος εισδοχή→διέλευση ${prog.avgPass.toFixed(1)} μήν., διέλευση→έγερση ${prog.avgRaise.toFixed(1)} μήν.</p>
          ${dataTable({ caption: 'Πρόοδος βαθμών', cls: 'compact', columns: [{ key: 'registry', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'initiation', label: 'Εισδοχή', type: 'date' }, { key: 'passing', label: 'Διέλευση', type: 'date' }, { key: 'raising', label: 'Έγερση', type: 'date' }, { key: 'toPass', label: 'Μήνες → διέλευση' }, { key: 'toRaise', label: 'Μήνες → έγερση' }], rows: prog.rows.map((r) => ({ ...r, toPass: r.toPass === null ? '' : r.toPass.toFixed(1), toRaise: r.toRaise === null ? '' : r.toRaise.toFixed(1) })), render: { name: (v, r) => `<a href="#/member/${r.id}">${esc(v)}</a>` } })}</div>
        <h3 class="band">Ταμείο</h3>
        <div class="grid g2">${chartCard('a-rev', 'Έσοδα ανά έτος', { sub: 'Εισπράξεις και μεταβολή' })}${chartCard('a-revtrend', 'Τάση εσόδων ανά κατηγορία μέλους')}</div>
        <div class="grid g3">${chartCard('a-debt', 'Κατανομή οφειλών', { h: 240 })}${chartCard('a-comp', `Συμμόρφωση πληρωμών ${f.year}`, { h: 240 })}${chartCard('a-method', 'Έσοδα ανά τρόπο πληρωμής', { h: 240 })}</div>
        <div class="grid g2">${chartCard('a-fc', 'Πρόβλεψη & οικονομικές προβολές', { sub: `Μέσο ποσοστό είσπραξης ${fmtPct(fc.rate)}` })}
          <section class="card"><h3>Οικονομικές προβολές</h3>${dataTable({ caption: 'Προβολές', cls: 'compact', columns: [{ key: 'year', label: 'Έτος' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'forecast', label: 'Πρόβλεψη', type: 'money' }, { key: 'low', label: 'Κατώτερο', type: 'money' }, { key: 'high', label: 'Ανώτερο', type: 'money' }, { key: 'trend', label: 'Τάση', type: 'money' }], rows: fc.rows })}</section></div>
        <div class="card"><h3>Μεγαλύτερες οφειλές</h3>${dataTable({ caption: 'Μεγαλύτερες οφειλές', cls: 'compact', columns: [{ key: 'reg', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'debt', label: 'Οφειλή', type: 'money' }], rows: debt.rows.slice(0, 10).map((r) => ({ id: r.m.id, reg: r.m.registryNumber, name: fullName(r.m), debt: r.debt })), render: { name: (v, r) => `<a href="#/member/${r.id}">${esc(v)}</a>` }, empty: 'Καμία οφειλή.' })}</div>
        <h3 class="band">Ανωμαλίες & ποιότητα δεδομένων</h3>
        <div class="card">${dataTable({ caption: 'Ανίχνευση ανωμαλιών', columns: [{ key: 'severity', label: 'Βαρύτητα' }, { key: 'type', label: 'Τύπος' }, { key: 'text', label: 'Περιγραφή' }, { key: 'memberId', label: '' }], rows: anomalies, empty: 'Δεν εντοπίστηκαν ανωμαλίες.', render: { severity: (v) => badge(v === 'high' ? 'Υψηλή' : v === 'medium' ? 'Μεσαία' : 'Χαμηλή', v === 'high' ? 'bad' : v === 'medium' ? 'warn' : 'neutral'), memberId: (v) => (v ? `<a href="#/member/${v}">Άνοιγμα</a>` : '') } })}</div>
        <h3 class="band">Widgets πραγματικού χρόνου</h3>
        <div class="kpi-grid compact" id="a-live" aria-label="Widgets πραγματικού χρόνου"></div>`;

      // charts
      await host.mount('a-growth', barConfig(growthM.rows.map((r) => r.year), [{ label: 'Νέες εισδοχές', data: growthM.rows.map((r) => r.joined) }, { label: 'Αποχωρήσεις', data: growthM.rows.map((r) => r.left) }]));
      const gc = host.items.get('a-growth').chart; gc.data.datasets.push({ type: 'line', label: 'Σύνολο μελών', data: growthM.rows.map((r) => r.total), borderColor: '#0B1F3A', backgroundColor: '#0B1F3A', yAxisID: 'y1', tension: 0.3 }); gc.options.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false } }; gc.update();
      const inactive = []; let cum = 0; growthM.rows.forEach((r) => { cum += r.left; inactive.push(cum); });
      await host.mount('a-trend', barConfig(growthM.rows.map((r) => r.year), [{ label: 'Ενεργά', data: growthM.rows.map((r, i) => r.total) }, { label: 'Ανενεργά (σωρευτικά)', data: inactive }], { stacked: true }));
      await host.mount('a-age', barConfig(age.labels, [{ label: 'Μέλη', data: age.values }]));
      await host.mount('a-degree', pieConfig(deg.labels, deg.values));
      await host.mount('a-geo', barConfig(res.labels, [{ label: 'Μέλη', data: res.values }], { horizontal: true }));
      await host.mount('a-prov', pieConfig(prov.labels, prov.values));
      await host.mount('a-office', barConfig(off.labels.length ? off.labels : ['—'], [{ label: 'Μέλη', data: off.values.length ? off.values : [0] }], { horizontal: true }));
      await host.mount('a-ret', barConfig(ret.rows.map((r) => r.year), [{ label: 'Διατήρηση %', data: ret.rows.map((r) => round2(r.retention)) }]));
      await host.mount('a-churn', lineConfig(ret.churn.map((r) => r.year), [{ label: 'Churn %', data: ret.churn.map((r) => round2(r.rate)) }]));
      await host.mount('a-p1', barConfig(prog.labels, [{ label: 'Μέλη', data: prog.histPass }]));
      await host.mount('a-p2', barConfig(prog.labels, [{ label: 'Μέλη', data: prog.histRaise }]));
      await host.mount('a-rev', barConfig(years, [{ label: 'Εισπράξεις', data: sums.map((s) => s.paid) }], { money: true }));
      const rg = host.items.get('a-rev').chart; rg.data.datasets.push({ type: 'line', label: 'Μεταβολή % (δεξιά)', data: g.map((v) => (v === null ? null : round2(v))), borderColor: '#0B1F3A', backgroundColor: '#0B1F3A', yAxisID: 'y1' }); rg.options.scales.y1 = { position: 'right', grid: { display: false } }; rg.update();
      await host.mount('a-revtrend', lineConfig(rc.years, rc.series.map((s) => ({ label: CATEGORIES[s.category], data: s.values })), { money: true }));
      await host.mount('a-debt', barConfig(debt.bucketLabels, [{ label: 'Μέλη', data: debt.bucketValues }]));
      await host.mount('a-comp', pieConfig(['Εμπρόθεσμα', 'Εκπρόθεσμα', 'Μερικά', 'Απλήρωτα'], [cmp.onTime, cmp.late, cmp.partial, cmp.unpaid]));
      const byM = {}; store.ledger.filter((p) => p.date?.startsWith(String(f.year)) && scope.some((m) => m.id === p.memberId)).forEach((p) => { byM[p.method] = (byM[p.method] || 0) + p.amount; });
      await host.mount('a-method', pieConfig(Object.keys(byM).map((k) => ({ bank: 'Τράπεζα', cash: 'Μετρητά', card: 'Κάρτα', other: 'Άλλο' }[k] || k)), Object.values(byM).map(round2)));
      const hist = fc.history; const pad = (a) => [...Array(hist.length).fill(null), ...a];
      await host.mount('a-fc', lineConfig([...hist.map((h) => h.year), ...fc.rows.map((r) => r.year)], [{ label: 'Πραγματικά', data: [...hist.map((h) => h.paid), ...fc.rows.map(() => null)] }, { label: 'Πρόβλεψη', data: pad(fc.rows.map((r) => r.forecast)), borderDash: [6, 4] }, { label: 'Τάση', data: pad(fc.rows.map((r) => r.trend)), borderDash: [2, 4] }, { label: 'Άνω όριο', data: pad(fc.rows.map((r) => r.high)), borderWidth: 1, pointRadius: 0 }, { label: 'Κάτω όριο', data: pad(fc.rows.map((r) => r.low)), borderWidth: 1, pointRadius: 0 }], { money: true }));
      tick();
    }

    function tick() {
      const live = root.querySelector('#a-live'); if (!live || !model) return;
      const now = new Date();
      live.innerHTML = [kpiCard({ label: 'Ώρα συστήματος', value: now.toLocaleTimeString('el-GR'), sub: now.toLocaleDateString('el-GR'), ic: 'calendar' }),
        kpiCard({ label: 'Μέλη στο φίλτρο', value: fmtNum(model.ex.scope.length), ic: 'users' }),
        kpiCard({ label: 'Κινήσεις ταμείου', value: fmtNum(store.ledger.length), sub: `τελευταία αποθήκευση ${store.lastSaved ? store.lastSaved.toLocaleTimeString('el-GR') : '—'}`, ic: 'coins' }),
        kpiCard({ label: 'Μηχανή αναζήτησης', value: app.engine.mode === 'worker' ? 'Web Worker' : 'Τοπική', sub: app.engine.reason || `${app.engine.lastMs.toFixed(1)} ms`, ic: 'search' })].join('');
    }
    const timer = setInterval(tick, 1000);

    /* ----------------------------- exports ----------------------------- */
    function tables() {
      const m = model; const T = (title, columns, rows) => ({ title, sheet: title, columns, rows });
      return [
        T('KPI', [{ key: 'k', label: 'Δείκτης' }, { key: 'v', label: 'Τιμή' }], [['Ενεργά μέλη', m.ex.counts.active], [`Έσοδα ${f.year}`, m.ex.summary.paid], ['Ποσοστό είσπραξης %', round2(m.ex.summary.collectionRate)], ['Εκκρεμείς οφειλές', m.ex.debt], ['Διατήρηση %', round2(m.ret.overall)], ['Συμμετοχή σε αξιώματα %', round2(m.off.rate)], ['Μέση ηλικία', round2(m.age.average)]].map(([k, v]) => ({ k, v }))),
        T('Ανάπτυξη μελών', [{ key: 'year', label: 'Έτος' }, { key: 'joined', label: 'Εισδοχές', type: 'number' }, { key: 'left', label: 'Αποχωρήσεις', type: 'number' }, { key: 'total', label: 'Σύνολο', type: 'number' }], m.growthM.rows),
        T('Ηλικίες', [{ key: 'l', label: 'Ηλικία' }, { key: 'v', label: 'Μέλη', type: 'number' }], m.age.labels.map((l, i) => ({ l, v: m.age.values[i] }))),
        T('Βαθμοί', [{ key: 'l', label: 'Βαθμός' }, { key: 'v', label: 'Μέλη', type: 'number' }], m.deg.labels.map((l, i) => ({ l, v: m.deg.values[i] }))),
        T('Γεωγραφία', [{ key: 'l', label: 'Τόπος' }, { key: 'v', label: 'Μέλη', type: 'number' }], m.res.labels.map((l, i) => ({ l, v: m.res.values[i] }))),
        T('Έσοδα ανά έτος', [{ key: 'year', label: 'Έτος' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'paid', label: 'Εισπράξεις', type: 'money' }, { key: 'outstanding', label: 'Οφειλές', type: 'money' }, { key: 'collectionRate', label: 'Είσπραξη', type: 'percent' }], m.sums),
        T('Διατήρηση', [{ key: 'year', label: 'Έτος εισδοχής' }, { key: 'joined', label: 'Εισήλθαν', type: 'number' }, { key: 'active', label: 'Ενεργά', type: 'number' }, { key: 'retention', label: 'Διατήρηση', type: 'percent' }], m.ret.rows),
        T('Πρόβλεψη', [{ key: 'year', label: 'Έτος' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'forecast', label: 'Πρόβλεψη', type: 'money' }, { key: 'low', label: 'Κατώτερο', type: 'money' }, { key: 'high', label: 'Ανώτερο', type: 'money' }], m.fc.rows),
        T('Ανωμαλίες', [{ key: 'severity', label: 'Βαρύτητα' }, { key: 'type', label: 'Τύπος' }, { key: 'text', label: 'Περιγραφή' }], m.anomalies),
      ];
    }
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ax]'); if (!b) return;
      if (!app.guard('export')) return;
      try {
        const kind = b.dataset.ax; const name = `analytics-${stamp().slice(0, 10)}`;
        if (kind === 'xlsx') await exportXLSX(tables(), name);
        else if (kind === 'png') { const items = host.all().map((i) => ({ chart: i.chart, title: i.title })); download(dataURLtoBlob(montageDataURL(items, `${store.settings.lodge.fullName} — Analytics ${f.year}`)), `${name}.png`); } else if (kind === 'pdf') {
          const doc = await tableToPDF({ title: `Analytics ${f.year}`, subtitle: store.settings.lodge.fullName, columns: [], rows: [], summary: [['Ενεργά μέλη', model.ex.counts.active], ['Έσοδα', fmtMoney(model.ex.summary.paid)], ['Είσπραξη', fmtPct(model.ex.summary.collectionRate)], ['Οφειλές', fmtMoney(model.ex.debt)]] }, { orientation: 'landscape', images: host.all().map((i) => ({ title: i.title, dataUrl: chartDataURL(i.chart), w: 140, h: 58 })) });
          doc.save(`${name}.pdf`);
        }
        toast('Η εξαγωγή ολοκληρώθηκε.', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
    root.querySelector('#a-filters').addEventListener('change', (e) => {
      const map = { 'f-year': 'year', 'f-degree': 'degree', 'f-province': 'province', 'f-office': 'office', 'f-status': 'status', 'f-category': 'category' };
      if (map[e.target.id]) { f[map[e.target.id]] = e.target.id === 'f-year' ? +e.target.value : e.target.value; paint(); }
    });
    root.querySelector('#f-reset').addEventListener('click', () => { Object.assign(f, { year: asOf, degree: '', province: '', office: '', status: '', category: '' }); app.refresh(); });
    root.querySelector('#a-filters').addEventListener('submit', (e) => e.preventDefault());

    const off = store.subscribe((type) => { if (/ledger|reset|bulk|member|settings/.test(type)) paint(); });
    await paint();
    return () => { clearInterval(timer); off(); };
  },
};
