/**
 * Accessible autocomplete (ARIA 1.2 combobox with listbox popup).
 * Keyboard: ↓/↑ move, Enter selects (or submits the query), Tab accepts the suggestion, Esc closes/clears,
 * Home/End move the caret. Announces result counts through an aria-live region.
 * @module autocomplete
 */
import { esc, debounce, normText } from './utils.js';

const FIELD_LABEL = { registryNumber: 'Αρ. Μητρώου', lastName: 'Επώνυμο', firstName: 'Όνομα', email: 'Email', mobilePhone: 'Τηλέφωνο', residence: 'Κατοικία', office: 'Αξίωμα', degree: 'Βαθμός', notes: 'Σημειώσεις' };
let seq = 0;

/** Highlight query terms in text (accent/case-insensitive). */
export function highlight(text, query) {
  const src = String(text ?? ''); const terms = normText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return esc(src);
  const norm = [...src].map((c) => normText(c) || c).join('');
  if (norm.length !== src.length) return esc(src);
  const mask = new Array(src.length).fill(false);
  for (const t of terms) { let i = norm.indexOf(t); while (i >= 0) { for (let k = i; k < i + t.length; k++) mask[k] = true; i = norm.indexOf(t, i + t.length); } }
  let out = ''; let open = false;
  for (let i = 0; i < src.length; i++) { if (mask[i] && !open) { out += '<mark>'; open = true; } if (!mask[i] && open) { out += '</mark>'; open = false; } out += esc(src[i]); }
  return open ? `${out}</mark>` : out;
}

export class Autocomplete {
  /**
   * @param {object} o
   * @param {HTMLInputElement} o.input
   * @param {(q:string)=>Promise<{id:string,label:string,sub?:string,hit?:{field:string,value:string}}[]>} o.source
   * @param {(item:object)=>void} o.onSelect          item chosen with Enter / click
   * @param {(q:string)=>void} [o.onSubmit]           Enter without an active suggestion
   * @param {()=>string[]} [o.history]                recent searches shown for empty input
   * @param {(q:string)=>void} [o.onInput]            every input change (debounced)
   */
  constructor({ input, source, onSelect, onSubmit, history, onInput, delay = 100, label = 'Αναζήτηση' }) {
    this.input = input; this.source = source; this.onSelect = onSelect; this.onSubmit = onSubmit; this.history = history; this.onInput = onInput;
    this.id = `ac${++seq}`; this.items = []; this.active = -1; this.open = false; this.token = 0; this.lastQuery = '';
    const wrap = document.createElement('div'); wrap.className = 'ac-wrap'; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    this.list = document.createElement('ul'); this.list.id = `${this.id}-list`; this.list.className = 'ac-list'; this.list.setAttribute('role', 'listbox'); this.list.setAttribute('aria-label', `${label} – προτάσεις`); this.list.hidden = true;
    this.live = document.createElement('div'); this.live.className = 'sr-only'; this.live.setAttribute('aria-live', 'polite'); this.live.setAttribute('role', 'status');
    wrap.append(this.list, this.live); this.wrap = wrap;
    Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': this.list.id, 'aria-haspopup': 'listbox', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }).forEach(([k, v]) => input.setAttribute(k, v));
    this.run = debounce((q) => this.refresh(q), delay);
    this.handlers = {
      input: () => { this.onInput?.(input.value); this.run(input.value); },
      keydown: (e) => this.onKey(e),
      focus: () => { if (!input.value) this.run(''); },
      blur: () => setTimeout(() => this.close(), 120),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) input.addEventListener(ev, fn);
    this.list.addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('[role=option]'); if (li) this.choose(+li.dataset.i); });
  }

  async refresh(q) {
    const tok = ++this.token; this.lastQuery = q;
    let items;
    if (!q.trim()) items = (this.history?.() || []).map((h) => ({ id: `h:${h}`, label: h, sub: 'Πρόσφατη αναζήτηση', history: true }));
    else items = await this.source(q);
    if (tok !== this.token) return;
    this.items = items; this.active = -1; this.render(q);
    this.setOpen(items.length > 0 && document.activeElement === this.input);
    this.live.textContent = q.trim() ? (items.length ? `${items.length} προτάσεις. Χρησιμοποιήστε τα βέλη για πλοήγηση.` : 'Δεν βρέθηκαν αποτελέσματα') : '';
  }

  render(q) {
    this.list.innerHTML = this.items.map((it, i) => {
      const why = it.hit && !['lastName', 'firstName', 'registryNumber'].includes(it.hit.field) ? `<span class="ac-why">${esc(FIELD_LABEL[it.hit.field] || it.hit.field)}: ${highlight(it.hit.value, q)}</span>` : '';
      return `<li id="${this.id}-o${i}" role="option" aria-selected="false" data-i="${i}"><span class="ac-main">${highlight(it.label, q)}</span>${it.sub ? `<span class="ac-sub">${esc(it.sub)}</span>` : ''}${why}</li>`;
    }).join('');
  }

  setOpen(v) {
    this.open = v; this.list.hidden = !v; this.input.setAttribute('aria-expanded', String(v));
    if (!v) this.input.removeAttribute('aria-activedescendant');
  }
  close() { this.setOpen(false); this.active = -1; }

  move(delta) {
    if (!this.items.length) return;
    if (!this.open) this.setOpen(true);
    const n = this.items.length;
    this.active = this.active < 0 ? (delta > 0 ? 0 : n - 1) : (this.active + delta + n) % n;
    this.list.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === this.active)));
    const cur = this.list.children[this.active]; this.input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' });
  }

  choose(i) {
    const it = this.items[i]; if (!it) return;
    this.close();
    if (it.history) { this.input.value = it.label; this.onInput?.(it.label); this.onSubmit?.(it.label); return; }
    this.onSelect?.(it);
  }

  onKey(e) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.move(1); break;
      case 'ArrowUp': e.preventDefault(); this.move(-1); break;
      case 'Enter':
        if (this.open && this.active >= 0) { e.preventDefault(); this.choose(this.active); } else { this.close(); this.onSubmit?.(this.input.value); }
        break;
      case 'Tab': // accept the suggestion (first one when none is highlighted); focus then moves on with the next Tab
        if (this.open && this.items.length && !e.shiftKey) {
          e.preventDefault(); const it = this.items[this.active >= 0 ? this.active : 0];
          if (!it.history) { this.input.value = it.label; this.onInput?.(it.label); this.onSelect?.(it); } else { this.input.value = it.label; this.onInput?.(it.label); }
          this.close();
        } else this.close();
        break;
      case 'Escape':
        if (this.open) { e.preventDefault(); e.stopPropagation(); this.close(); } else if (this.input.value) { e.preventDefault(); this.input.value = ''; this.onInput?.(''); this.live.textContent = 'Η αναζήτηση καθαρίστηκε'; }
        break;
      default:
    }
  }

  destroy() {
    for (const [ev, fn] of Object.entries(this.handlers)) this.input.removeEventListener(ev, fn);
    this.run.cancel(); ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-haspopup', 'aria-activedescendant'].forEach((a) => this.input.removeAttribute(a));
    this.wrap.replaceWith(this.input);
  }
}
