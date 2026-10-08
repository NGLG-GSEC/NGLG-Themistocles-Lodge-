/** Member and payment dialogs shared by several views. */
import { DEGREES, CATEGORIES, STATUSES, PAYMENT_METHODS, YEARS } from '../config.js';
import { field, openDialog, readForm, toast } from '../ui.js';
import { toUpperGreek, isEmail, toISODate, phoneKey, formatPhone, todayISO, parseMoney, round2, esc, fullName } from '../utils.js';

const opts = (obj, blank) => [...(blank ? [['', blank]] : []), ...Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : v.label])];

/**
 * Add / edit member dialog. Resolves with the saved member or undefined.
 * @param {object} app @param {object|null} member existing member (null = new)
 */
export async function memberDialog(app, member = null) {
  const m = member || {}; const isNew = !member;
  const v = (k, d = '') => (m[k] ?? d);
  const body = `<div class="form-grid">
    ${field({ id: 'registryNumber', label: 'Αριθμός Μητρώου', value: v('registryNumber'), required: true, attrs: 'inputmode="numeric"' })}
    ${field({ id: 'lastName', label: 'Επώνυμο', value: v('lastName'), required: true })}
    ${field({ id: 'firstName', label: 'Όνομα', value: v('firstName'), required: true })}
    ${field({ id: 'fatherName', label: 'Όνομα Πατρός', value: v('fatherName') })}
    ${field({ id: 'birthYear', label: 'Έτος Γεννήσεως', type: 'number', value: v('birthYear', ''), attrs: 'min="1900" max="2100"' })}
    ${field({ id: 'category', label: 'Κατηγορία Μέλους', type: 'select', value: v('category', 'ΤΑΚΤΙΚΟ'), options: opts(CATEGORIES) })}
    ${field({ id: 'degree', label: 'Βαθμός', type: 'select', value: v('degree'), options: opts(DEGREES, '— Κανένας —') })}
    ${field({ id: 'status', label: 'Κατάσταση', type: 'select', value: v('status', 'active'), options: opts(STATUSES) })}
    ${field({ id: 'mobilePhone', label: 'Κινητό Τηλέφωνο', type: 'tel', value: v('mobilePhone'), hint: 'π.χ. 697 799 9137' })}
    ${field({ id: 'email', label: 'Email', type: 'email', value: v('email') })}
    ${field({ id: 'initiationDate', label: 'Ημερομηνία Εισδοχής', type: 'date', value: v('initiationDate') })}
    ${field({ id: 'passingDate', label: 'Ημερομηνία Διελεύσεως', type: 'date', value: v('passingDate') })}
    ${field({ id: 'raisingDate', label: 'Ημερομηνία Εγέρσεως', type: 'date', value: v('raisingDate') })}
    ${field({ id: 'residence', label: 'Τόπος Κατοικίας', value: v('residence') })}
    ${field({ id: 'office', label: 'Παρόν Αξίωμα', value: v('office'), hint: 'Αφήστε κενό για «Άνευ Αξιώματος»' })}
    ${field({ id: 'officeInstallDate', label: 'Ημ. Εγκατάστασης Αξιώματος', type: 'date', value: v('officeInstallDate') })}
    ${field({ id: 'grandOffice', label: 'Αξίωμα στη Μ. Στοά', value: v('grandOffice') })}
    ${field({ id: 'lodgeNumber', label: 'Στοά Υπ’ Αρ.', type: 'number', value: v('lodgeNumber', 96) })}
    ${field({ id: 'lodgeName', label: 'Στοά', value: v('lodgeName', 'ΘΕΜΙΣΤΟΚΛΗΣ') })}
    ${field({ id: 'province', label: 'Επαρχία', value: v('province', 'Πειραιως & Αιγαιου') })}
    ${field({ id: 'exempt', label: 'Απαλλαγή από εισφορές', type: 'checkbox', value: v('exempt', false) })}
    ${field({ id: 'notes', label: 'Παρατηρήσεις', type: 'textarea', value: v('notes'), wide: true })}
  </div>`;
  const validate = (dlg) => {
    const f = readForm(dlg); const errs = [];
    if (!f.registryNumber.trim()) errs.push('Ο αριθμός μητρώου είναι υποχρεωτικός.');
    else if (app.store.members.some((x) => x.id !== m.id && String(x.registryNumber) === f.registryNumber.trim() && x.status !== 'deleted')) errs.push(`Ο αριθμός μητρώου ${f.registryNumber} υπάρχει ήδη.`);
    if (!f.lastName.trim()) errs.push('Το επώνυμο είναι υποχρεωτικό.');
    if (!f.firstName.trim()) errs.push('Το όνομα είναι υποχρεωτικό.');
    if (f.email.trim() && !isEmail(f.email)) errs.push('Μη έγκυρο email.');
    if (f.mobilePhone.trim() && phoneKey(f.mobilePhone).length < 10) errs.push('Το κινητό πρέπει να έχει τουλάχιστον 10 ψηφία.');
    if (f.birthYear && (+f.birthYear < 1900 || +f.birthYear > new Date().getFullYear() - 16)) errs.push('Μη έγκυρο έτος γεννήσεως.');
    const d = ['initiationDate', 'passingDate', 'raisingDate'].map((k) => f[k]);
    if (d[1] && d[0] && d[1] < d[0]) errs.push('Η διέλευση δεν μπορεί να προηγείται της εισδοχής.');
    if (d[2] && d[1] && d[2] < d[1]) errs.push('Η έγερση δεν μπορεί να προηγείται της διελεύσεως.');
    return errs.length ? errs.join(' ') : true;
  };
  const res = await openDialog({
    title: isNew ? 'Νέο μέλος' : `Επεξεργασία: ${fullName(m)}`, size: 'lg', body,
    actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Αποθήκευση', kind: 'primary', validate, collect: (dlg) => readForm(dlg) }],
  });
  if (!res) return undefined;
  const patch = {
    registryNumber: res.registryNumber.trim(), lastName: toUpperGreek(res.lastName), firstName: toUpperGreek(res.firstName), fatherName: toUpperGreek(res.fatherName),
    birthYear: res.birthYear ? +res.birthYear : null, category: res.category, degree: res.degree, status: res.status,
    mobilePhone: res.mobilePhone.trim() ? formatPhone(res.mobilePhone) : '', email: res.email.trim().toLowerCase(),
    initiationDate: res.initiationDate, passingDate: res.passingDate, raisingDate: res.raisingDate, residence: toUpperGreek(res.residence),
    office: res.office.trim(), officeInstallDate: res.officeInstallDate, grandOffice: res.grandOffice.trim(), notes: res.notes.trim(),
    lodgeNumber: +res.lodgeNumber || 96, lodgeName: toUpperGreek(res.lodgeName), province: res.province.trim(), exempt: !!res.exempt,
  };
  if (!patch.degree) patch.degree = patch.raisingDate ? 'ΔΙΔΑΣΚΑΛΟΣ' : patch.passingDate ? 'ΕΤΑΙΡΟΣ' : patch.initiationDate ? 'ΜΑΘΗΤΗΣ' : '';
  const { store } = app;
  if (isNew) { const { status, ...rest } = patch; const created = store.addMember(rest); if (status !== 'active') store.setStatus(created.id, status); toast('Το μέλος προστέθηκε.', 'success'); return created; }
  const { status, ...rest } = patch; store.updateMember(m.id, rest);
  if (status !== m.status) store.setStatus(m.id, status);
  toast('Οι αλλαγές αποθηκεύτηκαν.', 'success');
  return store.getMember(m.id);
}

/** Record a payment dialog. */
export async function paymentDialog(app, memberId, year = null) {
  const { store } = app; const m = store.getMember(memberId);
  const years = [...new Set([...YEARS, ...store.ledger.map((p) => p.year)])].sort();
  const body = `<p>Μέλος: <strong>${esc(fullName(m))}</strong> (${esc(m.registryNumber)})</p><div class="form-grid">
    ${field({ id: 'year', label: 'Έτος εισφοράς', type: 'select', value: year || app.asOf, options: years.map((y) => [y, y]) })}
    ${field({ id: 'amount', label: 'Ποσό (€)', type: 'text', value: '', required: true, attrs: 'inputmode="decimal" autofocus', hint: 'Π.χ. 100 ή 75,50' })}
    ${field({ id: 'date', label: 'Ημερομηνία', type: 'date', value: todayISO() })}
    ${field({ id: 'method', label: 'Τρόπος πληρωμής', type: 'select', value: 'bank', options: Object.entries(PAYMENT_METHODS) })}
    ${field({ id: 'receipt', label: 'Αρ. απόδειξης', value: '', hint: 'Κενό = αυτόματη αρίθμηση' })}
    ${field({ id: 'note', label: 'Σημείωση', value: '' })}</div>`;
  const res = await openDialog({
    title: 'Καταχώριση πληρωμής', body,
    actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Καταχώριση', kind: 'primary', validate: (dlg) => { const f = readForm(dlg); const a = parseMoney(f.amount); if (!(a !== 0 && Number.isFinite(a))) return 'Δώστε έγκυρο ποσό (π.χ. 100 ή 75,50).'; if (!toISODate(f.date)) return 'Μη έγκυρη ημερομηνία.'; return true; }, collect: (dlg) => readForm(dlg) }],
  });
  if (!res) return undefined;
  const p = store.addPayment({ memberId, year: +res.year, amount: parseMoney(res.amount), date: res.date, method: res.method, receipt: res.receipt.trim(), note: res.note.trim() });
  toast(`Καταχωρίστηκε πληρωμή ${p.amount} €`, 'success');
  return p;
}
