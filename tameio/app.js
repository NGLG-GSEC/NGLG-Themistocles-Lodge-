/**
 * TAMEIO THEMISTOCLES 96 – application bootstrap: state, search engine, router, shell UI, PWA.
 * @module app
 */
import { APP, ROLES } from './js/config.js';
import { Store } from './js/store.js';
import { SEED } from './js/seed-data.js';
import { SearchEngine } from './js/search-engine.js';
import { Autocomplete } from './js/autocomplete.js';
import { ChartRegistry } from './js/charts.js';
import { makeCtx } from './js/treasury.js';
import { icon, toast, openDialog, field, announce } from './js/ui.js';
import { verify, rolesWithPassword } from './js/auth.js';
import { esc, $, fullName } from './js/utils.js';

const NAV = [
  ['dashboard', 'Πίνακας Ελέγχου', 'dashboard'], ['members', 'Μητρώο Μελών', 'users'], ['treasury', 'Ταμείο', 'coins'], ['analytics', 'Analytics', 'chart'],
  ['reports', 'Αναφορές', 'file'], ['import', 'Εισαγωγή', 'upload'], ['tests', 'Δοκιμές', 'flask'], ['settings', 'Ρυθμίσεις', 'gear'], ['docs', 'Οδηγίες', 'book'],
];
const VIEWS = {
  dashboard: () => import('./js/views/dashboard.js'), members: () => import('./js/views/members.js'), member: () => import('./js/views/profile.js'),
  treasury: () => import('./js/views/treasury.js'), analytics: () => import('./js/views/analytics.js'), reports: () => import('./js/views/reports.js'),
  import: () => import('./js/views/import.js'), tests: () => import('./js/views/tests.js'), settings: () => import('./js/views/settings.js'), docs: () => import('./js/views/docs.js'),
};

const store = new Store({ seed: SEED });
const engine = new SearchEngine({ getMembers: () => store.members });

/** Shared application context handed to every view. */
const app = {
  store, engine, charts: new ChartRegistry(), toast, installPrompt: null,
  get asOf() { return store.settings.asOfYear || new Date().getFullYear(); },
  get roleLabel() { return ROLES[store.role]?.label || store.role; },
  can: (p) => store.can(p),
  guard(p) { if (store.can(p)) return true; toast(`Ο ρόλος «${app.roleLabel}» δεν έχει δικαίωμα για αυτή την ενέργεια.`, 'warn'); return false; },
  /** Calculation context over non-deleted members. */
  ctx() { return makeCtx(store.members.filter((m) => m.status !== 'deleted'), store.ledger, store.settings, app.asOf); },
  navigate(h) { if (location.hash === h) route(false); else location.hash = h; },
  refresh() { return route(false); },
  applyTheme, switchRole, install,
};
window.__app = app; // handy for diagnostics / tests

/* --------------------------------- theme --------------------------------- */
function applyTheme() {
  const t = store.settings.theme; const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#theme-btn').setAttribute('aria-label', dark ? 'Αλλαγή σε φωτεινό θέμα' : 'Αλλαγή σε σκούρο θέμα');
  document.querySelector('meta[name=theme-color]').content = dark ? '#071426' : '#0B1F3A';
}

/* ---------------------------------- roles ---------------------------------- */
async function switchRole(role) {
  const { auth } = store.settings;
  if (auth.enabled && auth.hashes[role]) {
    const pw = await openDialog({ title: `Σύνδεση ως ${ROLES[role].label}`, size: 'sm', body: field({ id: 'pw', label: 'Κωδικός', type: 'password', attrs: 'autocomplete="current-password" autofocus' }), actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Σύνδεση', kind: 'primary', collect: (d) => d.querySelector('#pw').value }] });
    if (pw === undefined) return false;
    if (!(await verify(store, role, pw))) { toast('Λάθος κωδικός.', 'error'); return false; }
  } else if (auth.enabled) { toast('Δεν έχει οριστεί κωδικός για αυτό τον ρόλο.', 'warn'); return false; }
  store.updateSettings({ role }); paintChips(); toast(`Ρόλος: ${ROLES[role].label}`, 'success'); return true;
}

function paintChips() {
  $('#role-chip').innerHTML = `${icon('user', { size: 15 })} ${esc(ROLES[store.role].label)}`;
  $('#lock-btn').hidden = !store.settings.auth.enabled; $('#lock-btn').innerHTML = icon('lock');
}

function lockScreen() {
  const box = $('#lock'); const roles = rolesWithPassword(store);
  box.hidden = false; $('#app').inert = true;
  box.innerHTML = `<form class="lock-card" aria-labelledby="lk-h"><img src="assets/icons/icon-192.png" width="64" height="64" alt=""><h1 id="lk-h">TAMEIO Θεμιστοκλής 96</h1><p>Η εφαρμογή προστατεύεται με κωδικό.</p>
    ${field({ id: 'lk-role', label: 'Ρόλος', type: 'select', value: roles.includes('admin') ? 'admin' : roles[0], options: roles.map((r) => [r, ROLES[r].label]) })}
    ${field({ id: 'lk-pw', label: 'Κωδικός', type: 'password', attrs: 'autocomplete="current-password" autofocus' })}
    <div class="form-error" id="lk-err" role="alert" hidden></div><button class="btn primary" type="submit">Είσοδος</button></form>`;
  return new Promise((resolve) => {
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const role = box.querySelector('#lk-role').value;
      if (await verify(store, role, box.querySelector('#lk-pw').value)) { sessionStorage.setItem('t96.unlocked', '1'); store.updateSettings({ role }); box.hidden = true; $('#app').inert = false; resolve(); } else { const er = box.querySelector('#lk-err'); er.hidden = false; er.textContent = 'Λάθος κωδικός.'; box.querySelector('#lk-pw').value = ''; box.querySelector('#lk-pw').focus(); }
    });
    box.querySelector('#lk-pw').focus();
  });
}

/* --------------------------------- routing --------------------------------- */
let cleanup = null; let routeToken = 0;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, qs = ''] = raw.split('?'); const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs)); const name = parts[0] || 'dashboard';
  if (name === 'member') params.id = decodeURIComponent(parts[1] || '');
  return { name: VIEWS[name] ? name : 'dashboard', params };
}

async function route(isNav = true) {
  const token = ++routeToken; const { name, params } = parseHash();
  const y = window.scrollY;
  try { await cleanup?.(); } catch (e) { console.warn('cleanup', e); }
  cleanup = null; app.charts.destroyAll();
  const host = $('#view'); const el = document.createElement('div'); el.className = 'view';
  try {
    const mod = await VIEWS[name](); if (token !== routeToken) return;
    host.replaceChildren(el);
    const v = mod.default; document.title = `${v.title} — TAMEIO Θεμιστοκλής 96`;
    cleanup = await v.render(el, app, params);
    if (token !== routeToken) { cleanup?.(); cleanup = null; return; }
  } catch (e) {
    console.error(e); host.replaceChildren(el);
    el.innerHTML = `<div class="card error-card" role="alert"><h2>Παρουσιάστηκε σφάλμα</h2><p>${esc(e.message)}</p><p><a class="btn" href="#/dashboard">Πίνακας ελέγχου</a> <button class="btn" onclick="location.reload()">Επαναφόρτωση</button></p></div>`;
  }
  $('#nav').querySelectorAll('a').forEach((a) => { const on = a.dataset.v === (name === 'member' ? 'members' : name); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.body.classList.remove('nav-open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
  if (isNav) { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); announce(document.title); } else window.scrollTo(0, y);
}

/* ---------------------------------- shell ---------------------------------- */
function buildShell() {
  $('#nav').innerHTML = `<ul>${NAV.map(([id, label, ic], i) => `<li><a href="#/${id}" data-v="${id}" title="${esc(label)} (Alt+${i + 1})">${icon(ic)}<span>${esc(label)}</span></a></li>`).join('')}</ul>`;
  $('#menu-btn').innerHTML = icon('menu'); $('#ver').textContent = `v${APP.version}`;
  $('#menu-btn').addEventListener('click', () => { const open = document.body.classList.toggle('nav-open'); $('#menu-btn').setAttribute('aria-expanded', String(open)); });
  $('#theme-btn').addEventListener('click', () => { const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); store.updateSettings({ theme: dark ? 'light' : 'dark' }); applyTheme(); app.charts.destroyAll(); route(false); });
  $('#role-chip').addEventListener('click', async () => {
    const role = await openDialog({ title: 'Επιλογή ρόλου', size: 'sm', body: field({ id: 'rl', label: 'Ρόλος', type: 'select', value: store.role, options: Object.entries(ROLES).map(([k, v]) => [k, v.label]) }), actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Εφαρμογή', kind: 'primary', collect: (d) => d.querySelector('#rl').value }] });
    if (role && role !== store.role && (await switchRole(role))) route(false);
  });
  $('#lock-btn').addEventListener('click', () => { sessionStorage.removeItem('t96.unlocked'); location.reload(); });
  $('#install-btn').addEventListener('click', install);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.installPrompt = e; $('#install-btn').hidden = false; });
  window.addEventListener('appinstalled', () => { app.installPrompt = null; $('#install-btn').hidden = true; toast('Η εφαρμογή εγκαταστάθηκε.', 'success'); });

  const setNet = (ev) => { const c = $('#net-status'); const on = ev?.type === 'offline' ? false : ev?.type === 'online' ? true : navigator.onLine; c.textContent = on ? 'Online' : 'Χωρίς σύνδεση (offline)'; c.classList.toggle('warn', !on); if (!on) announce('Χωρίς σύνδεση. Η εφαρμογή συνεχίζει να λειτουργεί εκτός σύνδεσης.'); };
  window.addEventListener('online', setNet); window.addEventListener('offline', setNet); setNet();

  store.subscribe((type, state) => {
    if (type !== 'save-state') return; const c = $('#save-status');
    c.classList.toggle('bad', state === 'error');
    c.textContent = state === 'pending' ? 'Αποθήκευση…' : state === 'error' ? 'Σφάλμα αποθήκευσης!' : `Αποθηκεύτηκε ${new Date().toLocaleTimeString('el-GR')}`;
    if (state === 'error') toast('Δεν ήταν δυνατή η αποθήκευση στη συσκευή (πιθανώς γεμάτος χώρος). Κατεβάστε αντίγραφο ασφαλείας!', 'error', 9000);
  });

  // global search
  const gs = $('#gsearch');
  new Autocomplete({
    input: gs, label: 'Γενική αναζήτηση', delay: 90,
    source: async (q) => (await engine.search(q, { limit: 8, filter: { status: 'active' } })).results.concat(await extra(q)),
    onSelect: (it) => { store.addSearchHistory(gs.value); gs.value = ''; location.hash = `#/member/${it.id}`; },
    onSubmit: (q) => { if (q.trim()) { store.addSearchHistory(q); location.hash = `#/members?q=${encodeURIComponent(q)}&status=`; gs.value = ''; } },
    history: () => store.ui.searchHistory,
  });
  async function extra(q) { // also surface inactive matches when few active ones exist
    const r = await engine.search(q, { limit: 4 }); return r.results.filter((x) => store.getMember(x.id)?.status !== 'active' && store.getMember(x.id)?.status !== 'deleted').map((x) => ({ ...x, sub: `${x.sub} · ${store.getMember(x.id).status}` })).slice(0, 3);
  }

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); gs.focus(); gs.select(); }
    else if (e.altKey && /^[1-9]$/.test(e.key) && NAV[+e.key - 1]) { e.preventDefault(); location.hash = `#/${NAV[+e.key - 1][0]}`; }
    else if (e.key === '?' && !typing) { location.hash = '#/docs'; }
  });
}

async function install() {
  const p = app.installPrompt; if (!p) { toast('Η εγκατάσταση γίνεται από το μενού του περιηγητή (δείτε Ρυθμίσεις → PWA).', 'info', 6000); return; }
  p.prompt(); await p.userChoice; app.installPrompt = null; $('#install-btn').hidden = true;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Διαθέσιμη νέα έκδοση — κλείστε και ανοίξτε ξανά την εφαρμογή.', 'info', 8000); }); });
  }).catch((e) => console.warn('Service Worker registration failed:', e));
}

/* ---------------------------------- start ---------------------------------- */
async function start() {
  window.addEventListener('error', (e) => console.error(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast(`Σφάλμα: ${e.reason?.message || e.reason}`, 'error'); });
  window.addEventListener('beforeunload', () => store.flush());
  await store.load();
  engine.threshold = store.settings.workerThreshold; await engine.init();
  store.subscribe((type, payload) => {
    if (type === 'member:upsert') engine.upsert(payload); else if (type === 'member:remove') engine.remove(payload);
    else if (type === 'reset' || type === 'members:bulk') engine.init();
  });
  buildShell(); applyTheme(); paintChips();
  if (store.recovered) toast('Τα δεδομένα επαναφέρθηκαν από το αντίγραφο IndexedDB.', 'warn', 7000);
  if (store.settings.auth.enabled && !sessionStorage.getItem('t96.unlocked')) await lockScreen();
  window.addEventListener('hashchange', () => route(true));
  await route(true);
  registerServiceWorker();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.settings.theme === 'auto' && applyTheme());
  document.body.classList.add('ready');
}
start().catch((e) => { console.error(e); $('#view').innerHTML = `<div class="card error-card" role="alert"><h2>Αποτυχία εκκίνησης</h2><p>${esc(e.message)}</p></div>`; });
