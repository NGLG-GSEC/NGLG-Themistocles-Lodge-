/**
 * SearchEngine facade: Web Worker backed index with automatic fallback to a local index.
 * @module search-engine
 */
import { SearchIndex } from './search-core.js';

export class SearchEngine {
  /**
   * @param {object} o
   * @param {() => object[]} o.getMembers   supplies all members (used for init & fallback rebuilds)
   * @param {string} [o.workerUrl]
   * @param {number} [o.threshold]          member count from which a worker is preferred
   * @param {'auto'|'worker'|'local'} [o.prefer]
   * @param {(url:string)=>Worker} [o.workerFactory]  injectable for tests
   */
  constructor({ getMembers, workerUrl = 'worker.js', threshold = 200, prefer = 'auto', workerFactory = null } = {}) {
    this.getMembers = getMembers; this.workerUrl = workerUrl; this.threshold = threshold; this.prefer = prefer;
    this.workerFactory = workerFactory || ((u) => new Worker(u, { type: 'module' }));
    this.local = new SearchIndex(); this.worker = null; this.mode = 'local'; this.reason = '';
    this.pending = new Map(); this.seq = 1; this.lastMs = 0;
  }

  /** (Re)initialise from current members and pick the best mode. */
  async init() {
    const members = this.getMembers();
    this.#teardownWorker();
    const wantWorker = this.prefer === 'worker' || (this.prefer === 'auto' && members.length >= this.threshold);
    if (wantWorker) {
      if (typeof Worker === 'undefined') { this.reason = 'Web Worker μη διαθέσιμο'; } else {
        try {
          await this.#startWorker(members);
          this.mode = 'worker'; this.reason = '';
          return this.mode;
        } catch (e) { this.reason = `Fallback: ${e.message}`; this.#teardownWorker(); }
      }
    } else this.reason = this.prefer === 'local' ? 'Επιλέχθηκε τοπική μηχανή' : 'Μικρό σύνολο δεδομένων';
    this.local.rebuild(members); this.mode = 'local';
    return this.mode;
  }

  async #startWorker(members) {
    const w = this.workerFactory(this.workerUrl);
    this.worker = w;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout εκκίνησης Worker')), 5000);
      w.onmessage = (ev) => {
        if (ev.data && ev.data.id === 0) { clearTimeout(timer); w.onmessage = (e) => this.#onMessage(e); resolve(); }
      };
      w.onerror = (ev) => { clearTimeout(timer); reject(new Error(ev.message || 'σφάλμα Worker')); };
    });
    w.onerror = (ev) => this.#fail(new Error(ev.message || 'σφάλμα Worker'));
    await this.#call('init', { members });
  }

  #teardownWorker() {
    if (this.worker) { try { this.worker.terminate(); } catch { /* ignore */ } this.worker = null; }
    for (const { reject } of this.pending.values()) reject(new Error('Worker τερματίστηκε'));
    this.pending.clear();
  }

  #onMessage({ data }) {
    const p = this.pending.get(data.id);
    if (!p) return;
    this.pending.delete(data.id);
    data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
  }

  #call(op, payload) {
    return new Promise((resolve, reject) => {
      const id = this.seq++; this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, op, payload }); } catch (e) { this.pending.delete(id); reject(e); }
    });
  }

  /** Worker died: switch to the local engine transparently. */
  #fail(err) {
    this.reason = `Fallback: ${err.message}`;
    this.#teardownWorker(); this.mode = 'local';
    this.local.rebuild(this.getMembers());
  }

  /** Incremental update after add/edit. */
  async upsert(member) {
    if (this.mode === 'worker') { try { await this.#call('upsert', { member }); return; } catch (e) { this.#fail(e); } }
    this.local.upsert(member);
  }

  async remove(id) {
    if (this.mode === 'worker') { try { await this.#call('remove', { id }); return; } catch (e) { this.#fail(e); } }
    this.local.remove(id);
  }

  /** @returns {Promise<{results:object[], total:number, ms:number, mode:string, cached:boolean}>} */
  async search(query, opts = {}) {
    const t0 = performance.now();
    if (this.mode === 'worker') {
      try { const r = await this.#call('search', { query, opts }); this.lastMs = performance.now() - t0; return { ...r, mode: 'worker' }; } catch (e) { this.#fail(e); }
    }
    const r = this.local.search(query, opts); this.lastMs = performance.now() - t0;
    return { ...r, ms: this.lastMs, mode: 'local' };
  }

  destroy() { this.#teardownWorker(); }
}
