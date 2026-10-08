/**
 * Export engine: XLSX (SheetJS), CSV, JSON, PDF (jsPDF with embedded Greek font) and printing.
 * A "table" is `{ title, subtitle?, columns:[{key,label,type?:'text'|'money'|'number'|'percent'|'date',width?}], rows:[object], summary?:[[label,value]] }`.
 * @module exporter
 */
import { toCSV, download, loadScript, fmtMoney, fmtNum, fmtPct, fmtDate, esc, stamp } from './utils.js';
import { getXLSX } from './importer.js';
import { DEGREES, CATEGORIES, STATUSES } from './config.js';

export const MEMBER_COLUMNS = [
  { key: 'registryNumber', label: 'Αρ. Μητρώου' }, { key: 'lastName', label: 'Επώνυμο' }, { key: 'firstName', label: 'Όνομα' },
  { key: 'birthYear', label: 'Έτος Γεν.', type: 'plain' }, { key: 'fatherName', label: 'Όνομα Πατρός' }, { key: 'category', label: 'Κατηγορία' },
  { key: 'mobilePhone', label: 'Κινητό' }, { key: 'email', label: 'Email' }, { key: 'initiationDate', label: 'Εισδοχή', type: 'date' },
  { key: 'passingDate', label: 'Διέλευση', type: 'date' }, { key: 'raisingDate', label: 'Έγερση', type: 'date' }, { key: 'residence', label: 'Κατοικία' },
  { key: 'degree', label: 'Βαθμός' }, { key: 'office', label: 'Αξίωμα' }, { key: 'notes', label: 'Παρατηρήσεις' },
  { key: 'lodgeNumber', label: 'Στοά Αρ.', type: 'plain' }, { key: 'lodgeName', label: 'Στοά' }, { key: 'province', label: 'Επαρχία' }, { key: 'statusLabel', label: 'Κατάσταση' },
];

export const memberRows = (members) => members.map((m) => ({ ...m, statusLabel: STATUSES[m.status] || m.status }));

/** Format a cell for textual output (CSV/PDF/print). */
export function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  switch (col.type) {
    case 'money': return fmtMoney(v);
    case 'number': return fmtNum(v);
    case 'percent': return fmtPct(v);
    case 'date': return fmtDate(v);
    default: return String(v);
  }
}

/** Raw value for spreadsheets (numbers stay numbers). */
function cellRaw(col, v) {
  if (v === null || v === undefined) return '';
  if (['money', 'number', 'percent'].includes(col.type)) return Number.isFinite(+v) ? +v : v;
  if (col.type === 'date') return fmtDate(v);
  return v;
}

/* --------------------------------- CSV --------------------------------- */
export function tableToCSV(t, delimiter = ';') {
  const rows = [t.columns.map((c) => c.label), ...t.rows.map((r) => t.columns.map((c) => cellText(c, r[c.key])))];
  return `﻿${toCSV(rows, delimiter)}`;
}
export function exportCSV(t, filename, delimiter = ';') { download(tableToCSV(t, delimiter), `${filename}.csv`, 'text/csv;charset=utf-8'); }

/* --------------------------------- XLSX --------------------------------- */
/** Build a workbook (array buffer) from one or more tables. */
export async function tablesToXLSX(tables) {
  const XLSX = await getXLSX(); const wb = XLSX.utils.book_new(); const used = new Set();
  for (const t of tables) {
    const aoa = [t.columns.map((c) => c.label), ...t.rows.map((r) => t.columns.map((c) => cellRaw(c, r[c.key])))];
    if (t.summary?.length) { aoa.push([]); for (const [k, v] of t.summary) aoa.push([k, v]); }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = t.columns.map((c, i) => ({ wch: Math.min(48, Math.max(c.label.length + 2, ...t.rows.slice(0, 200).map((r) => String(cellText(c, r[c.key])).length + 2), 8)) }));
    let name = (t.sheet || t.title || 'Φύλλο').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Φύλλο'; let n = 2; const base = name;
    while (used.has(name)) name = `${base.slice(0, 28)} ${n++}`;
    used.add(name); XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
export async function exportXLSX(tables, filename) {
  const buf = await tablesToXLSX(Array.isArray(tables) ? tables : [tables]);
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

export function exportJSON(obj, filename) { download(JSON.stringify(obj, null, 2), `${filename}.json`, 'application/json'); }

/* --------------------------------- PDF --------------------------------- */
let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`Δεν φορτώθηκε η γραμματοσειρά ${u}`); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  fontCache = Promise.all([get('assets/fonts/DejaVuSans-subset.ttf'), get('assets/fonts/DejaVuSans-Bold-subset.ttf')]).catch((e) => { fontCache = null; throw e; });
  return fontCache;
}

async function newPdf(orientation = 'landscape') {
  if (!globalThis.jspdf) await loadScript('assets/vendor/jspdf.umd.min.js');
  const doc = new globalThis.jspdf.jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  try {
    const [reg, bold] = await loadFonts();
    doc.addFileToVFS('DejaVuSans.ttf', reg); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
    doc.setFont('DejaVu', 'normal'); doc.fontReady = true;
  } catch (e) { console.warn('PDF font fallback (no Greek glyphs):', e); doc.setFont('helvetica', 'normal'); doc.fontReady = false; }
  return doc;
}

const NAVY = [11, 31, 58]; const GOLD = [212, 175, 55];

function pdfHeader(doc, lodge, title, subtitle) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 20, 'F'); doc.setFillColor(...GOLD); doc.rect(0, 20, W, 1.2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('DejaVu', 'bold'); doc.setFontSize(13); doc.text(title, 10, 9);
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(230, 220, 170);
  doc.text(subtitle || lodge, 10, 15);
  doc.text(new Date().toLocaleDateString('el-GR'), W - 10, 9, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

/**
 * Render a table (plus optional chart images and summary) to a PDF document.
 * @param {object} t table
 * @param {{lodge?:string, orientation?:string, images?:{title?:string, dataUrl:string, w?:number, h?:number}[]}} [o]
 * @returns {Promise<any>} jsPDF document
 */
export async function tableToPDF(t, o = {}) {
  const doc = await newPdf(o.orientation || (t.columns.length > 6 ? 'landscape' : 'portrait'));
  const lodge = o.lodge || 'Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96';
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 10;
  let y = 28; pdfHeader(doc, lodge, t.title, t.subtitle);
  const ensure = (h) => { if (y + h > H - 14) { doc.addPage(); pdfHeader(doc, lodge, t.title, t.subtitle); y = 28; return true; } return false; };

  if (t.summary?.length) {
    doc.setFontSize(9);
    const cols = Math.min(4, t.summary.length); const cw = (W - 2 * M) / cols;
    t.summary.forEach(([k, v], i) => {
      const cx = M + (i % cols) * cw; const cy = y + Math.floor(i / cols) * 13;
      doc.setFillColor(245, 240, 220); doc.roundedRect(cx, cy, cw - 3, 11, 1.5, 1.5, 'F');
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 90, 90); doc.text(String(k), cx + 2, cy + 4);
      doc.setFont('DejaVu', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(String(v), cx + 2, cy + 9);
    });
    y += Math.ceil(t.summary.length / cols) * 13 + 3; doc.setTextColor(0, 0, 0);
  }

  for (const img of o.images || []) {
    const w = img.w || W - 2 * M; const h = img.h || w * 0.42; ensure(h + 8);
    if (img.title) { doc.setFont('DejaVu', 'bold'); doc.setFontSize(10); doc.text(img.title, M, y + 3); y += 5; }
    doc.addImage(img.dataUrl, 'PNG', M, y, w, h); y += h + 6;
  }

  if (t.columns.length && t.rows.length) {
    doc.setFontSize(7.5);
    const usable = W - 2 * M; doc.setFont('DejaVu', 'normal');
    const raw = t.columns.map((c) => Math.max(doc.getTextWidth(c.label) + 4, ...t.rows.slice(0, 60).map((r) => Math.min(60, doc.getTextWidth(cellText(c, r[c.key])) + 4)), 10));
    const total = raw.reduce((a, b) => a + b, 0); const widths = raw.map((w) => (w / total) * usable);
    const drawHead = () => {
      doc.setFillColor(...NAVY); doc.rect(M, y, usable, 7, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('DejaVu', 'bold');
      let x = M; t.columns.forEach((c, i) => { const right = ['money', 'number', 'percent'].includes(c.type); doc.text(c.label, right ? x + widths[i] - 1.5 : x + 1.5, y + 4.7, { align: right ? 'right' : 'left', maxWidth: widths[i] - 3 }); x += widths[i]; });
      y += 7; doc.setTextColor(0, 0, 0); doc.setFont('DejaVu', 'normal');
    };
    drawHead();
    t.rows.forEach((r, ri) => {
      const cells = t.columns.map((c, i) => doc.splitTextToSize(cellText(c, r[c.key]), widths[i] - 3));
      const lines = Math.max(1, ...cells.map((c) => c.length)); const rh = lines * 3.3 + 2.4;
      if (ensure(rh + 2)) drawHead();
      if (ri % 2) { doc.setFillColor(247, 248, 251); doc.rect(M, y, usable, rh, 'F'); }
      let x = M;
      cells.forEach((lns, i) => { const right = ['money', 'number', 'percent'].includes(t.columns[i].type); doc.text(lns, right ? x + widths[i] - 1.5 : x + 1.5, y + 3.7, { align: right ? 'right' : 'left' }); x += widths[i]; });
      doc.setDrawColor(225, 228, 235); doc.line(M, y + rh, M + usable, y + rh); y += rh;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont('DejaVu', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(`${lodge} · TAMEIO THEMISTOCLES 96`, M, H - 6); doc.text(`Σελίδα ${p} / ${pages}`, W - M, H - 6, { align: 'right' });
  }
  return doc;
}

export async function exportPDF(t, filename, o) { const doc = await tableToPDF(t, o); doc.save(`${filename}.pdf`); return doc; }

/* -------------------------------- print -------------------------------- */
/** Print a table through a hidden iframe (browser "Save as PDF" works too). */
export function printTable(t, lodge = 'Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96') {
  const head = t.columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = t.rows.map((r) => `<tr>${t.columns.map((c) => `<td class="${['money', 'number', 'percent'].includes(c.type) ? 'r' : ''}">${esc(cellText(c, r[c.key]))}</td>`).join('')}</tr>`).join('');
  const sum = (t.summary || []).map(([k, v]) => `<div class="k"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>${esc(t.title)}</title><style>
    body{font:11px/1.35 "Segoe UI",Arial,sans-serif;color:#111;margin:16px}h1{font-size:16px;margin:0;color:#0B1F3A}h2{font-size:11px;margin:2px 0 10px;color:#7a6420;font-weight:400}
    .bar{border-bottom:3px solid #D4AF37;margin-bottom:8px}.k{display:inline-block;margin:0 8px 8px 0;padding:5px 9px;background:#f6f1de;border-radius:4px}.k span{display:block;font-size:9px;color:#555}
    table{border-collapse:collapse;width:100%}th{background:#0B1F3A;color:#fff;text-align:left;padding:4px 5px;font-size:10px}td{border-bottom:1px solid #ddd;padding:3px 5px;vertical-align:top}td.r{text-align:right}tr:nth-child(even) td{background:#f7f8fb}
    @page{size:A4 landscape;margin:10mm}</style></head><body><div class="bar"><h1>${esc(t.title)}</h1><h2>${esc(t.subtitle || lodge)} — ${new Date().toLocaleDateString('el-GR')}</h2></div>${sum}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f); f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 2000); } }, 250);
}

/** Dispatch an export in the given format. */
export async function exportAs(format, t, filename, { delimiter = ';', pdf } = {}) {
  const name = `${filename}-${stamp().slice(0, 10)}`;
  if (format === 'xlsx') return exportXLSX(t, name);
  if (format === 'csv') return exportCSV(t, name, delimiter);
  if (format === 'pdf') return exportPDF(t, name, pdf);
  if (format === 'json') return exportJSON(t.rows, name);
  if (format === 'print') return printTable(t);
  throw new Error(`Άγνωστη μορφή ${format}`);
}

export const labelOf = { degree: (v) => DEGREES[v]?.label || v, category: (v) => CATEGORIES[v] || v, status: (v) => STATUSES[v] || v };
