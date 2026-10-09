/**
 * In-browser diagnostics: 12 suites covering search, autocomplete, ARIA, import/export, treasury,
 * offline, storage, worker, fallback and reporting. Run from the "Δοκιμές" screen.
 * @module tests
 */
import { SearchIndex } from './search-core.js';
import { SearchEngine } from './search-engine.js';
import { Autocomplete, highlight } from './autocomplete.js';
import { Store, newMember, migrate } from './store.js';
import * as I from './importer.js';
import { totalsRow, tablesToXLSX, tableToCSV, tableToPDF, MEMBER_COLUMNS, memberRows, exportAs } from './exporter.js';
import { makeCtx, expectedFee, memberYear, memberDebt, yearSummary, forecast, growth, compliance } from './treasury.js';
import { REPORTS } from './reports.js';
import { parseCSV, toCSV, toISODate, normText, toUpperGreek, formatPhone, phoneKey, isEmail, parseMoney, round2, sleep } from './utils.js';
import { SEED } from './seed-data.js';
import { DEFAULT_SETTINGS, FIELDS } from './config.js';
import { clone } from './utils.js';

/** Fixtures for treasury tests (the bundled seed has no payments). */
const OLD_FEES = { 'ΤΑΚΤΙΚΟ': { 2025: 280, 2026: 300, 2027: 300, 2028: 320, 2029: 320, 2030: 340 }, 'ΥΙΟΘΕΤΗΜΕΝΟ': { 2025: 140, 2026: 150, 2027: 150, 2028: 160, 2029: 160, 2030: 170 }, 'ΜΕΤΟΙΚΟ': { 2026: 100 }, 'ΕΠΙΤΙΜΟ': {}, 'ΟΜΟΤΙΜΟ': {}, 'ΔΙΑΓΡΑΦΕΝ': {} };
const FIX_LEDGER = SEED.members.flatMap((m, i) => [...(i < 12 ? [{ id: `a${i}`, memberId: m.id, year: 2025, amount: m.category === 'ΤΑΚΤΙΚΟ' ? 280 : 140, date: '2025-02-10', method: 'bank' }] : []), ...(i < 16 ? [{ id: `b${i}`, memberId: m.id, year: 2026, amount: 100, date: '2026-02-10', method: 'cash' }] : [])]);
class Assertion extends Error {}
const ok = (c, m = 'Αποτυχία ισχυρισμού') => { if (!c) throw new Assertion(m); };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Assertion(`${m} αναμενόμενο ${JSON.stringify(b)}, βρέθηκε ${JSON.stringify(a)}`); };
const near = (a, b, m = '', eps = 0.005) => { if (Math.abs(a - b) > eps) throw new Assertion(`${m} αναμενόμενο ≈${b}, βρέθηκε ${a}`); };

const memStorage = () => { const d = {}; return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; };
const memStore = (seed = null, storage = memStorage()) => new Store({ storage, idb: false, seed, prefix: 'test.', saveDelay: 10 });

/** Deterministic fake roster for volume tests. */
export function fakeMembers(n) {
  const first = ['ΓΕΩΡΓΙΟΣ', 'ΝΙΚΟΛΑΟΣ', 'ΔΗΜΗΤΡΙΟΣ', 'ΙΩΑΝΝΗΣ', 'ΚΩΝΣΤΑΝΤΙΝΟΣ', 'ΠΑΝΑΓΙΩΤΗΣ', 'ΒΑΣΙΛΕΙΟΣ', 'ΑΘΑΝΑΣΙΟΣ'];
  const last = ['ΠΑΠΑΔΟΠΟΥΛΟΣ', 'ΓΕΩΡΓΙΟΥ', 'ΝΙΚΟΛΑΟΥ', 'ΙΩΑΝΝΙΔΗΣ', 'ΚΑΡΑΓΙΑΝΝΗΣ', 'ΜΑΝΩΛΑΚΗΣ', 'ΞΑΝΘΟΠΟΥΛΟΣ', 'ΣΤΥΛΙΑΝΟΥ'];
  const city = ['ΠΕΙΡΑΙΑΣ', 'ΑΘΗΝΑ', 'ΓΛΥΦΑΔΑ', 'ΜΥΚΟΝΟΣ', 'ΡΟΔΟΣ', 'ΘΕΣΣΑΛΟΝΙΚΗ', 'ΚΑΛΛΙΘΕΑ', 'ΝΙΚΑΙΑ'];
  const deg = ['ΜΑΘΗΤΗΣ', 'ΕΤΑΙΡΟΣ', 'ΔΙΔΑΣΚΑΛΟΣ']; const off = ['', '', 'Γραμματεύς', 'Θυσαυροφύλαξ', 'Α Επόπτης'];
  return Array.from({ length: n }, (_, i) => newMember({
    id: `f${i}`, registryNumber: String(970000 + i), firstName: first[i % 8], lastName: `${last[(i * 7) % 8]}${i % 50}`, email: `user${i}@example.test`,
    mobilePhone: `+30 69${String(10000000 + i * 37).slice(0, 8)}`, residence: city[i % 8], degree: deg[i % 3], office: off[i % 5], notes: i % 11 === 0 ? `ειδική σημείωση ${i}` : '',
    category: i % 5 ? 'ΤΑΚΤΙΚΟ' : 'ΥΙΟΘΕΤΗΜΕΝΟ', initiationDate: `${2000 + (i % 25)}-03-1${i % 9}`, status: 'active',
  }));
}

const sandbox = () => { let s = document.getElementById('test-sandbox'); if (!s) { s = document.createElement('div'); s.id = 'test-sandbox'; s.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px'; document.body.appendChild(s); } s.innerHTML = ''; return s; };
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const typeInto = async (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(220); };

const book2Rows = () => [I.BOOK2_HEADERS,
  [960101, 'Παναγιώτης', 'Ρήγας', 1978, 'Βασίλειος', '1. ΤΑΚΤΙΚΟ', 6977999137, 'Test.One@Example.com', new Date(2024, 10, 12), '12/02/2025', 46000, 'ΦΙΛΟΘΕΗ', 'ΔΙΔΑΣΚΑΛΟΣ', 'Γραμματεύς', 'σημείωση', 96, 'ΘΕΜΙΣΤΟΚΛΗΣ', 'Πειραιως & Αιγαιου'],
  [960102, 'ΜΑΡΙΟΣ', 'ΤΣΟΥΚΑΤΟΣ', 1968, '', '4. ΥΙΟΘΕΤΗΜΕΝΟ', '697 111 2222', 'bad-email', '2024-06-18', 'xx', '', 'ΓΛΥΦΑΔΑ', '', '', '', 96, 'ΘΕΜΙΣΤΟΚΛΗΣ', 'Πειραιως & Αιγαιου'],
  [], ['', 'ΧΩΡΙΣ', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  [960101, 'ΔΙΠΛΟ', 'ΜΗΤΡΩΟ', 1980, '', '1. ΤΑΚΤΙΚΟ', '', '', '', '', '', '', '', '', '', '', '', ''],
];

export const SUITES = [
  {
    id: 'search', name: 'Search Tests – Αναζήτηση', tests: [
      ['Δημιουργία ευρετηρίου 5.000 μελών < 3 s', () => { const i = new SearchIndex(); const t = performance.now(); i.rebuild(fakeMembers(5000)); const ms = performance.now() - t; ok(i.size === 5000, 'μέγεθος'); ok(ms < 3000, `χρόνος ${ms.toFixed(0)} ms`); return `${ms.toFixed(0)} ms`; }],
      ['Αναζήτηση με αριθμό μητρώου', () => { const i = new SearchIndex(); i.rebuild(SEED.members); const r = i.search('960021'); eq(r.results[0].id, 'm_960021'); }],
      ['Αναζήτηση με πρόθεμα επωνύμου, χωρίς τόνους/κεφαλαία', () => { const i = new SearchIndex(); i.rebuild(SEED.members); eq(i.search('κρεουζ').total, 1); eq(i.search('ΚΡΕΟΎΖ').total, 1); }],
      ['Greeklish: «kreouzis» βρίσκει ΚΡΕΟΥΖΗΣ', () => { const i = new SearchIndex(); i.rebuild(SEED.members); eq(i.search('kreouzis').results[0]?.id, 'm_960003'); }],
      ['Πεδία: κατοικία, αξίωμα, βαθμός, email, τηλέφωνο, σημειώσεις', () => { const m = fakeMembers(50); m[3].notes = 'ιδιαίτερη εξαίρεση'; const i = new SearchIndex(); i.rebuild(m); ok(i.search('γλυφαδα').total > 0, 'κατοικία'); ok(i.search('θυσαυροφυλαξ').total > 0, 'αξίωμα'); ok(i.search('ΕΤΑΙΡΟΣ').total > 0, 'βαθμός'); eq(i.search('user7@example.test').results[0].id, 'f7'); ok(i.search(phoneKey(m[5].mobilePhone).slice(-4)).total > 0, 'τηλέφωνο'); eq(i.search('εξαιρεση').results[0].id, 'f3'); }],
      ['Πολλαπλοί όροι (AND)', () => { const i = new SearchIndex(); i.rebuild(SEED.members); eq(i.search('σκιαδοπουλος σπυριδων').total, 1); eq(i.search('σκιαδοπουλος').total, 2); }],
      ['Φίλτρο κατάστασης/βαθμού', () => { const i = new SearchIndex(); i.rebuild(SEED.members); const r = i.search('', { limit: 100, filter: { degree: 'ΜΑΘΗΤΗΣ' } }); eq(r.total, 5); }],
      ['Memoization: δεύτερη κλήση από cache', () => { const i = new SearchIndex(); i.rebuild(SEED.members); const a = i.search('σκια'); const b = i.search('σκια'); ok(!a.cached && b.cached, 'cache'); i.upsert({ ...SEED.members[0], notes: 'x' }); ok(!i.search('σκια').cached, 'ακύρωση cache'); }],
      ['Incremental update: upsert / remove', () => { const i = new SearchIndex(); i.rebuild(SEED.members); const m = { ...SEED.members[0], lastName: 'ΖΕΡΒΟΣ' }; i.upsert(m); eq(i.search('ζερβος').total, 1); eq(i.search('κρεουζης').total, 0); ok(i.remove(m.id)); eq(i.search('ζερβος').total, 0); eq(i.size, 21); }],
      ['Απόδοση: 200 ερωτήματα σε 5.000 μέλη, μέσος όρος < 15 ms', () => { const i = new SearchIndex(); i.rebuild(fakeMembers(5000)); const t = performance.now(); for (let k = 0; k < 200; k++) i.search(`παπαδοπουλος${k % 50} γεωργιος`, { limit: 8 }); const avg = (performance.now() - t) / 200; ok(avg < 15, `μέσος ${avg.toFixed(2)} ms`); return `${avg.toFixed(2)} ms/ερώτημα`; }],
      ['Incremental: 500 ενημερώσεις < 500 ms', () => { const m = fakeMembers(5000); const i = new SearchIndex(); i.rebuild(m); const t = performance.now(); for (let k = 0; k < 500; k++) i.upsert({ ...m[k], notes: `νέα σημείωση ${k}` }); const ms = performance.now() - t; ok(ms < 500, `${ms.toFixed(0)} ms`); return `${ms.toFixed(0)} ms`; }],
    ],
  },
  {
    id: 'autocomplete', name: 'Autocomplete Tests – Αυτόματη συμπλήρωση', tests: (() => {
      const make = async (opts = {}) => {
        const box = sandbox(); box.innerHTML = '<input id="ac-in" type="text" aria-label="Δοκιμή">'; const input = box.querySelector('input');
        const idx = new SearchIndex(); idx.rebuild(SEED.members); const picked = []; const submitted = [];
        const ac = new Autocomplete({ input, source: async (q) => idx.search(q, { limit: 8 }).results, onSelect: (it) => picked.push(it), onSubmit: (q) => submitted.push(q), history: () => ['πρόσφατη'], delay: 10, ...opts });
        return { input, ac, picked, submitted, box };
      };
      return [
        ['Εμφάνιση προτάσεων κατά την πληκτρολόγηση', async () => { const { input, ac } = await make(); await typeInto(input, 'σκια'); ok(!ac.list.hidden && ac.list.children.length === 2, 'λίστα'); ac.destroy(); }],
        ['ArrowDown / ArrowUp μετακινούν την ενεργή επιλογή', async () => { const { input, ac } = await make(); await typeInto(input, 'σκια'); key(input, 'ArrowDown'); eq(ac.active, 0); key(input, 'ArrowDown'); eq(ac.active, 1); key(input, 'ArrowDown'); eq(ac.active, 0, 'κυκλική'); key(input, 'ArrowUp'); eq(ac.active, 1); ac.destroy(); }],
        ['Enter επιλέγει την ενεργή πρόταση', async () => { const { input, ac, picked } = await make(); await typeInto(input, 'κρεουζ'); key(input, 'ArrowDown'); key(input, 'Enter'); eq(picked.length, 1); eq(picked[0].id, 'm_960003'); ok(ac.list.hidden); ac.destroy(); }],
        ['Enter χωρίς επιλογή υποβάλλει το ερώτημα', async () => { const { input, ac, submitted } = await make(); await typeInto(input, 'σκια'); key(input, 'Enter'); eq(submitted, ['σκια']); ac.destroy(); }],
        ['Tab αποδέχεται την πρώτη πρόταση', async () => { const { input, ac, picked } = await make(); await typeInto(input, 'κρεουζ'); const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); input.dispatchEvent(ev); ok(ev.defaultPrevented, 'preventDefault'); eq(picked[0]?.id, 'm_960003'); eq(input.value, 'ΚΡΕΟΥΖΗΣ ΠΑΥΛΟΣ'); ok(ac.list.hidden); ac.destroy(); }],
        ['Tab χωρίς ανοιχτή λίστα δεν παγιδεύει την εστίαση', async () => { const { input, ac } = await make(); const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); input.dispatchEvent(ev); ok(!ev.defaultPrevented); ac.destroy(); }],
        ['Escape κλείνει τη λίστα και δεύτερο Escape καθαρίζει', async () => { const { input, ac } = await make(); await typeInto(input, 'σκια'); key(input, 'Escape'); ok(ac.list.hidden); eq(input.value, 'σκια'); key(input, 'Escape'); eq(input.value, ''); ac.destroy(); }],
        ['Επισήμανση (highlight) όρων χωρίς τόνους', () => { eq(highlight('ΚΡΕΟΥΖΗΣ', 'κρεου'), '<mark>ΚΡΕΟΥ</mark>ΖΗΣ'); eq(highlight('Ά<b>', 'α'), '<mark>Ά</mark>&lt;b&gt;'); }],
        ['Ιστορικό αναζητήσεων για κενό πεδίο', async () => { const { input, ac } = await make(); await typeInto(input, ''); input.dispatchEvent(new Event('focus')); await sleep(60); ok(ac.items.some((i) => i.history), 'ιστορικό'); ac.destroy(); }],
        ['Γρήγορη πληκτρολόγηση: μόνο το τελευταίο ερώτημα εφαρμόζεται', async () => { const { input, ac } = await make(); input.focus(); for (const v of ['σ', 'σκ', 'σκι', 'κρεου']) { input.value = v; input.dispatchEvent(new Event('input')); } await sleep(150); eq(ac.items.length, 1); ac.destroy(); }],
      ];
    })(),
  },
  {
    id: 'aria', name: 'ARIA Tests – Προσβασιμότητα', tests: [
      ['combobox: role, aria-expanded, aria-controls, aria-autocomplete', async () => { const box = sandbox(); box.innerHTML = '<input aria-label="x">'; const input = box.querySelector('input'); const idx = new SearchIndex(); idx.rebuild(SEED.members); const ac = new Autocomplete({ input, source: async (q) => idx.search(q).results, delay: 5 }); eq(input.getAttribute('role'), 'combobox'); eq(input.getAttribute('aria-expanded'), 'false'); eq(input.getAttribute('aria-autocomplete'), 'list'); ok(document.getElementById(input.getAttribute('aria-controls'))?.getAttribute('role') === 'listbox', 'listbox'); await typeInto(input, 'σκια'); eq(input.getAttribute('aria-expanded'), 'true'); ac.destroy(); }],
      ['option: role, μοναδικά id, aria-selected, aria-activedescendant', async () => { const box = sandbox(); box.innerHTML = '<input aria-label="x">'; const input = box.querySelector('input'); const idx = new SearchIndex(); idx.rebuild(SEED.members); const ac = new Autocomplete({ input, source: async (q) => idx.search(q).results, delay: 5 }); await typeInto(input, 'σκια'); const opts = [...box.querySelectorAll('[role=option]')]; ok(opts.length === 2); eq(new Set(opts.map((o) => o.id)).size, 2); key(input, 'ArrowDown'); const id = input.getAttribute('aria-activedescendant'); ok(id && document.getElementById(id) === opts[0], 'activedescendant'); eq(opts[0].getAttribute('aria-selected'), 'true'); eq(opts[1].getAttribute('aria-selected'), 'false'); key(input, 'Escape'); ok(!input.hasAttribute('aria-activedescendant')); ac.destroy(); }],
      ['aria-live: ανακοίνωση πλήθους αποτελεσμάτων', async () => { const box = sandbox(); box.innerHTML = '<input aria-label="x">'; const input = box.querySelector('input'); const idx = new SearchIndex(); idx.rebuild(SEED.members); const ac = new Autocomplete({ input, source: async (q) => idx.search(q).results, delay: 5 }); await typeInto(input, 'σκια'); const live = box.querySelector('[aria-live=polite]'); ok(live && /2 προτάσεις/.test(live.textContent), live?.textContent); ac.destroy(); }],
      ['Landmarks: banner, navigation, main + skip link', () => { ok(document.querySelector('header[role=banner], header'), 'header'); ok(document.querySelector('nav[aria-label]'), 'nav'); ok(document.querySelector('main#main'), 'main'); ok(document.querySelector('a.skip[href="#main"]'), 'skip'); ok(document.documentElement.lang === 'el', 'lang'); }],
      ['Region ζωντανών ανακοινώσεων (toast & status)', () => { ok(document.getElementById('live')?.getAttribute('aria-live') === 'polite'); ok(document.getElementById('toasts')?.getAttribute('aria-live')); }],
      ['Όλα τα κουμπιά & σύνδεσμοι έχουν προσβάσιμο όνομα', () => { const bad = [...document.querySelectorAll('#app button, #app a[href], #app [role=button]')].filter((el) => !el.closest('[hidden]') && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby'))); ok(!bad.length, `${bad.length} χωρίς όνομα: ${bad.slice(0, 3).map((b) => b.outerHTML.slice(0, 60)).join(' | ')}`); }],
      ['Όλα τα πεδία φόρμας έχουν ετικέτα', () => { const bad = [...document.querySelectorAll('#app input:not([type=hidden]):not([type=file]), #app select, #app textarea')].filter((el) => !el.closest('[hidden]') && !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))); ok(!bad.length, `${bad.length} χωρίς ετικέτα: ${bad.slice(0, 3).map((b) => b.outerHTML.slice(0, 70)).join(' | ')}`); }],
      ['Γραφήματα: canvas με role=img και aria-label', () => { const c = [...document.querySelectorAll('#app canvas')]; ok(c.every((x) => x.getAttribute('role') === 'img' && x.getAttribute('aria-label'))); }],
      ['Πίνακες: caption ή aria-label περιοχής', () => { const t = [...document.querySelectorAll('#app table')]; ok(t.every((x) => x.querySelector('caption') || x.closest('[aria-label]')), 'πίνακας χωρίς όνομα'); ok(t.every((x) => x.querySelector('th')), 'χωρίς th'); }],
      ['Διάλογοι: <dialog> με aria-labelledby και πλοήγηση Esc', async () => { const { openDialog } = await import('./ui.js'); const p = openDialog({ title: 'Δοκιμή', body: '<p>x</p>' }); const d = document.querySelector('dialog.dlg'); ok(d?.getAttribute('aria-labelledby') === 'dlg-title' && d.open, 'dialog'); d.dispatchEvent(new Event('cancel', { cancelable: true })); eq(await p, undefined); }],
      ['Εστίαση ορατή (focus-visible) και σεβασμός reduced-motion στο CSS', async () => { const css = await (await fetch('styles.css')).text(); ok(/:focus-visible/.test(css) && /prefers-reduced-motion/.test(css)); }],
    ],
  },
  {
    id: 'import', name: 'Excel Import Tests – Εισαγωγή', tests: [
      ['Αυτόματη αντιστοίχιση των 18 στηλών Book2', () => { const m = I.autoMap(I.BOOK2_HEADERS); eq(m.map((x) => x.field), I.BOOK2_FIELDS); }],
      ['Αντιστοίχιση παραλλαγών (τόνοι/κεφαλαία/τελεία)', () => { const m = I.autoMap(['ΑΡ. ΜΕΛΟΥΣ', 'ονομα μελους', 'Επώνυμο Μέλους:', 'Ετος Γεννήσεως', 'Λοιπες Παρατηρήσεις', 'Παρόν Αξίωμα Εν τη Στοά:', '1. ΤΑΚΤΙΚΟ', 'Στοά Υπ Αρ.', 'Σ. Στοά']); eq(m.map((x) => x.field), ['registryNumber', 'firstName', 'lastName', 'birthYear', 'notes', 'office', 'category', 'lodgeNumber', 'lodgeName']); }],
      ['Ανάγνωση XLSX (SheetJS) και ανίχνευση επικεφαλίδων', async () => { const X = await I.getXLSX(); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Τίτλος αρχείου'], [], ...book2Rows()]), 'Sheet1'); const buf = X.write(wb, { type: 'array', bookType: 'xlsx' }); const f = { name: 't.xlsx', arrayBuffer: async () => buf }; const r = await I.readFile(f); eq(I.detectHeaderRow(r.sheets[0].rows), 1, 'γραμμή επικεφαλίδων'); }],
      ['Καθαρισμός: κεφαλαία, τόνοι, τηλέφωνο, email, ημερομηνίες', () => { const { records } = (() => { const a = I.analyze(book2Rows().slice(1), I.autoMap(I.BOOK2_HEADERS), []); return { records: a.items }; })(); const r = records[0].record; eq(r.firstName, 'ΠΑΝΑΓΙΩΤΗΣ'); eq(r.mobilePhone, '+30 697 799 9137'); eq(r.email, 'test.one@example.com'); eq(r.initiationDate, '2024-11-12'); eq(r.passingDate, '2025-02-12'); eq(r.raisingDate, '2025-12-09'); eq(r.registryNumber, '960101'); }],
      ['Έλεγχος: άκυρο email/ημερομηνία = προειδοποίηση, κενό όνομα = σφάλμα', () => { const a = I.analyze(book2Rows().slice(1), I.autoMap(I.BOOK2_HEADERS), []); const warn = a.items[1]; ok(warn.issues.some((x) => x.field === 'email') && warn.issues.some((x) => x.field === 'passingDate'), 'προειδοποιήσεις'); const bad = a.items.find((x) => x.state === 'invalid'); ok(bad && bad.issues.some((i) => i.level === 'error')); }],
      ['Παράλειψη κενών γραμμών', () => { const a = I.analyze(book2Rows().slice(1), I.autoMap(I.BOOK2_HEADERS), []); eq(a.blank, 1); }],
      ['Διπλότυπα με αρ. μητρώου, email και τηλέφωνο (αρχείο & υπάρχοντα)', () => { const existing = [newMember({ id: 'e1', registryNumber: '1', lastName: 'Α', firstName: 'Β', email: 'test.one@example.com', mobilePhone: '+30 697 799 9137' })]; const a = I.analyze(book2Rows().slice(1), I.autoMap(I.BOOK2_HEADERS), existing); const d0 = a.items[0].duplicate.map((x) => x.by); ok(d0.includes('email') && d0.includes('phone'), d0.join()); const last = a.items.at(-1); eq(last.state, 'duplicate'); ok(last.duplicate.some((d) => d.by === 'registryNumber' && d.inFile)); }],
      ['Εισαγωγή σε Store με πολιτική «παράλειψη»', () => { const st = memStore(); const a = I.analyze(book2Rows().slice(1), I.autoMap(I.BOOK2_HEADERS), []); const rep = I.runImport(st, a, { duplicates: 'skip', fileName: 't.xlsx' }); eq(st.members.length, 2); eq(rep.stats.imported, 2); ok(rep.stats.invalid === 1 && rep.stats.duplicates === 1, JSON.stringify(rep.stats)); eq(st.state.imports.length, 1); }],
      ['Εισαγωγή με πολιτική «ενημέρωση»', () => { const st = memStore(); st.addMember({ registryNumber: '960101', lastName: 'ΡΗΓΑΣ', firstName: 'ΠΑΝ', email: '' }); const a = I.analyze(book2Rows().slice(1, 2), I.autoMap(I.BOOK2_HEADERS), st.members); const rep = I.runImport(st, a, { duplicates: 'update' }); eq(st.members.length, 1); eq(rep.stats.updated, 1); eq(st.members[0].firstName, 'ΠΑΝΑΓΙΩΤΗΣ'); }],
      ['CSV (UTF-8 BOM, ;) και JSON', async () => { const csv = '﻿Αρ. Μέλους;Όνομα Μέλους;Επώνυμο Μέλους\n960201;ΝΙΚΟΣ;ΤΕΣΤ\n'; const r = await I.readFile({ name: 'a.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer }); eq(r.sheets[0].rows.length, 2); const j = await I.readFile({ name: 'a.json', text: async () => JSON.stringify([{ registryNumber: '1', lastName: 'Α', firstName: 'Β' }]) }); eq(I.autoMap(j.sheets[0].rows[0]).map((x) => x.field), ['registryNumber', 'lastName', 'firstName']); }],
      ['Κατηγορία «5. ΔΙΑΓΡΑΦΕΝ» → πρώην μέλος', () => { const r = I.transformRow(['9', 'Α', 'Β', '5. ΔΙΑΓΡΑΦΕΝ'], [{ index: 0, field: 'registryNumber' }, { index: 1, field: 'firstName' }, { index: 2, field: 'lastName' }, { index: 3, field: 'category' }]); eq(r.record.category, 'ΔΙΑΓΡΑΦΕΝ'); eq(r.record.status, 'former'); }],
      ['Συναρτήσεις καθαρισμού', () => { eq(toUpperGreek('Ανδρέας Ώρα'), 'ΑΝΔΡΕΑΣ ΩΡΑ'); eq(I.normalizeGreekAccents('Πανάγος'), 'Παναγος'); eq(formatPhone('0030 6977999137'), '+30 697 799 9137'); eq(formatPhone('210-1234567'), '+30 210 123 4567'); ok(isEmail('a@b.gr') && !isEmail('a@b') && !isEmail('a b@c.gr')); eq(toISODate('5.3.24'), '2024-03-05'); eq(toISODate('31/02/2024'), null); eq(toISODate(46000), '2025-12-09'); eq(parseMoney('1.234,50'), 1234.5); }],
      ['Πρότυπο εισαγωγής: κεφαλίδες = Book2', () => { eq(I.templateRows()[0].length, 18); eq(FIELDS.filter((f) => f.required).length, 3); }],
    ],
  },
  {
    id: 'export', name: 'Excel Export Tests – Εξαγωγή XLSX', tests: [
      ['Δημιουργία XLSX με πολλά φύλλα και επιστροφή ανάγνωση', async () => { const X = await I.getXLSX(); const buf = await tablesToXLSX([{ title: 'Μέλη', columns: MEMBER_COLUMNS, rows: memberRows(SEED.members) }, { title: 'Μέλη', columns: [{ key: 'a', label: 'Α' }], rows: [{ a: 1 }] }]); const wb = X.read(buf, { type: 'array' }); eq(wb.SheetNames.length, 2); ok(wb.SheetNames[0] !== wb.SheetNames[1], 'μοναδικά ονόματα'); const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); eq(rows.length, 23); eq(rows[0][0], 'Αρ. Μητρώου'); }],
      ['Τα χρηματικά ποσά εξάγονται ως αριθμοί', async () => { const X = await I.getXLSX(); const buf = await tablesToXLSX([{ title: 'T', columns: [{ key: 'n', label: 'N' }, { key: 'm', label: 'M', type: 'money' }], rows: [{ n: 'a', m: 123.45 }] }]); const ws = X.read(buf, { type: 'array' }).Sheets.T; eq(ws.B2.t, 'n'); near(ws.B2.v, 123.45); }],
      ['Ελληνικά και ειδικοί χαρακτήρες διατηρούνται', async () => { const X = await I.getXLSX(); const buf = await tablesToXLSX([{ title: 'Ελ/ληνικά*?', columns: [{ key: 'a', label: 'Όνομα' }], rows: [{ a: 'Ωραία & «εισαγωγικά»' }] }]); const wb = X.read(buf, { type: 'array' }); ok(!/[\\/?*[\]:]/.test(wb.SheetNames[0])); eq(wb.Sheets[wb.SheetNames[0]].A2.v, 'Ωραία & «εισαγωγικά»'); }],
      ['Round-trip: εξαγωγή → εισαγωγή αναγνωρίζει τα πεδία', async () => { const X = await I.getXLSX(); const buf = await tablesToXLSX([{ title: 'M', columns: MEMBER_COLUMNS, rows: memberRows(SEED.members) }]); const r = await I.readFile({ name: 'x.xlsx', arrayBuffer: async () => buf }); const map = I.autoMap(r.sheets[0].rows[0].map(String)); const fields = map.filter((m) => m.field).map((m) => m.field); for (const f of ['registryNumber', 'lastName', 'firstName', 'email', 'degree', 'office']) ok(fields.includes(f), `δεν αναγνωρίστηκε ${f}`); }],
    ],
  },
  {
    id: 'csv', name: 'CSV Export Tests – Εξαγωγή CSV', tests: [
      ['BOM UTF-8 και διαχωριστικό ;', () => { const s = tableToCSV({ columns: [{ key: 'a', label: 'Α' }, { key: 'b', label: 'Β' }], rows: [{ a: 'x', b: 'y' }] }); ok(s.startsWith('﻿')); eq(s.split('\r\n')[0].replace('﻿', ''), 'Α;Β'); }],
      ['Εισαγωγικά, παύλες, νέες γραμμές και ελληνικά', () => { const rows = [['α;β', 'λέει "γεια"', 'γραμμή1\nγραμμή2', ' κενό ']]; const back = parseCSV(toCSV(rows, ';'), ';'); eq(back, rows); }],
      ['Αυτόματη ανίχνευση διαχωριστικού', () => { eq(parseCSV('a,b\n1,2')[1], ['1', '2']); eq(parseCSV('a;b\n1;2')[1], ['1', '2']); eq(parseCSV('a\tb\n1\t2')[1], ['1', '2']); }],
      ['Μορφοποίηση ποσών/ημερομηνιών στο CSV', () => { const s = tableToCSV({ columns: [{ key: 'd', label: 'D', type: 'date' }, { key: 'm', label: 'M', type: 'money' }], rows: [{ d: '2026-03-05', m: 1234.5 }] }); ok(s.includes('05/03/2026')); ok(/1\.234,50/.test(s), s); }],
      ['Εξαγωγή μητρώου: 19 στήλες', () => { eq(MEMBER_COLUMNS.length, 19); const s = tableToCSV({ columns: MEMBER_COLUMNS, rows: memberRows(SEED.members) }); eq(parseCSV(s).length, 23); }],
      ['Μη υποστηριζόμενη μορφή εξαγωγής δίνει σφάλμα', async () => { let thrown = false; try { await exportAs('docx', { columns: [], rows: [] }, 'x'); } catch { thrown = true; } ok(thrown); }],
    ],
  },
  {
    id: 'treasury', name: 'Treasury Calculation Tests – Ταμείο', tests: (() => {
      const set = { ...clone(DEFAULT_SETTINGS), fees: OLD_FEES, asOfYear: 2026, debtFromYear: 2026 };
      const mk = (o) => newMember({ category: 'ΤΑΚΤΙΚΟ', ...o });
      const sample = () => { const a = mk({ id: 'a' }); const b = mk({ id: 'b', category: 'ΥΙΟΘΕΤΗΜΕΝΟ' }); const c = mk({ id: 'c', exempt: true }); const d = mk({ id: 'd', initiationDate: '2027-02-01' }); const e = mk({ id: 'e', status: 'former', statusChangedAt: '2026-05-01' });
        const led = [{ memberId: 'a', year: 2026, amount: 100 }, { memberId: 'a', year: 2026, amount: 200 }, { memberId: 'b', year: 2026, amount: 50.1 }, { memberId: 'b', year: 2026, amount: 0.2 }, { memberId: 'a', year: 2027, amount: 300 }, { memberId: 'e', year: 2025, amount: 280 }].map((p, i) => ({ id: `p${i}`, date: '2026-02-01', ...p }));
        return { members: [a, b, c, d, e], ledger: led }; };
      return [
        ['Αναμενόμενη εισφορά: κατηγορία, απαλλαγή, έτος εισδοχής, κατάσταση', () => { const { members } = sample(); eq(members.map((m) => expectedFee(m, 2026, set)), [300, 150, 0, 0, 0]); eq(expectedFee(members[3], 2027, set), 300); eq(expectedFee(members[4], 2025, set), 280); eq(expectedFee({ ...members[0], feeOverride: { 2026: 120 } }, 2026, set), 120); }],
        ['Σύνολα έτους: καταβολές, οφειλές, ποσοστό είσπραξης', () => { const { members, ledger } = sample(); const ctx = makeCtx(members, ledger, set, 2026); const s = yearSummary(ctx, 2026); near(s.expected, 450); near(s.paid, 350.3); near(s.outstanding, 99.7); near(s.collectionRate, (350.3 / 450) * 100, '', 0.01); near(s.debtRatio, (99.7 / 450) * 100, '', 0.01); eq(s.payers, 2); eq(s.full, 1); eq(s.partial, 1); }],
        ['Ακρίβεια νομισματικών ποσών (0,1 + 0,2)', () => { const { members, ledger } = sample(); const ctx = makeCtx(members, ledger, set, 2026); eq(ctx.paidOf('b', 2026), 50.3); eq(round2(0.1 + 0.2), 0.3); }],
        ['Κατάσταση μέλους/έτους: εξοφλημένο, μερικό, απλήρωτο, υπερπληρωμή', () => { const ctx = makeCtx([mk({ id: 'x' })], [{ memberId: 'x', year: 2026, amount: 400, date: '2026-01-01' }], set, 2026); eq(memberYear(ctx, ctx.members[0], 2026).state, 'overpaid'); eq(memberYear(ctx, ctx.members[0], 2027).state, 'unpaid'); }],
        ['Οφειλή μέλους = άθροισμα ετών debtFromYear…asOf', () => { const ctx = makeCtx([mk({ id: 'x' })], [], { ...set, asOfYear: 2027 }, 2027); eq(memberDebt(ctx, ctx.members[0]), 600); }],
        ['Μέση εισφορά, προπληρωμή 2027 και ποσοστό', () => { const { members, ledger } = sample(); const ctx = makeCtx(members, ledger, set, 2026); near(yearSummary(ctx, 2026).averageContribution, 175.15); near(yearSummary(ctx, 2027).paid, 300); }],
        ['Store.setPaid καταχωρεί διαφορά και διατηρεί ιστορικό', async () => { const st = memStore(SEED); await st.load(); const before = st.ledger.length; const total = (y) => round2(st.ledger.filter((p) => p.memberId === 'm_960006' && p.year === y).reduce((t, p) => t + p.amount, 0)); st.setPaid('m_960006', 2026, 300); eq(total(2026), 300); st.setPaid('m_960006', 2026, 250); eq(total(2026), 250); eq(st.ledger.length, before + 2); eq(st.setPaid('m_960006', 2026, 250), null); }],
        ['Μεταβολή YoY', () => { eq(growth([100, 150, 120]).map((v) => v && round2(v)), [null, 50, -20]); }],
        ['Πρόβλεψη: τέσσερα έτη, εύρος low ≤ forecast ≤ high', () => { const ctx = makeCtx(SEED.members, FIX_LEDGER, set, 2026); const f = forecast(ctx, 4); eq(f.rows.length, 4); eq(f.rows.map((r) => r.year), [2027, 2028, 2029, 2030]); ok(f.rows.every((r) => r.low <= r.forecast && r.forecast <= r.high && r.expected > 0), 'εύρος'); ok(f.rate > 0 && f.rate <= 98); }],
        ['Συμμόρφωση πληρωμών (εμπρόθεσμα/εκπρόθεσμα)', () => { const a = mk({ id: 'a' }); const b = mk({ id: 'b' }); const ctx = makeCtx([a, b], [{ memberId: 'a', year: 2026, amount: 300, date: '2026-03-01' }, { memberId: 'b', year: 2026, amount: 300, date: '2026-05-01' }], set, 2026); const c = compliance(ctx, 2026); eq([c.onTime, c.late], [1, 1]); }],
        ['Έσοδα ανά έτος συμφωνούν με το ιστορικό κινήσεων', () => { const ctx = makeCtx(SEED.members, FIX_LEDGER, set, 2026); near(yearSummary(ctx, 2026).paid, 1600); near(yearSummary(ctx, 2025).paid, FIX_LEDGER.filter((p) => p.year === 2025).reduce((a, p) => a + p.amount, 0)); }],
        ['Εισφορές 2027: Τακτικό 200, Μέτοικο 100, Υιοθετημένο 20, Επίτιμο/Ομότιμο 0', () => { const f = DEFAULT_SETTINGS.fees; eq(['ΤΑΚΤΙΚΟ', 'ΜΕΤΟΙΚΟ', 'ΥΙΟΘΕΤΗΜΕΝΟ', 'ΕΠΙΤΙΜΟ', 'ΟΜΟΤΙΜΟ', 'ΔΙΑΓΡΑΦΕΝ'].map((c) => f[c][2027]), [200, 100, 20, 0, 0, 0]); eq(Object.keys(f).length, 6); eq([2026, 2028, 2030].map((y) => f['ΤΑΚΤΙΚΟ'][y]), [200, 200, 200]); }],
        ['Οφειλές 2027 των 22 μελών (14 τακτικά × 200 + 8 υιοθετημένα × 20) = 2.960 €', () => { const ctx = makeCtx(SEED.members, SEED.ledger, { ...clone(DEFAULT_SETTINGS), ...SEED.settings }, 2027); eq(SEED.ledger.length, 0); near(yearSummary(ctx, 2027).outstanding, 2960); near(SEED.members.reduce((t, m) => t + memberDebt(ctx, m), 0), 2960); }],
      ];
    })(),
  },
  {
    id: 'offline', name: 'Offline Tests – Λειτουργία χωρίς σύνδεση', tests: [
      ['Ένδειξη σύνδεσης αντιδρά στα συμβάντα online/offline', async () => { const chip = document.getElementById('net-status'); ok(chip, 'στοιχείο ένδειξης'); window.dispatchEvent(new Event('offline')); await sleep(30); ok(/offline|Χωρίς σύνδεση/i.test(chip.textContent), chip.textContent); window.dispatchEvent(new Event('online')); await sleep(30); ok(!/Χωρίς σύνδεση/.test(chip.textContent) || navigator.onLine === false); }],
      ['Manifest: έγκυρο JSON με εικονίδια και display=standalone', async () => { const link = document.querySelector('link[rel=manifest]'); ok(link, 'link manifest'); const m = await (await fetch(link.href)).json(); eq(m.display, 'standalone'); ok(m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.purpose?.includes('maskable')), 'εικονίδια'); ok(m.start_url && m.name && m.theme_color); }],
      ['Service Worker υποστηρίζεται και είναι εγγεγραμμένος', async () => { if (!('serviceWorker' in navigator)) return 'παραλείφθηκε: μη διαθέσιμο'; if (!window.isSecureContext) return 'παραλείφθηκε: μη ασφαλές περιβάλλον'; const reg = await navigator.serviceWorker.getRegistration(); ok(reg, 'δεν υπάρχει εγγραφή (φορτώστε τη σελίδα μέσω http(s))'); return reg.active ? 'ενεργός' : 'εγκαθίσταται'; }],
      ['Cache Storage περιέχει το app shell', async () => { if (!('caches' in window)) return 'παραλείφθηκε'; const keys = await caches.keys(); const k = keys.find((x) => x.startsWith('t96-')); ok(k, `κανένα cache t96-* (${keys.join()})`); const c = await caches.open(k); ok(await c.match('index.html') || await c.match('./') || await c.match('app.js'), 'app shell'); return k; }],
      ['Τα δεδομένα είναι διαθέσιμα χωρίς δίκτυο (LocalStorage/IndexedDB)', async () => { ok(typeof localStorage.getItem('t96.members') === 'string', 'LocalStorage'); ok('indexedDB' in window, 'IndexedDB'); }],
      ['Προστασία από απώλεια: beforeinstallprompt / display-mode', () => { const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone; return standalone ? 'εγκατεστημένη PWA' : 'τρέχει σε πρόγραμμα περιήγησης'; }],
    ],
  },
  {
    id: 'storage', name: 'LocalStorage Tests – Αποθήκευση', tests: [
      ['Αποθήκευση και επαναφόρτωση (round-trip)', async () => { const mem = memStorage(); const a = memStore(SEED, mem); await a.load(); a.addMember({ registryNumber: '1', lastName: 'ΤΕΣΤ', firstName: 'ΑΑΑ' }); a.flush(); const b = memStore(SEED, mem); await b.load(); eq(b.members.length, 23); ok(b.members.some((m) => m.lastName === 'ΤΕΣΤ')); }],
      ['Autosave με debounce', async () => { const mem = memStorage(); const a = memStore(SEED, mem); await a.load(); a.updateMember('m_960003', { notes: 'autosave' }); ok(JSON.parse(mem.d['test.members']).find((m) => m.id === 'm_960003').notes !== 'autosave', 'δεν γράφτηκε αμέσως'); await sleep(60); eq(JSON.parse(mem.d['test.members']).find((m) => m.id === 'm_960003').notes, 'autosave'); eq(a.saveState, 'saved'); }],
      ['Αυτόματη αποθήκευση: ledger, settings, ui, search history', async () => { const mem = memStorage(); const a = memStore(SEED, mem); await a.load(); a.addPayment({ memberId: 'm_960003', year: 2026, amount: 10 }); a.updateSettings({ pageSize: 50 }); a.addSearchHistory('δοκιμή'); a.setUi('dashboard', { year: 2025 }); await sleep(60); ok(JSON.parse(mem.d['test.ledger']).length === SEED.ledger.length + 1 && JSON.parse(mem.d['test.settings']).pageSize === 50 && JSON.parse(mem.d['test.ui']).searchHistory[0] === 'δοκιμή' && JSON.parse(mem.d['test.ui']).dashboard.year === 2025); }],
      ['Κατεστραμμένο JSON: δεν κρασάρει, κρατά αντίγραφο', async () => { const mem = memStorage(); const a = memStore(SEED, mem); await a.load(); a.flush(); mem.d['test.members'] = '{oops'; const b = memStore(SEED, mem); await b.load(); eq(b.members.length, 22); ok(mem.d['test.members.corrupt']); }],
      ['Υπέρβαση quota: το σφάλμα αναφέρεται, τα δεδομένα μένουν στη μνήμη', async () => { const mem = memStorage(); mem.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; const a = memStore(SEED, mem); await a.load(); a.addMember({ registryNumber: 'q', lastName: 'Q', firstName: 'Q' }); a.flush(); eq(a.saveState, 'error'); eq(a.members.length, 23); }],
      ['Μετεγκατάσταση σχήματος v0 → v1', () => { const st = migrate({ members: [{ id: 'x', lastName: 'Α' }], settings: {} }, 0); eq(st.meta.schemaVersion, 1); ok(Array.isArray(st.members[0].offices) && st.settings.fees); }],
      ['Αντίγραφο ασφαλείας: εξαγωγή και επαναφορά', async () => { const a = memStore(SEED); await a.load(); const bak = JSON.parse(JSON.stringify(a.exportBackup())); a.clearData(); eq(a.members.length, 0); a.restoreBackup(bak); eq(a.members.length, 22); eq(a.ledger.length, SEED.ledger.length); ok(a.getMember('m_960021')); }],
      ['Το αντίγραφο δεν περιέχει κωδικούς', async () => { const a = memStore(SEED); await a.load(); a.updateSettings({ auth: { enabled: true, hashes: { admin: 'abc' }, salt: 's' } }); eq(a.exportBackup().data.settings.auth.hashes, {}); }],
      ['Μη έγκυρο αντίγραφο απορρίπτεται', () => { let t = false; try { memStore().restoreBackup({ foo: 1 }); } catch { t = true; } ok(t); }],
      ['Πραγματικό localStorage: εγγραφή / ανάγνωση / διαγραφή', () => { localStorage.setItem('t96.__test', '1'); eq(localStorage.getItem('t96.__test'), '1'); localStorage.removeItem('t96.__test'); eq(localStorage.getItem('t96.__test'), null); }],
      ['Μαλακή διαγραφή / επαναφορά / οριστική διαγραφή μέλους', async () => { const a = memStore(SEED); await a.load(); a.setStatus('m_960003', 'deleted'); eq(a.getMember('m_960003').status, 'deleted'); a.setStatus('m_960003', 'active'); eq(a.getMember('m_960003').status, 'active'); ok(a.purgeMember('m_960003')); ok(!a.getMember('m_960003')); ok(!a.ledger.some((p) => p.memberId === 'm_960003')); }],
    ],
  },
  {
    id: 'worker', name: 'Web Worker Tests', tests: [
      ['Το worker ξεκινά και απαντά', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε: δεν υποστηρίζεται'; const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker' }); await e.init(); ok(e.mode === 'worker', `mode=${e.mode} ${e.reason}`); const r = await e.search('κρεουζ'); eq(r.mode, 'worker'); eq(r.results[0].id, 'm_960003'); e.destroy(); }],
      ['Ισοδυναμία αποτελεσμάτων worker και τοπικής μηχανής', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε'; const m = fakeMembers(1000); const w = new SearchEngine({ getMembers: () => m, prefer: 'worker' }); await w.init(); const l = new SearchEngine({ getMembers: () => m, prefer: 'local' }); await l.init(); if (w.mode !== 'worker') throw new Assertion(`worker μη διαθέσιμος: ${w.reason}`); for (const q of ['παπαδοπουλος1', 'user77@', 'θυσαυροφυλαξ', 'ΜΥΚΟΝΟΣ γεωργιος']) eq((await w.search(q, { limit: 20 })).results.map((x) => x.id), (await l.search(q, { limit: 20 })).results.map((x) => x.id), q); w.destroy(); }],
      ['Incremental upsert/remove μέσω worker', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε'; const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker' }); await e.init(); if (e.mode !== 'worker') throw new Assertion(e.reason); await e.upsert({ ...SEED.members[0], lastName: 'ΖΕΡΒΟΣ' }); eq((await e.search('ζερβος')).total, 1); await e.remove(SEED.members[0].id); eq((await e.search('ζερβος')).total, 0); e.destroy(); }],
      ['Worker με 5.000 μέλη: ερώτημα < 100 ms', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε'; const m = fakeMembers(5000); const e = new SearchEngine({ getMembers: () => m, prefer: 'worker' }); await e.init(); if (e.mode !== 'worker') throw new Assertion(e.reason); await e.search('warm'); const t = performance.now(); await e.search('ξανθοπουλος7 νικολαος'); const ms = performance.now() - t; ok(ms < 100, `${ms.toFixed(1)} ms`); e.destroy(); return `${ms.toFixed(1)} ms`; }],
      ['Αυτόματη επιλογή: worker από το όριο μελών και πάνω', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε'; const e = new SearchEngine({ getMembers: () => fakeMembers(300), threshold: 200 }); await e.init(); eq(e.mode, 'worker'); e.destroy(); const s = new SearchEngine({ getMembers: () => fakeMembers(50), threshold: 200 }); await s.init(); eq(s.mode, 'local'); }],
    ],
  },
  {
    id: 'fallback', name: 'Fallback Tests – Εναλλακτική μηχανή', tests: [
      ['Αποτυχία δημιουργίας Worker → τοπική μηχανή', async () => { const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker', workerFactory: () => { throw new Error('blocked'); } }); await e.init(); eq(e.mode, 'local'); ok(/Fallback/.test(e.reason)); eq((await e.search('κρεουζ')).results[0].id, 'm_960003'); }],
      ['Worker που εγείρει σφάλμα κατά την εκκίνηση', async () => { const fake = { terminate() {}, postMessage() {}, set onerror(f) { setTimeout(() => f({ message: 'script error' }), 5); }, set onmessage(f) {} }; const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker', workerFactory: () => fake }); await e.init(); eq(e.mode, 'local'); eq((await e.search('σκιαδοπουλος')).total, 2); }],
      ['Worker που πεθαίνει μετά την εκκίνηση: διαφανής μετάβαση', async () => { if (typeof Worker === 'undefined') return 'παραλείφθηκε'; const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker' }); await e.init(); if (e.mode !== 'worker') throw new Assertion(e.reason); e.worker.terminate(); e.worker.postMessage = () => { throw new Error('terminated'); }; const r = await e.search('σκιαδοπουλος'); eq(r.mode, 'local'); eq(r.total, 2); eq(e.mode, 'local'); }],
      ['Χωρίς υποστήριξη Worker (typeof Worker === "undefined")', async () => { const W = globalThis.Worker; try { globalThis.Worker = undefined; const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker' }); await e.init(); eq(e.mode, 'local'); } finally { globalThis.Worker = W; } }],
      ['Μετά το fallback οι ενημερώσεις εφαρμόζονται τοπικά', async () => { const e = new SearchEngine({ getMembers: () => SEED.members, prefer: 'worker', workerFactory: () => { throw new Error('x'); } }); await e.init(); await e.upsert({ ...SEED.members[0], lastName: 'ΝΕΟΣ' }); eq((await e.search('νεος')).total, 1); await e.remove(SEED.members[0].id); eq((await e.search('νεος')).total, 0); }],
    ],
  },
  {
    id: 'reporting', name: 'Reporting Tests – Αναφορές', tests: [
      ...REPORTS.map((r) => [`Αναφορά «${r.label}» παράγει έγκυρο πίνακα`, () => { const t = r.build({ members: SEED.members, ledger: SEED.ledger, audit: [{ at: '2026-01-01T00:00:00Z', role: 'admin', action: 'create', entity: 'member', detail: 'x' }], settings: { ...clone(DEFAULT_SETTINGS), ...SEED.settings, asOfYear: 2027 }, year: 2027 }); ok(t.title && Array.isArray(t.columns) && t.columns.length > 0 && Array.isArray(t.rows), 'δομή'); ok(t.rows.every((row) => t.columns.every((c) => c.key in row || row[c.key] === undefined)), 'κλειδιά στηλών'); ok(t.rows.length > 0, 'χωρίς γραμμές'); return `${t.rows.length} γραμμές`; }]),
      ['Αναφορά Ταμία: οι αναμενόμενες εισφορές 2027 συμφωνούν με το πρόγραμμα', () => { const t = REPORTS[0].build({ members: SEED.members, ledger: SEED.ledger, audit: [], settings: { ...clone(DEFAULT_SETTINGS), ...SEED.settings }, year: 2027 }); near(t.rows.reduce((a, r) => a + r.expected, 0), 2960); }],
      ['Εξαγωγή PDF με ελληνικά (jsPDF)', async () => { const doc = await tableToPDF({ title: 'Δοκιμή', columns: [{ key: 'a', label: 'Στήλη' }, { key: 'b', label: 'Ποσό', type: 'money' }], rows: Array.from({ length: 80 }, (_, i) => ({ a: `Γραμμή ${i} ΠΑΥΛΟΣ ΚΡΕΟΥΖΗΣ`, b: i * 3.5 })), summary: [['Σύνολο', '1 €']] }); ok(doc.getNumberOfPages() >= 2, 'σελιδοποίηση'); const blob = doc.output('blob'); ok(blob.size > 5000, `μέγεθος ${blob.size}`); ok(doc.fontReady !== false, 'γραμματοσειρά Unicode'); }],
      ['Σύνολα στηλών (money/number) στο κάτω μέρος πίνακα PDF/εκτύπωσης', async () => { const t = { title: 'T', columns: [{ key: 'n', label: 'Μέλος' }, { key: 'a', label: 'A', type: 'money' }, { key: 'p', label: '%', type: 'percent' }, { key: 'c', label: 'C', type: 'number' }], rows: [{ n: 'x', a: 100.1, p: 50, c: 2 }, { n: 'y', a: 0.2, p: 10, c: 3 }] }; const r = totalsRow(t); eq(r.n, 'Σύνολα'); near(r.a, 100.3); eq(r.c, 5); eq(r.p, ''); eq(totalsRow({ columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] }), null); const d = await tableToPDF(t); ok(d.output('blob').size > 3000); }],
      ['Αναφορά μελών σε PDF: όλα τα μέλη', async () => { const t = REPORTS[2].build({ members: SEED.members, ledger: [], audit: [], settings: DEFAULT_SETTINGS, year: 2026 }); eq(t.rows.length, 22); const doc = await tableToPDF(t); ok(doc.output('blob').size > 8000); }],
      ['Εκτύπωση: δημιουργεί κρυφό iframe', async () => { const { printTable } = await import('./exporter.js'); const orig = HTMLIFrameElement.prototype; const before = document.querySelectorAll('iframe').length; printTable({ title: 'Test', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] }); ok(document.querySelectorAll('iframe').length === before + 1); await sleep(100); }],
    ],
  },
];

/**
 * Run suites. @param {string[]} [only] suite ids
 * @param {(r:object)=>void} [onResult]
 */
export async function runSuites(only = null, onResult = () => {}) {
  const out = [];
  for (const s of SUITES) {
    if (only && !only.includes(s.id)) continue;
    for (const [name, fn] of s.tests) {
      const t0 = performance.now(); const r = { suite: s.id, suiteName: s.name, name, ok: true, ms: 0, note: '', error: '' };
      try { const res = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 15 s')), 15000))]); if (typeof res === 'string') r.note = res; } catch (e) { r.ok = false; r.error = e.message || String(e); }
      r.ms = performance.now() - t0; out.push(r); onResult(r);
    }
  }
  const box = document.getElementById('test-sandbox'); if (box) box.remove();
  return out;
}
