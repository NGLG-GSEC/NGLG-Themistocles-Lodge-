/**
 * Shared helpers: DOM, formatting, Greek text normalisation, dates, CSV, maths.
 * @module utils
 */

/** @param {string} s @param {ParentNode} [r] */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape a value for safe HTML interpolation. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const sum = (a, f = (x) => x) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);
export const avg = (a, f) => (a.length ? sum(a, f) / a.length : 0);
export const pct = (a, b) => (b ? (a / b) * 100 : 0);

/** Debounce with flush/cancel helpers. */
export function debounce(fn, ms = 200) {
  let t = null; let last = null;
  const d = (...args) => { last = args; clearTimeout(t); t = setTimeout(() => { t = null; fn(...last); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...last); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

/** Memoize with a bounded Map cache. */
export function memoize(fn, keyFn = (...a) => JSON.stringify(a), max = 200) {
  const cache = new Map();
  const m = (...args) => {
    const k = keyFn(...args);
    if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
    const v = fn(...args);
    cache.set(k, v);
    if (cache.size > max) cache.delete(cache.keys().next().value);
    return v;
  };
  m.clear = () => cache.clear();
  return m;
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

/* ------------------------------ text ------------------------------ */
export const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
/** Lowercase, accent-free, final-sigma-free text used for matching. */
export const normText = (s) => stripAccents(s).toLowerCase().replace(/ς/g, 'σ').trim();
/** Uppercase Greek without accents (e.g. "Πανάγος" → "ΠΑΝΑΓΟΣ"). */
export const toUpperGreek = (s) => stripAccents(String(s ?? '').toUpperCase()).trim();
export const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const GR2LAT = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'u', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
/** Transliterate normalised Greek text to a Latin "greeklish" skeleton (so "kreouzis" finds ΚΡΕΟΥΖΗΣ). */
export const greeklish = (s) => normText(s).replace(/[α-ω]/g, (c) => GR2LAT[c] ?? c);

/* ----------------------------- phone / email ----------------------------- */
export const digits = (s) => String(s ?? '').replace(/\D/g, '');
/** Canonical phone key: last 10 digits (strips +30 / 0030). */
export function phoneKey(s) {
  let d = digits(s);
  if (d.startsWith('0030')) d = d.slice(4); else if (d.startsWith('30') && d.length === 12) d = d.slice(2);
  return d.length >= 10 ? d.slice(-10) : d;
}
/** Format a Greek phone number: +30 697 799 9137 / +30 210 123 4567. */
export function formatPhone(s) {
  const k = phoneKey(s);
  if (k.length === 10 && /^[26]/.test(k)) return `+30 ${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6)}`;
  return k;
}
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s) => EMAIL_RE.test(String(s ?? '').trim());

/* ------------------------------- dates ------------------------------- */
const pad = (n) => String(n).padStart(2, '0');
export function validYMD(y, m, d) {
  if (y < 1850 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/**
 * Normalise Date | Excel serial | string (dd/mm/yyyy, dd.mm.yy, yyyy-mm-dd …) to ISO `YYYY-MM-DD`.
 * @returns {string} '' when empty, null when unparseable
 */
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const r = new Date(v.getTime() + 12 * 3600 * 1000); // absorb SheetJS timezone drift
    return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let y = +m[3]; if (m[3].length === 2) y += y <= 40 ? 2000 : 1900;
    return validYMD(y, +m[2], +m[1]) ? `${y}-${pad(+m[2])}-${pad(+m[1])}` : null;
  }
  if (/^\d{5}$/.test(s)) return toISODate(Number(s));
  return null;
}
export const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const yearOf = (iso) => { const m = /^(\d{4})/.exec(iso || ''); return m ? +m[1] : null; };
export const todayISO = () => toISODate(new Date());
export const monthsBetween = (a, b) => {
  if (!a || !b) return null;
  const A = new Date(a), B = new Date(b);
  return (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth()) + (B.getDate() - A.getDate()) / 30;
};

/* ------------------------------ numbers ------------------------------ */
const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const NUM = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 });
export const fmtMoney = (n) => EUR.format(Number.isFinite(+n) ? +n : 0);
export const fmtNum = (n) => NUM.format(Number.isFinite(+n) ? +n : 0);
export const fmtPct = (n, d = 1) => `${(Number.isFinite(+n) ? +n : 0).toFixed(d).replace('.', ',')}%`;
/** Parse "1.234,50" / "1234.5" / "€ 300" to a number (NaN when invalid). */
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').replace(/[€\s]/g, '');
  if (!t) return NaN;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
}

/** Least squares linear regression. Returns slope, intercept, r2 and a predictor. */
export function linreg(ys, xs = ys.map((_, i) => i)) {
  const n = ys.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0, predict: () => 0 };
  if (n === 1) return { slope: 0, intercept: ys[0], r2: 0, predict: () => ys[0] };
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxx ? sxy / sxx : 0; const intercept = my - slope * mx;
  return { slope, intercept, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0, predict: (x) => intercept + slope * x };
}
export const stddev = (a) => { const m = avg(a); return Math.sqrt(avg(a, (x) => (x - m) ** 2)); };

/* -------------------------------- CSV -------------------------------- */
export function toCSV(rows, delimiter = ';') {
  const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r,\t]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(q).join(delimiter)).join('\r\n');
}
/** RFC-4180 CSV parser with delimiter auto-detection. */
export function parseCSV(text, delimiter) {
  text = String(text ?? '').replace(/^﻿/, '');
  if (!delimiter) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = [';', ',', '\t', '|'].map((d) => [d, first.split(d).length]);
    delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows = []; let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Trigger a browser download for a Blob / string. */
export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
export const fullName = (m) => `${m.lastName || ''} ${m.firstName || ''}`.trim();
export const initials = (m) => `${(m.lastName || '?')[0]}${(m.firstName || '')[0] || ''}`.toUpperCase();
export const age = (m, asOf = new Date().getFullYear()) => (m.birthYear ? asOf - m.birthYear : null);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Load a classic script once (used for vendor libs). */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => { loaded.delete(src); rej(new Error(`Δεν φορτώθηκε το ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}
