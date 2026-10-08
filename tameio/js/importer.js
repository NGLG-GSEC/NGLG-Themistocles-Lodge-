/**
 * Excel / CSV / JSON import engine: file reading, automatic column mapping, cleansing,
 * validation, duplicate detection and import reports.
 * The Import Wizard UI (views/import.js) drives these functions.
 * @module importer
 */
import { FIELDS, FIELD_MAP, CATEGORIES, DEGREES } from './config.js';
import { normText, toUpperGreek, stripAccents, formatPhone, phoneKey, isEmail, toISODate, parseCSV, loadScript, uid, titleCase } from './utils.js';

/* ------------------------------ cleansing ------------------------------ */
/** Collapse whitespace and trim. */
export const cleanSpaces = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Greek accent normalisation: "Πανάγος" → "Πανάγος" without tonos ("Παναγος"). */
export const normalizeGreekAccents = (s) => stripAccents(cleanSpaces(s));
/** Uppercase conversion (accent free, as used in the lodge registry). */
export const toUppercase = (s) => toUpperGreek(cleanSpaces(s));
export { formatPhone, isEmail };
/** Normalise a date-like value to ISO or return null when invalid. */
export const normalizeDate = toISODate;

const CATEGORY_ALIASES = { ΔΙΕΓΡΑΦΕΝ: 'ΔΙΑΓΡΑΦΕΝ', ΔΙΕΓΡΑΜΜΕΝΟ: 'ΔΙΑΓΡΑΦΕΝ', ΔΙΑΓΡΑΜΜΕΝΟ: 'ΔΙΑΓΡΑΦΕΝ', metoikos: 'ΜΕΤΟΙΚΟ', 'emeritus': 'ΟΜΟΤΙΜΟ', regular: 'ΤΑΚΤΙΚΟ', active: 'ΤΑΚΤΙΚΟ', adopted: 'ΥΙΟΘΕΤΗΜΕΝΟ', affiliated: 'ΥΙΟΘΕΤΗΜΕΝΟ', honorary: 'ΕΠΙΤΙΜΟ', 'struck off': 'ΔΙΑΓΡΑΦΕΝ', struck: 'ΔΙΑΓΡΑΦΕΝ', removed: 'ΔΙΑΓΡΑΦΕΝ' };
const DEGREE_ALIASES = { 'entered apprentice': 'ΜΑΘΗΤΗΣ', apprentice: 'ΜΑΘΗΤΗΣ', ea: 'ΜΑΘΗΤΗΣ', 'fellow craft': 'ΕΤΑΙΡΟΣ', fellowcraft: 'ΕΤΑΙΡΟΣ', fc: 'ΕΤΑΙΡΟΣ', 'master mason': 'ΔΙΔΑΣΚΑΛΟΣ', master: 'ΔΙΔΑΣΚΑΛΟΣ', mm: 'ΔΙΔΑΣΚΑΛΟΣ', '1': 'ΜΑΘΗΤΗΣ', '2': 'ΕΤΑΙΡΟΣ', '3': 'ΔΙΔΑΣΚΑΛΟΣ' };
const STATUS_ALIASES = { ενεργο: 'active', ενεργος: 'active', active: 'active', πρωην: 'former', former: 'former', διαγραφεν: 'former', διαγραμμενο: 'deleted', deleted: 'deleted', αρχειοθετημενο: 'archived', archived: 'archived', 'εκτος': 'former', 'εκτος εδρας': 'former' };

export function normalizeCategory(v) {
  const t = toUpperGreek(String(v ?? '').replace(/^\s*\d+\s*[.)-]\s*/, ''));
  if (!t) return { value: '', known: true };
  if (CATEGORIES[t]) return { value: t, known: true };
  for (const k of Object.keys(CATEGORIES)) if (t.startsWith(k.slice(0, 6))) return { value: k, known: true };
  const a = CATEGORY_ALIASES[t] || CATEGORY_ALIASES[normText(t)];
  return a ? { value: a, known: true } : { value: t, known: false };
}
export function normalizeDegree(v) {
  const t = toUpperGreek(v);
  if (!t) return { value: '', known: true };
  if (DEGREES[t]) return { value: t, known: true };
  for (const k of Object.keys(DEGREES)) if (t.startsWith(k.slice(0, 5))) return { value: k, known: true };
  const a = DEGREE_ALIASES[normText(v)];
  return a ? { value: a, known: true } : { value: t, known: false };
}
export function normalizeStatus(v) {
  const t = normText(v); if (!t) return '';
  return STATUS_ALIASES[t] || '';
}

/* ------------------------------ file reading ------------------------------ */
/**
 * Read a File/ArrayBuffer into sheets of raw rows (array of arrays).
 * @param {File|{name:string, arrayBuffer:()=>Promise<ArrayBuffer>}} file
 * @returns {Promise<{name:string, sheets:{name:string, rows:any[][]}[]}>}
 */
export async function readFile(file) {
  const name = file.name || 'file';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'json') {
    const data = JSON.parse(await file.text());
    const arr = Array.isArray(data) ? data : Array.isArray(data.members) ? data.members : Array.isArray(data.data?.members) ? data.data.members : null;
    if (!arr) throw new Error('Το JSON πρέπει να περιέχει πίνακα εγγραφών');
    const keys = [...arr.reduce((s, o) => { Object.keys(o).forEach((k) => s.add(k)); return s; }, new Set())];
    return { name, sheets: [{ name: 'JSON', rows: [keys, ...arr.map((o) => keys.map((k) => (typeof o[k] === 'object' && o[k] !== null ? JSON.stringify(o[k]) : o[k] ?? '')))] }] };
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const buf = await file.arrayBuffer(); let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1253').decode(buf); // legacy Greek Excel CSV
    return { name, sheets: [{ name: 'CSV', rows: parseCSV(text) }] };
  }
  if (!['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) throw new Error(`Μη υποστηριζόμενος τύπος αρχείου: .${ext}`);
  const XLSX = await getXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return { name, sheets: wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) })) };
}

export async function getXLSX() {
  if (globalThis.XLSX) return globalThis.XLSX;
  await loadScript('assets/vendor/xlsx.full.min.js');
  return globalThis.XLSX;
}

/* ------------------------------ column mapping ------------------------------ */
const prep = (s) => normText(s).replace(/[:.\-_/()]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(prep(s).split(' ').filter(Boolean));

/** Similarity 0‥1 between a header text and a field definition. */
export function scoreHeader(header, field) {
  const h = prep(header); if (!h) return 0;
  if (String(header).replace(/[\s_-]/g, '').toLowerCase() === field.key.toLowerCase()) return 1;
  let best = 0;
  for (const re of field.patterns || []) if (re.test(normText(header))) best = Math.max(best, 0.95);
  const ht = tokens(header);
  for (const a of [...field.aliases, prep(field.label)]) {
    const al = prep(a);
    if (al === h) return 1;
    const at = tokens(a); const inter = [...ht].filter((t) => at.has(t)).length; const uni = new Set([...ht, ...at]).size;
    const j = uni ? inter / uni : 0;
    const subset = inter === Math.min(ht.size, at.size) && inter > 0;
    best = Math.max(best, subset && Math.min(ht.size, at.size) >= 1 ? 0.62 + 0.3 * j : j * 0.9);
  }
  return best;
}

/**
 * Automatic column mapping.
 * @param {any[]} headers
 * @returns {{index:number, header:string, field:string|null, score:number}[]}
 */
export function autoMap(headers) {
  const cands = [];
  headers.forEach((h, index) => { for (const f of FIELDS) { const score = scoreHeader(h, f); if (score >= 0.6) cands.push({ index, field: f.key, score }); } });
  cands.sort((a, b) => b.score - a.score);
  const usedCol = new Set(); const usedField = new Set(); const pick = new Map();
  for (const c of cands) { if (usedCol.has(c.index) || usedField.has(c.field)) continue; usedCol.add(c.index); usedField.add(c.field); pick.set(c.index, c); }
  return headers.map((h, index) => ({ index, header: String(h ?? ''), field: pick.get(index)?.field || null, score: pick.get(index)?.score || 0 }));
}

/** Find the header row among the first rows (the one with most recognised columns). */
export function detectHeaderRow(rows) {
  let best = 0; let bestScore = -1;
  rows.slice(0, 15).forEach((r, i) => {
    const m = autoMap(r.map((c) => (c === null || c === undefined ? '' : String(c)))); const s = m.filter((x) => x.field).length;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

/* ------------------------------ transformation ------------------------------ */
export const DEFAULT_OPTIONS = Object.freeze({ uppercaseNames: true, stripAccents: true, formatPhones: true, inferDegree: true, defaultLodge: { number: 96, name: 'ΘΕΜΙΣΤΟΚΛΗΣ', province: 'Πειραιως & Αιγαιου' } });

const DATE_FIELDS = ['initiationDate', 'passingDate', 'raisingDate', 'adoptionDate', 'reinstatementDate', 'officeInstallDate'];

/**
 * Transform one raw row into a member record and collect issues.
 * @param {any[]} row @param {{index:number, field:string|null}[]} mapping @param {object} [opts]
 */
export function transformRow(row, mapping, opts = DEFAULT_OPTIONS) {
  const o = { ...DEFAULT_OPTIONS, ...opts }; const rec = {}; const issues = [];
  const raw = {}; for (const m of mapping) if (m.field) raw[m.field] = row[m.index];
  const cell = (k) => { const v = raw[k]; return v === null || v === undefined ? '' : v; };
  const text = (k) => cleanSpaces(cell(k) instanceof Date ? '' : cell(k));
  const name = (k) => { const t = text(k); return o.uppercaseNames ? toUppercase(t) : o.stripAccents ? normalizeGreekAccents(t) : t; };

  // registry number: Excel stores 960003 as a number; avoid "960003.0"
  let reg = cell('registryNumber'); reg = typeof reg === 'number' ? String(Math.trunc(reg)) : cleanSpaces(reg).replace(/\.0+$/, '');
  rec.registryNumber = reg;
  rec.firstName = name('firstName'); rec.lastName = name('lastName'); rec.fatherName = name('fatherName');
  if (!rec.registryNumber) issues.push({ field: 'registryNumber', level: 'error', msg: 'Λείπει ο αριθμός μητρώου' });
  if (!rec.lastName) issues.push({ field: 'lastName', level: 'error', msg: 'Λείπει το επώνυμο' });
  if (!rec.firstName) issues.push({ field: 'firstName', level: 'error', msg: 'Λείπει το όνομα' });

  const by = cell('birthYear');
  if (by !== '') {
    const y = by instanceof Date ? by.getFullYear() : parseInt(String(by).match(/\d{4}/)?.[0] ?? '', 10);
    if (Number.isFinite(y) && y >= 1900 && y <= new Date().getFullYear() - 16) rec.birthYear = y;
    else { rec.birthYear = null; issues.push({ field: 'birthYear', level: 'warn', msg: `Μη έγκυρο έτος γεννήσεως "${by}"` }); }
  } else rec.birthYear = null;

  let status = '';
  const cat = normalizeCategory(cell('category'));
  rec.category = cat.value || 'ΤΑΚΤΙΚΟ';
  if (!cat.known) issues.push({ field: 'category', level: 'warn', msg: `Άγνωστη κατηγορία "${cell('category')}"` });
  if (rec.category === 'ΔΙΑΓΡΑΦΕΝ') status = 'former';

  const phone = text('mobilePhone');
  if (phone) {
    const k = phoneKey(phone);
    if (k.length >= 10) rec.mobilePhone = o.formatPhones ? formatPhone(phone) : phone;
    else { rec.mobilePhone = phone; issues.push({ field: 'mobilePhone', level: 'warn', msg: `Ύποπτος αριθμός τηλεφώνου "${phone}"` }); }
  } else rec.mobilePhone = '';
  const email = text('email').toLowerCase();
  if (email) { if (isEmail(email)) rec.email = email; else { rec.email = ''; issues.push({ field: 'email', level: 'warn', msg: `Μη έγκυρο email "${email}"` }); } } else rec.email = '';
  const lodgeMail = text('lodgeEmail').toLowerCase(); rec.lodgeEmail = isEmail(lodgeMail) ? lodgeMail : '';

  for (const f of DATE_FIELDS) {
    const v = cell(f); const d = toISODate(v);
    if (d === null) { rec[f] = ''; issues.push({ field: f, level: 'warn', msg: `Μη έγκυρη ημερομηνία "${v}" (${FIELD_MAP[f].label})` }); } else rec[f] = d;
  }
  if (rec.passingDate && rec.initiationDate && rec.passingDate < rec.initiationDate) issues.push({ field: 'passingDate', level: 'warn', msg: 'Η διέλευση προηγείται της εισδοχής' });
  if (rec.raisingDate && rec.passingDate && rec.raisingDate < rec.passingDate) issues.push({ field: 'raisingDate', level: 'warn', msg: 'Η έγερση προηγείται της διελεύσεως' });

  const deg = normalizeDegree(cell('degree'));
  rec.degree = deg.value;
  if (!deg.known) issues.push({ field: 'degree', level: 'warn', msg: `Άγνωστος βαθμός "${cell('degree')}"` });
  if (!rec.degree && o.inferDegree) rec.degree = rec.raisingDate ? 'ΔΙΔΑΣΚΑΛΟΣ' : rec.passingDate ? 'ΕΤΑΙΡΟΣ' : rec.initiationDate ? 'ΜΑΘΗΤΗΣ' : '';

  rec.residence = name('residence'); rec.office = text('office'); rec.grandOffice = text('grandOffice'); rec.notes = text('notes');
  const ln = parseInt(String(cell('lodgeNumber')), 10);
  rec.lodgeNumber = Number.isFinite(ln) ? ln : o.defaultLodge.number;
  rec.lodgeName = name('lodgeName') || o.defaultLodge.name; rec.province = text('province') || o.defaultLodge.province;
  status = normalizeStatus(cell('status')) || status;
  rec.status = status || 'active';
  return { record: rec, issues };
}

/* ------------------------------ analysis ------------------------------ */
/**
 * Analyse all data rows: transform, validate and detect duplicates.
 * @param {any[][]} rows data rows (without header) @param {{index:number, field:string|null}[]} mapping
 * @param {object[]} existing current members @param {object} [opts]
 */
export function analyze(rows, mapping, existing = [], opts = DEFAULT_OPTIONS) {
  const regIdx = new Map(existing.map((m) => [String(m.registryNumber), m]));
  const mailIdx = new Map(existing.filter((m) => m.email).map((m) => [m.email.toLowerCase(), m]));
  const phoneIdx = new Map(existing.filter((m) => m.mobilePhone).map((m) => [phoneKey(m.mobilePhone), m]));
  const seenReg = new Map(); const seenMail = new Map(); const seenPhone = new Map();
  const mapped = mapping.filter((m) => m.field).map((m) => m.index);
  const out = []; let blank = 0;
  rows.forEach((row, i) => {
    const rowNo = i + 1;
    if (!mapped.some((idx) => row[idx] !== null && row[idx] !== undefined && String(row[idx]).trim() !== '')) { blank++; return; }
    const { record, issues } = transformRow(row, mapping, opts);
    const item = { rowNo, record, issues, state: 'valid', duplicate: null, include: true };
    if (issues.some((x) => x.level === 'error')) item.state = 'invalid';
    else {
      const dups = [];
      const reg = String(record.registryNumber); const pk = record.mobilePhone ? phoneKey(record.mobilePhone) : '';
      if (regIdx.has(reg)) dups.push({ by: 'registryNumber', with: `${regIdx.get(reg).lastName} ${regIdx.get(reg).firstName}`, existingId: regIdx.get(reg).id });
      else if (seenReg.has(reg)) dups.push({ by: 'registryNumber', with: `γραμμή ${seenReg.get(reg)}`, inFile: true });
      if (record.email && mailIdx.has(record.email)) dups.push({ by: 'email', with: `${mailIdx.get(record.email).lastName}`, existingId: mailIdx.get(record.email).id });
      else if (record.email && seenMail.has(record.email)) dups.push({ by: 'email', with: `γραμμή ${seenMail.get(record.email)}`, inFile: true });
      if (pk && phoneIdx.has(pk)) dups.push({ by: 'phone', with: `${phoneIdx.get(pk).lastName}`, existingId: phoneIdx.get(pk).id });
      else if (pk && seenPhone.has(pk)) dups.push({ by: 'phone', with: `γραμμή ${seenPhone.get(pk)}`, inFile: true });
      if (dups.length) { item.state = 'duplicate'; item.duplicate = dups; }
      else if (issues.length) item.state = 'warning';
      if (!seenReg.has(reg)) seenReg.set(reg, rowNo);
      if (record.email && !seenMail.has(record.email)) seenMail.set(record.email, rowNo);
      if (pk && !seenPhone.has(pk)) seenPhone.set(pk, rowNo);
    }
    out.push(item);
  });
  return { items: out, blank, stats: computeStats(out, blank) };
}

export function computeStats(items, blank = 0, imported = 0) {
  const c = (s) => items.filter((x) => x.state === s).length;
  return {
    total: items.length + blank, valid: c('valid') + c('warning'), invalid: c('invalid'), duplicates: c('duplicate'),
    warnings: c('warning'), skipped: blank + items.filter((x) => !x.include).length, imported,
  };
}

/**
 * Execute the import.
 * @param {import('./store.js').Store} store
 * @param {ReturnType<typeof analyze>} analysis
 * @param {{duplicates:'skip'|'update'|'import', fileName?:string, sheet?:string, mapping?:object[]}} opts
 */
export function runImport(store, analysis, opts) {
  const policy = opts.duplicates || 'skip'; const toAdd = []; const toUpdate = []; const skipped = []; const details = [];
  for (const it of analysis.items) {
    let action = 'skip'; let reason = '';
    if (!it.include) reason = 'Εξαιρέθηκε από τον χρήστη';
    else if (it.state === 'invalid') reason = it.issues.filter((x) => x.level === 'error').map((x) => x.msg).join('; ');
    else if (it.state === 'duplicate') {
      const regDup = it.duplicate.find((d) => d.by === 'registryNumber' && !d.inFile);
      if (policy === 'update' && regDup) { action = 'update'; toUpdate.push(it.record); } else if (policy === 'import' && !it.duplicate.some((d) => d.by === 'registryNumber')) { action = 'add'; toAdd.push(it.record); } else reason = `Διπλότυπο (${it.duplicate.map((d) => d.by).join(', ')})`;
    } else { action = 'add'; toAdd.push(it.record); }
    if (action === 'skip') skipped.push(it);
    details.push({ row: it.rowNo, registry: it.record.registryNumber, name: `${it.record.lastName} ${it.record.firstName}`.trim(), action, reason });
  }
  const res = store.bulkUpsert([...toAdd, ...toUpdate], { updateExisting: true });
  const stats = computeStats(analysis.items, analysis.blank, res.created.length + res.updated.length);
  stats.skipped = skipped.length + analysis.blank; stats.created = res.created.length; stats.updated = res.updated.length;
  const report = { id: uid('imp'), at: new Date().toISOString(), file: opts.fileName || '', sheet: opts.sheet || '', policy, stats, mapping: (opts.mapping || []).filter((m) => m.field).map((m) => ({ column: m.header, field: m.field })), details: details.slice(0, 1000), createdIds: res.created.map((m) => m.id) };
  store.addImportReport(report);
  return report;
}

/* ------------------------------ templates ------------------------------ */
/** Column order of the Book2.xlsx layout, used for templates and sample files. */
export const BOOK2_HEADERS = ['Αρ. Μέλους', 'Όνομα Μέλους', 'Επώνυμο Μέλους', 'Έτος Γεννήσεως', 'Όνομα Πατρός', 'Κατηγορία Μέλους', 'Κιν. Τηλέφωνο Μέλους', 'e-mail Μέλους', 'Ημερομηνία Εισδοχής', 'Ημερομηνία Διελεύσεως', 'Ημερομηνία Εγέρσεως', 'Τόπος Κατοικίας', 'Βαθμός', 'Παρόν Αξίωμα Εν τη Στοά', 'Λοιπές Παρατηρήσεις', 'Στοά Υπ Αρ.', 'Σ. Στοά', 'Επαρχία'];
export const BOOK2_FIELDS = ['registryNumber', 'firstName', 'lastName', 'birthYear', 'fatherName', 'category', 'mobilePhone', 'email', 'initiationDate', 'passingDate', 'raisingDate', 'residence', 'degree', 'office', 'notes', 'lodgeNumber', 'lodgeName', 'province'];
export const templateRows = () => [BOOK2_HEADERS, ['960099', 'ΝΙΚΟΛΑΟΣ', 'ΠΑΠΑΔΟΠΟΥΛΟΣ', 1980, 'ΙΩΑΝΝΗΣ', '1. ΤΑΚΤΙΚΟ', '6900000000', 'name@example.com', '15/01/2026', '', '', 'ΠΕΙΡΑΙΑΣ', 'ΜΑΘΗΤΗΣ', '', '', 96, 'ΘΕΜΙΣΤΟΚΛΗΣ', 'Πειραιως & Αιγαιου']];
export { titleCase };
