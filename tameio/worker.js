/* Web Worker search engine – hosts a SearchIndex off the main thread. Loaded as a module worker. */
import { SearchIndex } from './js/search-core.js';

const index = new SearchIndex();

self.onmessage = ({ data }) => {
  const { id, op, payload } = data;
  try {
    let result = null;
    switch (op) {
      case 'ping': result = { worker: true, size: index.size }; break;
      case 'init': index.rebuild(payload.members); result = { size: index.size }; break;
      case 'upsert': index.upsert(payload.member); result = { size: index.size }; break;
      case 'remove': index.remove(payload.id); result = { size: index.size }; break;
      case 'search': {
        const t0 = performance.now();
        const r = index.search(payload.query, payload.opts);
        result = { ...r, ms: performance.now() - t0 };
        break;
      }
      default: throw new Error(`Unknown op ${op}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
self.postMessage({ id: 0, ok: true, result: { ready: true } });
