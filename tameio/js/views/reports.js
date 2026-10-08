/** Reports: treasurer, annual, membership, debt, revenue, activity, executive, forecast. */
import { YEARS } from '../config.js';
import { esc } from '../utils.js';
import { icon, sectionHead, dataTable, toast } from '../ui.js';
import { REPORTS, getReport } from '../reports.js';
import { exportAs } from '../exporter.js';
import { exportMenu, yearOptions } from './shared.js';

export default {
  id: 'reports', title: 'Αναφορές',
  async render(root, app, params) {
    const { store } = app; let current = params.r || store.ui.report || 'treasurer'; let year = +(params.year || store.ui.treasuryYear || app.asOf);
    const years = [...new Set([...YEARS, ...store.ledger.map((p) => p.year)])].sort();

    root.innerHTML = `${sectionHead('Αναφορές', '', 'Κάθε αναφορά εξάγεται σε PDF, Excel και CSV ή εκτυπώνεται')}
      <div class="reports-layout"><nav class="card report-list" aria-label="Κατάλογος αναφορών"><ul>${REPORTS.map((r) => `<li><button type="button" class="report-item" data-r="${r.id}" aria-current="${r.id === current}"><strong>${esc(r.label)}</strong><span>${esc(r.desc)}</span></button></li>`).join('')}</ul></nav>
      <section class="card" id="rep-pane" aria-live="polite"></section></div>`;

    let table = null;
    function build() {
      const rep = getReport(current); store.setUi('report', current);
      table = rep.build({ members: store.members, ledger: store.ledger, audit: store.state.audit, settings: { ...store.settings, asOfYear: app.asOf }, year });
      root.querySelectorAll('.report-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.r === current)));
      root.querySelector('#rep-pane').innerHTML = `<header class="card-head"><div><h3>${esc(table.title)}</h3><p class="sub">${esc(rep.desc)}</p></div><div class="actions">${rep.needsYear ? `<label class="inline">Έτος <select id="rep-year">${yearOptions(years, year)}</select></label>` : ''}${app.can('export') ? exportMenu('report', ['pdf', 'xlsx', 'csv', 'print']) : ''}</div></header>
        ${table.summary?.length ? `<div class="kpi-grid compact">${table.summary.map(([k, v]) => `<div class="kpi" role="group" aria-label="${esc(k)}"><div class="kpi-label">${esc(k)}</div><div class="kpi-value sm">${esc(v)}</div></div>`).join('')}</div>` : ''}
        ${dataTable({ columns: table.columns, rows: table.rows.slice(0, 300), caption: table.title, cls: 'compact' })}${table.rows.length > 300 ? `<p class="dim">Προεπισκόπηση πρώτων 300 από ${table.rows.length} γραμμών· οι εξαγωγές περιέχουν όλες τις γραμμές.</p>` : ''}`;
    }
    root.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-r]'); if (r) { current = r.dataset.r; build(); return; }
      const ex = e.target.closest('[data-export]');
      if (ex) { if (!app.guard('export')) return; try { await exportAs(ex.dataset.export, table, `anafora-${current}`, { delimiter: store.settings.csvDelimiter }); toast('Η εξαγωγή ολοκληρώθηκε.', 'success'); } catch (err) { toast(err.message, 'error'); } }
    });
    root.addEventListener('change', (e) => { if (e.target.id === 'rep-year') { year = +e.target.value; build(); } });
    build();
    const off = store.subscribe((t) => { if (/ledger|member|reset|bulk/.test(t)) build(); });
    return () => off();
  },
};
