/**
 * Small UI toolkit: icons, toasts, accessible dialogs, form fields, KPI cards, tables, tabs.
 * @module ui
 */
import { esc, fmtMoney, fmtNum, fmtPct, fmtDate, $ } from './utils.js';

const ICONS = {
  dashboard: 'M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z',
  users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  coins: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  flask: 'M9 2h6M10 2v6L4 20a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-12V2M7 15h10',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1V5H9v2L7 8 5 7 3 11l2 1v2l-2 1 2 4 2-1 2 1v2h6v-2l2-1 2 1 2-4-2-1z',
  book: 'M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  restore: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  wifioff: 'M2 8c3-3 6-4 10-4M22 8a15 15 0 0 0-5-3M5 12c2-2 4-3 7-3M19 12a10 10 0 0 0-3-2M9 16c1-1 2-1.5 3-1.5s2 .5 3 1.5M12 20h.01M3 3l18 18',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M5 5l14 14M19 5L5 19',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  flat: 'M5 12h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  save: 'M5 3h12l4 4v14H5zM8 3v6h8V3M8 21v-7h8v7',
  image: 'M3 4h18v16H3zM8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-8 9',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  star: 'M12 3l2.8 6 6.2.8-4.6 4.3 1.2 6.4L12 17.5 6.4 20.5l1.2-6.4L3 9.8 9.2 9z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 8h.01',
};

/** Inline SVG icon (decorative unless `label` is given). */
export function icon(name, { size = 20, label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}><path d="${ICONS[name] || ICONS.info}"/></svg>`;
}

/* -------------------------------- toast -------------------------------- */
export function toast(message, type = 'info', ms = 4200) {
  const host = $('#toasts'); if (!host) return;
  const el = document.createElement('div'); el.className = `toast ${type}`; el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' || type === 'warn' ? 'alert' : type === 'success' ? 'check' : 'info', { size: 18 })}<span>${esc(message)}</span>`;
  host.appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ------------------------------- dialogs ------------------------------- */
/**
 * Open a modal <dialog>. Resolves with the value of the chosen action (or undefined on cancel).
 * @param {{title:string, body:string, actions?:{label:string,value?:any,kind?:string,validate?:(root:HTMLElement)=>boolean|string}[], size?:'sm'|'md'|'lg', onOpen?:(root:HTMLElement,close:(v?:any)=>void)=>void}} o
 */
export function openDialog({ title, body, actions = [{ label: 'Κλείσιμο', value: true, kind: 'primary' }], size = 'md', onOpen, collect }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const dlg = document.createElement('dialog'); dlg.className = `dlg ${size}`; dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `<form method="dialog" class="dlg-in" novalidate><header><h2 id="dlg-title">${esc(title)}</h2><button type="button" class="icon-btn" data-x aria-label="Κλείσιμο">${icon('close')}</button></header>
      <div class="dlg-body">${body}</div><footer>${actions.map((a, i) => `<button type="button" class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer></form>`;
    document.body.appendChild(dlg);
    let done = false;
    const close = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); if (opener?.focus) opener.focus(); resolve(v); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(undefined); });
    dlg.querySelector('[data-x]').addEventListener('click', () => close(undefined));
    dlg.querySelectorAll('footer [data-i]').forEach((b) => b.addEventListener('click', () => {
      const a = actions[+b.dataset.i];
      if (a.validate) { const r = a.validate(dlg); if (r !== true) { showFormError(dlg, r); return; } }
      close(a.collect ? a.collect(dlg) : collect && a.kind === 'primary' ? collect(dlg) : a.value);
    }));
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=file])') && actions.find((a) => a.kind === 'primary')) { e.preventDefault(); dlg.querySelector('footer .primary')?.click(); } });
    dlg.showModal();
    (dlg.querySelector('[autofocus], input:not([type=hidden]), select, textarea') || dlg.querySelector('footer .btn:last-child'))?.focus();
    onOpen?.(dlg, close);
  });
}

export function showFormError(root, msg) {
  let box = root.querySelector('.form-error');
  if (!box) { box = document.createElement('div'); box.className = 'form-error'; box.setAttribute('role', 'alert'); root.querySelector('.dlg-body').prepend(box); }
  box.textContent = typeof msg === 'string' ? msg : 'Ελέγξτε τα πεδία της φόρμας.'; box.scrollIntoView?.({ block: 'nearest' });
}

export const confirmDialog = (message, { title = 'Επιβεβαίωση', ok = 'Ναι', danger = false } = {}) =>
  openDialog({ title, size: 'sm', body: `<p>${esc(message)}</p>`, actions: [{ label: 'Άκυρο', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] }).then((v) => v === true);

/* -------------------------------- forms -------------------------------- */
/** Labeled form control. `type` may be text|email|tel|number|date|select|textarea|checkbox. */
export function field({ id, label, type = 'text', value = '', required = false, options = [], hint = '', attrs = '', wide = false }) {
  const req = required ? ' required aria-required="true"' : '';
  const hid = hint ? ` aria-describedby="${id}-h"` : '';
  let ctl;
  if (type === 'select') ctl = `<select id="${id}" name="${id}"${req}${hid} ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (type === 'textarea') ctl = `<textarea id="${id}" name="${id}" rows="3"${req}${hid} ${attrs}>${esc(value)}</textarea>`;
  else if (type === 'checkbox') return `<div class="field check${wide ? ' wide' : ''}"><label><input type="checkbox" id="${id}" name="${id}" ${value ? 'checked' : ''} ${attrs}> ${esc(label)}</label></div>`;
  else ctl = `<input id="${id}" name="${id}" type="${type}" value="${esc(value)}"${req}${hid} ${attrs}>`;
  return `<div class="field${wide ? ' wide' : ''}"><label for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true"> *</span>' : ''}</label>${ctl}${hint ? `<small id="${id}-h">${esc(hint)}</small>` : ''}</div>`;
}

/* ------------------------------ components ------------------------------ */
export const badge = (text, tone = 'neutral') => `<span class="badge ${tone}">${esc(text)}</span>`;

export function trendBadge(direction, text) {
  const t = direction === 'up' ? 'good' : direction === 'down' ? 'bad' : 'neutral';
  return `<span class="trend ${t}">${icon(direction === 'flat' ? 'flat' : direction, { size: 14 })}<span>${esc(text)}</span><span class="sr-only">${direction === 'up' ? 'αύξηση' : direction === 'down' ? 'μείωση' : 'σταθερό'}</span></span>`;
}

export function kpiCard({ label, value, sub = '', trend = null, tone = '', ic = 'star', href = '' }) {
  const inner = `<div class="kpi-top"><span class="kpi-ic">${icon(ic, { size: 18 })}</span><span class="kpi-label">${esc(label)}</span></div><div class="kpi-value">${esc(value)}</div><div class="kpi-sub">${trend ? trendBadge(trend.direction, trend.text) : ''}${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  return href ? `<a class="kpi ${tone}" href="${href}">${inner}</a>` : `<div class="kpi ${tone}" role="group" aria-label="${esc(label)}">${inner}</div>`;
}

/** Render an HTML table from table-model columns/rows. */
export function dataTable({ columns, rows, caption = '', rowAttrs = null, empty = 'Δεν υπάρχουν δεδομένα.', cls = '', render = {} }) {
  if (!rows.length) return `<div class="empty">${icon('info')}<p>${esc(empty)}</p></div>`;
  const cell = (c, r) => {
    if (render[c.key]) return render[c.key](r[c.key], r);
    const v = r[c.key]; if (v === null || v === undefined || v === '') return '<span class="dim">—</span>';
    switch (c.type) { case 'money': return fmtMoney(v); case 'number': return fmtNum(v); case 'percent': return fmtPct(v); case 'date': return fmtDate(v); default: return esc(v); }
  };
  const right = (c) => ['money', 'number', 'percent'].includes(c.type);
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(caption || 'Πίνακας')}"><table class="tbl ${cls}">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead><tr>${columns.map((c) => `<th scope="col"${right(c) ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${rowAttrs ? ` ${rowAttrs(r)}` : ''}>${columns.map((c) => `<td${right(c) ? ' class="r"' : ''} data-label="${esc(c.label)}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Accessible tablist; returns HTML. Panels are shown/hidden by wireTabs. */
export function tabs(id, items, active = items[0][0]) {
  return `<div class="tabs" role="tablist" aria-label="${esc(id)}">${items.map(([k, l]) => `<button role="tab" id="${id}-t-${k}" aria-controls="${id}-p-${k}" aria-selected="${k === active}" tabindex="${k === active ? 0 : -1}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
}
export function wireTabs(root, id, onChange) {
  const list = root.querySelector(`[aria-label="${id}"][role=tablist]`); if (!list) return;
  const btns = [...list.querySelectorAll('[role=tab]')];
  const show = (k, focus) => {
    btns.forEach((b) => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    root.querySelectorAll(`[id^="${id}-p-"]`).forEach((p) => { p.hidden = p.id !== `${id}-p-${k}`; });
    onChange?.(k);
  };
  list.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) show(b.dataset.tab); });
  list.addEventListener('keydown', (e) => {
    const i = btns.findIndex((b) => b.getAttribute('aria-selected') === 'true'); let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % btns.length; else if (e.key === 'ArrowLeft') n = (i - 1 + btns.length) % btns.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = btns.length - 1;
    if (n >= 0) { e.preventDefault(); show(btns[n].dataset.tab, true); }
  });
  show(btns.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tab || btns[0].dataset.tab);
}

export const sectionHead = (title, actions = '', sub = '') => `<div class="sec-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div><div class="actions">${actions}</div></div>`;

/** Read a <form>-like container into an object. */
export function readForm(root) {
  const o = {};
  root.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}

/** Announce text to screen readers. */
export function announce(msg) { const r = $('#live'); if (r) { r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30); } }
