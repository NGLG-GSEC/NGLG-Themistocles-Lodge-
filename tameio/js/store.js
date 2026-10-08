/**
 * Application state with LocalStorage persistence, IndexedDB mirror, autosave, migrations and audit log.
 * @module store
 */
import { APP, DEFAULT_SETTINGS, ROLES } from './config.js';
import { clone, debounce, uid, toUpperGreek, round2, todayISO } from './utils.js';

const KEYS = ['members', 'ledger', 'settings', 'ui', 'audit', 'imports', 'meta'];

/** Ordered schema migrations: migrations[n] upgrades data from schema n to n+1. */
export const MIGRATIONS = [
  /* 0 → 1 : legacy files without schemaVersion */
  (s) => {
    s.members = (s.members || []).map((m) => ({ offices: [], history: [], feeOverride: {}, exempt: false, ...m }));
    s.settings = { ...clone(DEFAULT_SETTINGS), ...(s.settings || {}) };
    return s;
  },
];

export function migrate(state, from) {
  let v = Number.isInteger(from) ? from : 0;
  while (v < APP.schemaVersion) { state = MIGRATIONS[v](state); v++; }
  state.meta = { ...(state.meta || {}), schemaVersion: APP.schemaVersion };
  return state;
}

/** Create a normalised member object. */
export function newMember(data = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('m'), registryNumber: '', firstName: '', lastName: '', birthYear: null, fatherName: '', category: 'ΤΑΚΤΙΚΟ',
    mobilePhone: '', email: '', initiationDate: '', passingDate: '', raisingDate: '', adoptionDate: '', reinstatementDate: '',
    residence: '', degree: '', office: '', officeInstallDate: '', grandOffice: '', notes: '', lodgeEmail: '',
    lodgeNumber: 96, lodgeName: 'ΘΕΜΙΣΤΟΚΛΗΣ', province: 'Πειραιως & Αιγαιου', status: 'active', statusChangedAt: '',
    feeOverride: {}, exempt: false, offices: [], history: [], createdAt: now, updatedAt: now, ...data,
  };
}

/** Storage adapter around LocalStorage that survives missing/blocked storage. */
export class SafeStorage {
  constructor(backend) { this.backend = backend; this.memory = new Map(); this.ok = true; }
  get(k) { try { const v = this.backend?.getItem(k); if (v !== null && v !== undefined) return v; } catch { this.ok = false; } return this.memory.get(k) ?? null; }
  set(k, v) { this.memory.set(k, v); try { this.backend?.setItem(k, v); return true; } catch (e) { this.ok = false; this.lastError = e; return false; } }
  remove(k) { this.memory.delete(k); try { this.backend?.removeItem(k); } catch { /* ignore */ } }
}

export class Store {
  /**
   * @param {object} [o]
   * @param {Storage|null} [o.storage]  defaults to window.localStorage
   * @param {string} [o.prefix]
   * @param {boolean} [o.idb]           mirror snapshots to IndexedDB
   * @param {object} [o.seed]           initial data when storage is empty
   * @param {number} [o.saveDelay]
   */
  constructor({ storage, prefix = APP.storagePrefix, idb = true, seed = null, saveDelay = 250 } = {}) {
    let backend = storage;
    if (backend === undefined) { try { backend = window.localStorage; } catch { backend = null; } }
    this.storage = new SafeStorage(backend); this.prefix = prefix; this.useIdb = idb && typeof indexedDB !== 'undefined';
    this.seed = seed; this.listeners = new Set(); this.dirty = new Set(); this.byId = new Map();
    this.state = this.#empty(); this.saveState = 'idle'; this.lastSaved = null;
    this.save = debounce(() => this.flush(), saveDelay);
    this.ledgerVersion = 0;
  }

  #empty() {
    return { members: [], ledger: [], settings: clone(DEFAULT_SETTINGS), ui: { filters: {}, searchHistory: [], dashboard: {} }, audit: [], imports: [], meta: { schemaVersion: APP.schemaVersion } };
  }

  get members() { return this.state.members; }
  get ledger() { return this.state.ledger; }
  get settings() { return this.state.settings; }
  get ui() { return this.state.ui; }
  get role() { return this.state.settings.role; }
  can(perm) { return !!ROLES[this.role]?.can.includes(perm); }
  getMember(id) { return this.byId.get(id) || null; }
  get isSample() { return !!this.state.meta.sample; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of [...this.listeners]) { try { fn(type, payload); } catch (e) { console.error('store listener', e); } } }

  /* --------------------------- persistence --------------------------- */
  /** Load from LocalStorage → IndexedDB snapshot → seed, applying migrations. */
  async load() {
    let raw = {}; let found = false;
    for (const k of KEYS) {
      const t = this.storage.get(this.prefix + k);
      if (t !== null) {
        try { raw[k] = JSON.parse(t); found = true; } catch (e) { console.warn('Corrupt key', k, e); this.storage.set(`${this.prefix}${k}.corrupt`, t); }
      }
    }
    if (!found || !raw.members) {
      const snap = await this.#readIdb();
      if (snap) { raw = snap; found = true; this.recovered = 'indexeddb'; }
    }
    if (!found || !Array.isArray(raw.members)) {
      const seed = this.seed ? clone(this.seed) : {};
      raw = { members: seed.members || [], ledger: seed.ledger || [], settings: { ...clone(DEFAULT_SETTINGS), ...(seed.settings || {}) }, meta: { sample: !!seed.sample, schemaVersion: APP.schemaVersion } };
      this.fromSeed = true;
    }
    // An older, untouched sample data set is replaced by the current seed (members the user added keep the data safe).
    if (!this.fromSeed && this.seed && raw.meta?.sample && (raw.meta.seedVersion || 1) < (this.seed.version || 1)
      && raw.members.every((m) => this.seed.members.some((s) => s.id === m.id))) {
      const s = clone(this.seed);
      raw.members = s.members; raw.ledger = s.ledger;
      raw.settings = { ...(raw.settings || {}), fees: s.settings.fees, lodge: s.settings.lodge, asOfYear: s.settings.asOfYear, debtFromYear: s.settings.debtFromYear };
      raw.meta = { ...raw.meta, seedVersion: s.version }; this.reseeded = true;
    }
    const from = raw.meta?.schemaVersion ?? 0;
    raw = migrate({ ...this.#empty(), ...raw }, from);
    raw.settings = { ...clone(DEFAULT_SETTINGS), ...raw.settings, auth: { ...DEFAULT_SETTINGS.auth, ...(raw.settings?.auth || {}) } };
    raw.ui = { filters: {}, searchHistory: [], dashboard: {}, ...(raw.ui || {}) };
    this.state = raw; this.#reindex();
    if (this.fromSeed) this.state.meta.seedVersion = this.seed?.version || 1;
    if (this.fromSeed || this.reseeded || from !== APP.schemaVersion) { KEYS.forEach((k) => this.dirty.add(k)); this.flush(); }
    this.emit('load');
    return this;
  }

  #reindex() { this.byId = new Map(this.state.members.map((m) => [m.id, m])); this.ledgerVersion++; }

  mark(...keys) { keys.forEach((k) => this.dirty.add(k)); this.saveState = 'pending'; this.emit('save-state', this.saveState); this.save(); }

  /** Write dirty keys immediately. */
  flush() {
    if (!this.dirty.size) return true;
    let ok = true;
    for (const k of this.dirty) { if (!this.storage.set(this.prefix + k, JSON.stringify(this.state[k]))) ok = false; }
    this.dirty.clear();
    this.saveState = ok ? 'saved' : 'error'; this.lastSaved = new Date();
    this.emit('save-state', this.saveState);
    if (this.useIdb) this.#writeIdbSoon();
    return ok;
  }

  #writeIdbSoon = debounce(() => this.#writeIdb(), 1200);

  #idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(APP.idbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snapshots');
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async #writeIdb() {
    if (!this.useIdb) return;
    try { const db = await this.#idb(); await new Promise((res, rej) => { const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put(JSON.parse(JSON.stringify(this.state)), 'latest'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); } catch (e) { console.warn('IndexedDB write failed', e); }
  }
  async #readIdb() {
    if (!this.useIdb) return null;
    try { const db = await this.#idb(); const v = await new Promise((res, rej) => { const q = db.transaction('snapshots').objectStore('snapshots').get('latest'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); return v || null; } catch { return null; }
  }
  async wipeIdb() { if (!this.useIdb) return; try { const db = await this.#idb(); await new Promise((res) => { const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').clear(); tx.oncomplete = res; }); db.close(); } catch { /* ignore */ } }

  /** Approximate size of stored data in bytes. */
  usage() { let n = 0; for (const k of KEYS) n += (this.storage.get(this.prefix + k) || '').length * 2; return n; }

  /* ----------------------------- audit ----------------------------- */
  log(action, entity, id, detail = '') {
    this.state.audit.push({ at: new Date().toISOString(), role: this.role, action, entity, id, detail });
    if (this.state.audit.length > 3000) this.state.audit.splice(0, this.state.audit.length - 3000);
    this.mark('audit');
  }

  /* ----------------------------- members ----------------------------- */
  #hist(m, type, text) { (m.history ||= []).push({ date: todayISO(), type, text }); }

  addMember(data, { silent = false } = {}) {
    const m = newMember(data); this.#hist(m, 'created', 'Δημιουργία εγγραφής');
    this.#syncOffice(m, null);
    this.state.members.push(m); this.byId.set(m.id, m);
    if (!silent) { this.log('create', 'member', m.id, `${m.registryNumber} ${m.lastName}`); this.mark('members'); this.emit('member:upsert', m); }
    return m;
  }

  updateMember(id, patch) {
    const m = this.byId.get(id); if (!m) return null;
    const before = { office: m.office };
    Object.assign(m, patch, { updatedAt: new Date().toISOString() });
    this.#syncOffice(m, before.office);
    this.log('update', 'member', id, Object.keys(patch).join(','));
    this.mark('members'); this.emit('member:upsert', m);
    return m;
  }

  /** Keep the "offices held" history aligned with the current office field. */
  #syncOffice(m, prevOffice) {
    const cur = (m.office || '').trim(); const open = (m.offices ||= []).find((o) => !o.to);
    const isReal = !!cur && !/άνευ/i.test(cur);
    if (open && (!isReal || open.office !== cur)) { open.to = todayISO(); this.#hist(m, 'office', `Λήξη αξιώματος: ${open.office}`); }
    if (isReal && !m.offices.some((o) => !o.to && o.office === cur)) {
      m.offices.push({ office: cur, from: m.officeInstallDate || todayISO(), to: '' });
      if (prevOffice !== null) this.#hist(m, 'office', `Νέο αξίωμα: ${cur}`);
    }
  }

  /** Change lifecycle status (active|former|archived|deleted) – soft delete keeps data restorable. */
  setStatus(id, status, reason = '') {
    const m = this.byId.get(id); if (!m || m.status === status) return m;
    const prev = m.status;
    m.status = status; m.statusChangedAt = todayISO(); m.updatedAt = new Date().toISOString();
    this.#hist(m, 'status', `Κατάσταση: ${prev} → ${status}${reason ? ` (${reason})` : ''}`);
    this.log('status', 'member', id, `${prev}->${status}`);
    this.mark('members'); this.emit('member:upsert', m);
    return m;
  }

  /** Permanently remove a member and their payments (only from the deleted bin). */
  purgeMember(id) {
    const i = this.state.members.findIndex((m) => m.id === id); if (i < 0) return false;
    this.state.members.splice(i, 1); this.byId.delete(id);
    this.state.ledger = this.state.ledger.filter((p) => p.memberId !== id); this.ledgerVersion++;
    this.log('purge', 'member', id); this.mark('members', 'ledger'); this.emit('member:remove', id); this.emit('ledger');
    return true;
  }

  /** Bulk add used by the importer. Returns created and updated members. */
  bulkUpsert(rows, { updateExisting = false } = {}) {
    const created = []; const updated = [];
    const byReg = new Map(this.state.members.map((m) => [String(m.registryNumber), m]));
    for (const r of rows) {
      const ex = byReg.get(String(r.registryNumber));
      if (ex && updateExisting) {
        const patch = {}; for (const [k, v] of Object.entries(r)) if (v !== '' && v !== null && v !== undefined && k !== 'id') patch[k] = v;
        Object.assign(ex, patch, { updatedAt: new Date().toISOString() }); this.#hist(ex, 'edit', 'Ενημέρωση από εισαγωγή'); updated.push(ex);
      } else if (!ex) { const m = this.addMember(r, { silent: true }); this.#hist(m, 'created', 'Εισαγωγή από αρχείο'); byReg.set(String(m.registryNumber), m); created.push(m); }
    }
    this.log('import', 'member', '', `+${created.length} ~${updated.length}`);
    this.mark('members'); this.emit('members:bulk');
    return { created, updated };
  }

  /* ----------------------------- ledger ----------------------------- */
  addPayment({ memberId, year, amount, date = todayISO(), method = 'bank', receipt = '', note = '' }) {
    const amt = round2(amount); if (!this.byId.has(memberId) || !Number.isFinite(amt) || amt === 0) throw new Error('Μη έγκυρη πληρωμή');
    const p = { id: uid('p'), memberId, year: Number(year), amount: amt, date, method, receipt: receipt || this.nextReceipt(year), note };
    this.state.ledger.push(p); this.ledgerVersion++;
    this.log('payment', 'ledger', p.id, `${memberId} ${year} ${amt}`); this.mark('ledger'); this.emit('ledger', p);
    return p;
  }

  nextReceipt(year) {
    const pre = `ΑΠ-${year}-`; let max = 0;
    for (const p of this.state.ledger) if (p.receipt?.startsWith(pre)) max = Math.max(max, parseInt(p.receipt.slice(pre.length), 10) || 0);
    return pre + String(max + 1).padStart(4, '0');
  }

  removePayment(id) {
    const i = this.state.ledger.findIndex((p) => p.id === id); if (i < 0) return false;
    this.state.ledger.splice(i, 1); this.ledgerVersion++;
    this.log('payment-delete', 'ledger', id); this.mark('ledger'); this.emit('ledger');
    return true;
  }

  /** Set the total paid for a member/year by booking the difference as an adjustment payment. */
  setPaid(memberId, year, target, note = 'Διόρθωση υπολοίπου') {
    const current = round2(this.state.ledger.filter((p) => p.memberId === memberId && p.year === +year).reduce((t, p) => t + p.amount, 0));
    const delta = round2(target - current);
    if (delta === 0) return null;
    return this.addPayment({ memberId, year, amount: delta, method: 'other', note });
  }

  /* ----------------------------- settings / ui ----------------------------- */
  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch }; this.mark('settings'); this.emit('settings', patch);
  }
  setUi(key, value) { this.state.ui[key] = value; this.mark('ui'); }
  addSearchHistory(q) {
    q = q.trim(); if (!q) return;
    const h = this.state.ui.searchHistory.filter((x) => x !== q); h.unshift(q); this.state.ui.searchHistory = h.slice(0, 12); this.mark('ui');
  }
  addImportReport(r) { this.state.imports.unshift(r); this.state.imports = this.state.imports.slice(0, 30); this.mark('imports'); }

  /* ----------------------------- backup / reset ----------------------------- */
  exportBackup() {
    return { app: APP.name, version: APP.version, exportedAt: new Date().toISOString(), schemaVersion: APP.schemaVersion, data: JSON.parse(JSON.stringify({ ...this.state, settings: { ...this.state.settings, auth: { enabled: false, hashes: {}, salt: '' } } })) };
  }

  /** Replace all data with a backup produced by exportBackup (validates structure first). */
  restoreBackup(obj) {
    const d = obj?.data ?? obj;
    if (!d || !Array.isArray(d.members) || !Array.isArray(d.ledger ?? [])) throw new Error('Μη έγκυρο αρχείο αντιγράφου ασφαλείας');
    const keepAuth = this.state.settings.auth;
    let st = migrate({ ...this.#empty(), ...clone(d) }, obj?.schemaVersion ?? d.meta?.schemaVersion ?? 0);
    st.settings = { ...clone(DEFAULT_SETTINGS), ...st.settings, auth: keepAuth };
    this.state = st; this.#reindex(); KEYS.forEach((k) => this.dirty.add(k)); this.flush();
    this.log('restore', 'backup', '', `${st.members.length} μέλη`); this.emit('reset');
  }

  /** Remove all members/payments (keeps settings). */
  clearData() {
    this.state.members = []; this.state.ledger = []; this.state.meta.sample = false; this.#reindex();
    this.log('clear', 'data'); this.mark('members', 'ledger', 'meta'); this.emit('reset');
  }

  loadSeed() {
    if (!this.seed) return;
    const s = clone(this.seed);
    this.state.members = s.members; this.state.ledger = s.ledger; this.state.settings = { ...this.state.settings, fees: s.settings.fees, lodge: s.settings.lodge, asOfYear: s.settings.asOfYear, debtFromYear: s.settings.debtFromYear };
    this.state.meta.sample = true; this.state.meta.seedVersion = s.version || 1; this.#reindex(); this.log('seed', 'data'); this.mark('members', 'ledger', 'settings', 'meta'); this.emit('reset');
  }

  /** Remove every stored key (factory reset). */
  async factoryReset() {
    for (const k of KEYS) this.storage.remove(this.prefix + k);
    await this.wipeIdb(); this.dirty.clear();
  }
}
