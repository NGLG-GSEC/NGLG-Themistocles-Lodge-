/** Test & diagnostics dashboard. */
import { esc, download, stamp, fmtNum } from '../utils.js';
import { icon, sectionHead, kpiCard, toast, announce } from '../ui.js';
import { SUITES, runSuites } from '../tests.js';
import { exportJSON } from '../exporter.js';

export default {
  id: 'tests', title: 'Δοκιμές & Διαγνωστικά',
  async render(root, app) {
    let results = []; let running = false;
    const summary = () => {
      const pass = results.filter((r) => r.ok).length; const fail = results.length - pass;
      return { pass, fail, total: SUITES.reduce((a, s) => a + s.tests.length, 0) };
    };
    function paint() {
      const s = summary();
      root.innerHTML = `${sectionHead('Δοκιμές & Διαγνωστικά', `<button class="btn primary" id="t-all" ${running ? 'disabled' : ''}>${icon('flask', { size: 16 })} Run All Tests</button>${results.length ? `<button class="btn" id="t-export">${icon('download', { size: 15 })} Εξαγωγή αποτελεσμάτων</button>` : ''}`, `${s.total} αυτοματοποιημένοι έλεγχοι σε ${SUITES.length} ομάδες · εκτελούνται στον περιηγητή σας`)}
        <div class="kpi-grid compact" aria-live="polite">${kpiCard({ label: 'Σύνολο ελέγχων', value: s.total, ic: 'flask' })}${kpiCard({ label: 'Επιτυχίες', value: s.pass, ic: 'check', tone: 'good' })}${kpiCard({ label: 'Αποτυχίες', value: s.fail, ic: 'alert', tone: s.fail ? 'bad' : '' })}${kpiCard({ label: 'Εκτελέστηκαν', value: results.length, sub: running ? 'σε εξέλιξη…' : results.length ? 'ολοκληρώθηκε' : 'δεν έχει εκτελεστεί', ic: 'chart' })}</div>
        ${running || results.length ? `<div class="progress" role="progressbar" aria-label="Πρόοδος δοκιμών" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${results.length}"><div style="width:${(results.length / s.total) * 100}%"></div></div>` : ''}
        <div class="grid g2">${SUITES.map((su) => {
          const rs = results.filter((r) => r.suite === su.id); const bad = rs.filter((r) => !r.ok).length;
          return `<section class="card suite" aria-labelledby="su-${su.id}"><header class="card-head"><div><h3 id="su-${su.id}">${esc(su.name)}</h3><p class="sub">${rs.length ? `${rs.length - bad}/${su.tests.length} επιτυχίες` : `${su.tests.length} έλεγχοι`}</p></div><button class="btn sm" data-suite="${su.id}" ${running ? 'disabled' : ''}>Εκτέλεση</button></header>
            <ul class="tests">${su.tests.map(([name]) => { const r = rs.find((x) => x.name === name); return `<li class="${r ? (r.ok ? 'pass' : 'fail') : 'idle'}"><span class="mark" aria-hidden="true">${r ? (r.ok ? '✔' : '✖') : '○'}</span><div><span>${esc(name)}</span><span class="sr-only"> — ${r ? (r.ok ? 'επιτυχία' : 'αποτυχία') : 'δεν εκτελέστηκε'}</span>${r ? `<small class="dim"> ${r.ms.toFixed(0)} ms${r.note ? ` · ${esc(r.note)}` : ''}</small>` : ''}${r && !r.ok ? `<div class="err">${esc(r.error)}</div>` : ''}</div></li>`; }).join('')}</ul></section>`;
        }).join('')}</div>
        <section class="card" aria-labelledby="env-h"><h3 id="env-h">Περιβάλλον</h3><dl class="dl">${[['Περιηγητής', navigator.userAgent], ['Ασφαλές περιβάλλον', String(window.isSecureContext)], ['Σύνδεση', navigator.onLine ? 'Online' : 'Offline'], ['Service Worker', 'serviceWorker' in navigator ? 'διαθέσιμος' : 'μη διαθέσιμος'], ['Web Worker', typeof Worker !== 'undefined' ? 'διαθέσιμο' : 'μη διαθέσιμο'], ['Μηχανή αναζήτησης', `${app.engine.mode}${app.engine.reason ? ` (${app.engine.reason})` : ''}`], ['Χώρος αποθήκευσης δεδομένων', `${fmtNum(app.store.usage() / 1024)} KB`]].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>`;
    }
    async function run(only) {
      if (running) return; running = true; results = only ? results.filter((r) => !only.includes(r.suite)) : []; paint();
      const fresh = await runSuites(only, (r) => { results.push(r); if (results.length % 3 === 0) paint(); });
      running = false; results = [...results.filter((r) => !fresh.includes(r))]; fresh.forEach((r) => results.push(r)); paint();
      const s = summary(); announce(`Ολοκληρώθηκαν οι δοκιμές: ${s.pass} επιτυχίες, ${s.fail} αποτυχίες`);
      toast(s.fail ? `${s.fail} αποτυχίες από ${results.length}` : `Όλοι οι έλεγχοι πέρασαν (${results.length})`, s.fail ? 'error' : 'success');
      window.__lastTestRun = { pass: s.pass, fail: s.fail, failures: results.filter((r) => !r.ok) };
    }
    root.addEventListener('click', (e) => {
      if (e.target.closest('#t-all')) run(null);
      const su = e.target.closest('[data-suite]'); if (su) run([su.dataset.suite]);
      if (e.target.closest('#t-export')) exportJSON({ at: new Date().toISOString(), results }, `test-results-${stamp()}`);
    });
    paint();
    window.__runAllTests = () => run(null);
    return () => { delete window.__runAllTests; };
  },
};
