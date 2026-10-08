/** Helpers shared by views: chart cards, filters, table model for charts. */
import { esc, download, stamp } from '../utils.js';
import { icon, dataTable } from '../ui.js';
import { chartDataURL, dataURLtoBlob } from '../charts.js';

export const chartCard = (id, title, { cls = '', sub = '', h = 280 } = {}) => `<section class="card chart-card ${cls}" aria-labelledby="${id}-h">
  <header class="card-head"><div><h3 id="${id}-h">${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
  <div class="card-actions"><button type="button" class="icon-btn" data-png="${id}" aria-label="Εξαγωγή PNG: ${esc(title)}" title="Εξαγωγή PNG">${icon('image', { size: 18 })}</button><button type="button" class="icon-btn" data-tbl="${id}" aria-expanded="false" aria-label="Πίνακας δεδομένων: ${esc(title)}" title="Πίνακας δεδομένων">${icon('file', { size: 18 })}</button></div></header>
  <div class="chart-box" style="height:${h}px"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div><div id="${id}-tbl" class="chart-tbl" hidden></div></section>`;

/** Registry of mounted charts for a view root (id → {chart,title}). */
export class ChartHost {
  constructor(app, root) { this.app = app; this.root = root; this.items = new Map(); root.addEventListener('click', (e) => this.onClick(e)); }

  async mount(id, config, title) {
    const canvas = this.root.querySelector(`#${id}`); if (!canvas) return null;
    const chart = await this.app.charts.create(canvas, config);
    const t = title || this.root.querySelector(`#${id}-h`)?.textContent || id;
    this.items.set(id, { chart, title: t });
    canvas.setAttribute('aria-label', `${t}: ${summarize(config)}`);
    const tbl = this.root.querySelector(`#${id}-tbl`); if (tbl) tbl.innerHTML = chartTable(config, t);
    return chart;
  }

  onClick(e) {
    const png = e.target.closest('[data-png]'); const tb = e.target.closest('[data-tbl]');
    if (png) { const it = this.items.get(png.dataset.png); if (it) download(dataURLtoBlob(chartDataURL(it.chart)), `${it.title.replace(/\s+/g, '_')}-${stamp().slice(0, 10)}.png`); }
    if (tb) { const box = this.root.querySelector(`#${tb.dataset.tbl}-tbl`); box.hidden = !box.hidden; tb.setAttribute('aria-expanded', String(!box.hidden)); }
  }
  all() { return [...this.items.entries()].map(([id, v]) => ({ id, ...v })); }
}

function summarize(cfg) {
  const d = cfg.data; const labels = d.labels || []; const ds = d.datasets?.[0]?.data || [];
  return labels.slice(0, 6).map((l, i) => `${l}: ${ds[i] ?? ''}`).join(', ') + (labels.length > 6 ? '…' : '');
}

/** Accessible alternative: chart values as table. */
export function chartTable(cfg, title) {
  const d = cfg.data; const labels = d.labels || [];
  const sets = d.datasets || [];
  const cols = [{ key: 'label', label: '' }, ...sets.map((s, i) => ({ key: `s${i}`, label: s.label || title }))];
  const rows = labels.map((l, i) => { const r = { label: l }; sets.forEach((s, k) => { r[`s${k}`] = typeof s.data[i] === 'object' && s.data[i] !== null ? s.data[i].y : s.data[i]; }); return r; });
  return dataTable({ columns: cols, rows, caption: `Δεδομένα: ${title}`, cls: 'compact' });
}

export const yearOptions = (years, sel) => years.map((y) => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`).join('');

export function exportMenu(id, formats = ['pdf', 'xlsx', 'csv', 'print']) {
  const L = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV', print: 'Εκτύπωση', png: 'PNG', json: 'JSON' };
  return formats.map((f) => `<button type="button" class="btn sm" data-export="${f}" data-for="${id}">${icon(f === 'print' ? 'print' : 'download', { size: 15 })} ${L[f]}</button>`).join('');
}
