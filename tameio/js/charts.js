/**
 * Chart.js wrappers: themed defaults, registry (cleanup between views) and PNG export helpers.
 * @module charts
 */
import { COLORS } from './config.js';
import { loadScript } from './utils.js';

export async function ensureChartJs() {
  if (!globalThis.Chart) await loadScript('assets/vendor/chart.umd.min.js');
  return globalThis.Chart;
}

const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
export const palette = (n) => Array.from({ length: n }, (_, i) => COLORS.series[i % COLORS.series.length]);

export function applyDefaults(Chart) {
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  Chart.defaults.color = css('--muted', '#5b6678');
  Chart.defaults.borderColor = css('--line', '#e3e7ee');
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 };
}

export class ChartRegistry {
  constructor() { this.charts = new Map(); }

  /**
   * Create (or replace) a chart on a canvas.
   * @param {HTMLCanvasElement} canvas @param {object} config Chart.js config
   */
  async create(canvas, config) {
    const Chart = await ensureChartJs(); applyDefaults(Chart);
    const old = this.charts.get(canvas); if (old) old.destroy();
    const chart = new Chart(canvas, config); this.charts.set(canvas, chart);
    return chart;
  }
  get(canvas) { return this.charts.get(canvas); }
  destroyAll() { for (const c of this.charts.values()) c.destroy(); this.charts.clear(); }
}

/** Ready made configs ----------------------------------------------------- */
const money = (v) => `${Number(v).toLocaleString('el-GR')} €`;

export function lineConfig(labels, datasets, { y = {}, money: isMoney = false, fill = false } = {}) {
  const cols = palette(datasets.length);
  return {
    type: 'line',
    data: { labels, datasets: datasets.map((d, i) => ({ tension: 0.3, borderWidth: 2.5, pointRadius: 3, fill: fill && i === 0, backgroundColor: `${cols[i]}22`, borderColor: cols[i], pointBackgroundColor: cols[i], ...d })) },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: isMoney ? { callback: money } : {}, ...y } }, plugins: { tooltip: isMoney ? { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } } : {} } },
  };
}

export function barConfig(labels, datasets, { stacked = false, horizontal = false, money: isMoney = false } = {}) {
  const cols = palette(datasets.length);
  return {
    type: 'bar',
    data: { labels, datasets: datasets.map((d, i) => ({ backgroundColor: cols[i], borderRadius: 4, maxBarThickness: 46, ...d })) },
    options: { indexAxis: horizontal ? 'y' : 'x', scales: { x: { stacked, grid: { display: horizontal } }, y: { stacked, beginAtZero: true, ticks: isMoney && !horizontal ? { callback: money } : {} } }, plugins: { tooltip: isMoney ? { callbacks: { label: (c) => `${c.dataset.label}: ${money(horizontal ? c.parsed.x : c.parsed.y)}` } } : {} } },
  };
}

export function pieConfig(labels, values, { doughnut = true } = {}) {
  return {
    type: doughnut ? 'doughnut' : 'pie',
    data: { labels, datasets: [{ data: values, backgroundColor: palette(values.length), borderColor: css('--card', '#fff'), borderWidth: 2 }] },
    options: { cutout: doughnut ? '62%' : 0, plugins: { legend: { position: 'bottom' } } },
  };
}

/** Export a chart as PNG data URL on an opaque background (so it looks right in PDF/PNG files). */
export function chartDataURL(chart, bg = '#FFFFFF') {
  const c = chart.canvas; const off = document.createElement('canvas'); off.width = c.width; off.height = c.height;
  const ctx = off.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, off.width, off.height); ctx.drawImage(c, 0, 0);
  return off.toDataURL('image/png');
}

/** Compose several charts into a single PNG sheet (2 columns). */
export function montageDataURL(items, title = '') {
  const cols = 2; const cw = 900; const ch = 420; const pad = 24; const head = title ? 70 : 0; const rows = Math.ceil(items.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cw + (cols + 1) * pad; cv.height = head + rows * (ch + 40) + (rows + 1) * pad;
  const g = cv.getContext('2d'); g.fillStyle = '#F3F5F9'; g.fillRect(0, 0, cv.width, cv.height);
  if (title) { g.fillStyle = '#0B1F3A'; g.fillRect(0, 0, cv.width, head); g.fillStyle = '#D4AF37'; g.fillRect(0, head - 4, cv.width, 4); g.fillStyle = '#fff'; g.font = 'bold 28px Segoe UI, Arial'; g.fillText(title, pad, 44); }
  items.forEach((it, i) => {
    const x = pad + (i % cols) * (cw + pad); const y = head + pad + Math.floor(i / cols) * (ch + 40 + pad);
    g.fillStyle = '#fff'; g.fillRect(x, y, cw, ch + 40); g.fillStyle = '#0B1F3A'; g.font = 'bold 18px Segoe UI, Arial'; g.fillText(it.title, x + 14, y + 26);
    const img = it.chart.canvas; const r = Math.min((cw - 20) / img.width, (ch - 10) / img.height);
    g.drawImage(img, x + 10, y + 36, img.width * r, img.height * r);
  });
  return cv.toDataURL('image/png');
}

export function dataURLtoBlob(u) {
  const [h, b] = u.split(','); const mime = /:(.*?);/.exec(h)[1]; const bin = atob(b); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
