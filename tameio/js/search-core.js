/**
 * Enterprise search index – pure ES module shared by the main thread and worker.js.
 *
 * Design:
 *  - `docs`     Map<id, doc>                 documents with normalised field text
 *  - `inverted` Map<token, Map<id, weight>>  inverted index (best field weight per doc)
 *  - `sorted`   token array, lazily re-sorted, used for O(log n) prefix lookups
 *  - `cache`    LRU Map of memoised queries, invalidated by a version counter
 *  - upsert/remove update only the tokens that changed (incremental indexing)
 * @module search-core
 */
import { normText, greeklish, phoneKey } from './utils.js';
import { SEARCH_FIELDS } from './config.js';

const SPLIT = /[^\p{L}\p{N}]+/u;

/** Tokens (with weights) produced for a single field value. */
function fieldTokens(key, raw, weight, out) {
  const text = normText(raw);
  if (!text) return;
  const put = (t, w = weight) => { if (t && (out.get(t) ?? 0) < w) out.set(t, w); };
  for (const t of text.split(SPLIT)) {
    if (!t) continue;
    put(t);
    if (/[α-ω]/.test(t)) put(greeklish(t), weight * 0.9);
  }
  if (key === 'email') { put(text, weight); }
  if (key === 'mobilePhone') {
    const k = phoneKey(raw);
    if (k) { put(k, weight); if (k.length >= 6) { put(k.slice(-4), weight * 0.6); put(k.slice(-6), weight * 0.8); } }
  }
}

export class SearchIndex {
  constructor({ cacheSize = 300 } = {}) {
    /** @type {Map<string, object>} */ this.docs = new Map();
    /** @type {Map<string, Map<string, number>>} */ this.inverted = new Map();
    this.sorted = []; this.dirty = false; this.version = 0;
    this.cache = new Map(); this.cacheSize = cacheSize;
    this.stats = { hits: 0, misses: 0 };
  }

  get size() { return this.docs.size; }

  static buildDoc(m) {
    const fields = {}; const tokens = new Map();
    for (const [key, w] of SEARCH_FIELDS) { fields[key] = normText(m[key]); fieldTokens(key, m[key], w, tokens); }
    return {
      id: m.id, fields, tokens,
      label: `${m.lastName ?? ''} ${m.firstName ?? ''}`.trim(),
      sub: [m.registryNumber, m.degree, m.office].filter(Boolean).join(' · '),
      meta: { status: m.status, degree: m.degree, category: m.category, province: m.province, office: m.office },
    };
  }

  /** Insert or update one member, touching only changed tokens. */
  upsert(m) {
    const next = SearchIndex.buildDoc(m); const prev = this.docs.get(m.id);
    if (prev) {
      for (const t of prev.tokens.keys()) if (!next.tokens.has(t)) this.#unpost(t, m.id);
    }
    for (const [t, w] of next.tokens) this.#post(t, m.id, w);
    this.docs.set(m.id, next); this.#bump();
  }

  remove(id) {
    const prev = this.docs.get(id);
    if (!prev) return false;
    for (const t of prev.tokens.keys()) this.#unpost(t, id);
    this.docs.delete(id); this.#bump();
    return true;
  }

  rebuild(members) {
    this.docs.clear(); this.inverted.clear(); this.sorted = [];
    for (const m of members) {
      const d = SearchIndex.buildDoc(m); this.docs.set(m.id, d);
      for (const [t, w] of d.tokens) this.#post(t, m.id, w);
    }
    this.dirty = true; this.#bump();
  }

  #post(t, id, w) {
    let p = this.inverted.get(t);
    if (!p) { p = new Map(); this.inverted.set(t, p); this.dirty = true; }
    p.set(id, w);
  }

  #unpost(t, id) {
    const p = this.inverted.get(t);
    if (!p) return;
    p.delete(id);
    if (!p.size) { this.inverted.delete(t); this.dirty = true; }
  }

  #bump() { this.version++; this.cache.clear(); }

  #sortedTokens() {
    if (this.dirty) { this.sorted = [...this.inverted.keys()].sort(); this.dirty = false; }
    return this.sorted;
  }

  /** Posting maps for every indexed token starting with `prefix`. */
  #prefix(prefix) {
    const arr = this.#sortedTokens(); let lo = 0; let hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < prefix) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let i = lo; i < arr.length && arr[i].startsWith(prefix); i++) out.push([arr[i], this.inverted.get(arr[i])]);
    return out;
  }

  /**
   * Search. All query terms must match (prefix match per term).
   * @param {string} query
   * @param {{limit?:number, filter?:Record<string,string>}} [opts]
   * @returns {{results:{id:string,score:number,label:string,sub:string,hit:{field:string,value:string}|null}[], total:number, cached:boolean}}
   */
  search(query, { limit = 50, filter = null } = {}) {
    const key = `${query}\u0001${filter ? JSON.stringify(filter) : ''}\u0001${limit}`;
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); this.stats.hits++; return { ...hit, cached: true }; }
    this.stats.misses++;
    const terms = normText(query).split(SPLIT).filter(Boolean);
    let scores = null;
    if (!terms.length) {
      scores = new Map(); for (const id of this.docs.keys()) scores.set(id, 0);
    } else {
      const perTerm = terms.map((term) => {
        const m = new Map();
        const exact = this.inverted.get(term);
        if (exact) for (const [id, w] of exact) m.set(id, w * 2);
        for (const [, post] of this.#prefix(term)) for (const [id, w] of post) if (!m.has(id) || m.get(id) < w) m.set(id, w);
        return m;
      }).sort((a, b) => a.size - b.size);
      scores = new Map();
      for (const [id, s] of perTerm[0]) {
        let total = s; let ok = true;
        for (let i = 1; i < perTerm.length; i++) { const v = perTerm[i].get(id); if (v === undefined) { ok = false; break; } total += v; }
        if (ok) scores.set(id, total);
      }
    }
    let list = [];
    for (const [id, score] of scores) {
      const d = this.docs.get(id);
      if (filter) { let ok = true; for (const k in filter) if (filter[k] && d.meta[k] !== filter[k]) { ok = false; break; } if (!ok) continue; }
      list.push([d, score]);
    }
    list.sort((a, b) => b[1] - a[1] || a[0].label.localeCompare(b[0].label, 'el'));
    const total = list.length;
    const results = list.slice(0, limit).map(([d, score]) => ({ id: d.id, score, label: d.label, sub: d.sub, hit: this.#explain(d, terms) }));
    const out = { results, total };
    this.cache.set(key, out);
    if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
    return { ...out, cached: false };
  }

  /** Which field produced the match (used to show "why" in suggestions). */
  #explain(d, terms) {
    if (!terms.length) return null;
    for (const [key] of SEARCH_FIELDS) {
      const v = d.fields[key];
      if (v && terms.every((t) => v.includes(t) || greeklish(v).includes(t))) return { field: key, value: v };
    }
    for (const [key] of SEARCH_FIELDS) {
      const v = d.fields[key];
      if (v && terms.some((t) => v.includes(t))) return { field: key, value: v };
    }
    return null;
  }
}
