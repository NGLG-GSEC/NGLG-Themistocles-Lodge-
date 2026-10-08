/**
 * Report catalogue. Every report builds a table model (see exporter.js) so it can be previewed,
 * printed and exported to PDF / Excel / CSV uniformly.
 * @module reports
 */
import { DEGREES, CATEGORIES, STATUSES, YEARS, PAYMENT_METHODS, ROLES } from './config.js';
import { fullName, fmtMoney, fmtPct, fmtDate, round2, sum, groupBy } from './utils.js';
import { makeCtx, memberYear, memberDebt, yearSummary, allYears, forecast, monthlyRevenue, compliance } from './treasury.js';
import { counts, anomalies, revenueByCategory, debtAnalysis, executive } from './analytics.js';

const lodgeTitle = (s) => s.lodge?.fullName || 'Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96';
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const active = (members) => members.filter((m) => m.status !== 'deleted');
const stateLabel = { paid: 'Εξοφλημένο', partial: 'Μερικώς', unpaid: 'Απλήρωτο', overpaid: 'Υπερπληρωμή', 'n/a': '—' };

/** @typedef {{id:string,label:string,desc:string,needsYear:boolean,build:(args:{members:object[],ledger:object[],audit:object[],settings:object,year:number})=>object}} Report */
/** @type {Report[]} */
export const REPORTS = [
  {
    id: 'treasurer', label: 'Αναφορά Ταμία', desc: 'Εισφορές, εισπράξεις και υπόλοιπα ανά μέλος για το επιλεγμένο έτος.', needsYear: true,
    build({ members, ledger, settings, year }) {
      const ctx = makeCtx(active(members), ledger, settings); const rows = ctx.members.filter((m) => m.status === 'active' || ctx.paidOf(m.id, year)).map((m) => { const r = memberYear(ctx, m, year); return { registryNumber: m.registryNumber, name: fullName(m), category: CATEGORIES[m.category] || m.category, expected: r.expected, paid: r.paid, balance: r.balance, pct: r.pct, state: stateLabel[r.state] }; }).sort((a, b) => a.registryNumber.localeCompare(b.registryNumber));
      const s = yearSummary(ctx, year, ctx.members);
      return { title: `Αναφορά Ταμία ${year}`, subtitle: lodgeTitle(settings), sheet: `Ταμίας ${year}`, columns: [{ key: 'registryNumber', label: 'Αρ. Μητρώου' }, { key: 'name', label: 'Μέλος' }, { key: 'category', label: 'Κατηγορία' }, { key: 'expected', label: 'Εισφορά', type: 'money' }, { key: 'paid', label: 'Καταβλήθηκαν', type: 'money' }, { key: 'balance', label: 'Υπόλοιπο', type: 'money' }, { key: 'pct', label: 'Εξόφληση', type: 'percent' }, { key: 'state', label: 'Κατάσταση' }], rows,
        summary: [['Αναμενόμενα', fmtMoney(s.expected)], ['Εισπράχθηκαν', fmtMoney(s.paid)], ['Οφειλές', fmtMoney(s.outstanding)], ['Ποσοστό είσπραξης', fmtPct(s.collectionRate)]] };
    },
  },
  {
    id: 'annual', label: 'Ετήσια Αναφορά', desc: 'Σύνοψη ανά έτος: αναμενόμενα, έσοδα, οφειλές, ποσοστά και αριθμός μελών.', needsYear: false,
    build({ members, ledger, settings }) {
      const ctx = makeCtx(active(members), ledger, settings); const ys = allYears(ctx); let prev = null;
      const rows = ys.map((y) => { const s = yearSummary(ctx, y); const growth = prev ? ((s.paid - prev) / prev) * 100 : null; prev = s.paid || prev; return { year: y, expected: s.expected, paid: s.paid, outstanding: s.outstanding, rate: s.collectionRate, payers: s.payers, avg: s.averageContribution, growth }; });
      const c = counts(members);
      return { title: 'Ετήσια Αναφορά', subtitle: lodgeTitle(settings), sheet: 'Ετήσια', columns: [{ key: 'year', label: 'Έτος', type: 'plain' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'paid', label: 'Έσοδα', type: 'money' }, { key: 'outstanding', label: 'Οφειλές', type: 'money' }, { key: 'rate', label: 'Είσπραξη', type: 'percent' }, { key: 'payers', label: 'Πληρωτές', type: 'number' }, { key: 'avg', label: 'Μέση εισφορά', type: 'money' }, { key: 'growth', label: 'Μεταβολή εσόδων', type: 'percent' }], rows,
        summary: [['Ενεργά μέλη', c.active], ['Πρώην', c.former], ['Συνολικά έσοδα', fmtMoney(sum(rows, (r) => r.paid))]] };
    },
  },
  {
    id: 'membership', label: 'Αναφορά Μελών', desc: 'Μητρώο μελών με βαθμούς, ημερομηνίες προόδου και κατάσταση.', needsYear: false,
    build({ members, settings }) {
      const rows = active(members).map((m) => ({ registryNumber: m.registryNumber, name: fullName(m), degree: DEGREES[m.degree]?.label || '', category: CATEGORIES[m.category] || '', initiationDate: m.initiationDate, passingDate: m.passingDate, raisingDate: m.raisingDate, office: m.office, residence: m.residence, status: STATUSES[m.status] })).sort((a, b) => a.registryNumber.localeCompare(b.registryNumber));
      const c = counts(members);
      return { title: 'Αναφορά Μελών', subtitle: lodgeTitle(settings), sheet: 'Μέλη', columns: [{ key: 'registryNumber', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'degree', label: 'Βαθμός' }, { key: 'category', label: 'Κατηγορία' }, { key: 'initiationDate', label: 'Εισδοχή', type: 'date' }, { key: 'passingDate', label: 'Διέλευση', type: 'date' }, { key: 'raisingDate', label: 'Έγερση', type: 'date' }, { key: 'office', label: 'Αξίωμα' }, { key: 'residence', label: 'Κατοικία' }, { key: 'status', label: 'Κατάσταση' }], rows,
        summary: [['Σύνολο', c.total], ['Ενεργά', c.active], ['Μαθητές', c.initiated], ['Εταίροι', c.passed], ['Διδάσκαλοι', c.raised]] };
    },
  },
  {
    id: 'debt', label: 'Αναφορά Οφειλών', desc: 'Μέλη με ανεξόφλητες εισφορές ανά έτος και συνολική οφειλή.', needsYear: false,
    build({ members, ledger, settings }) {
      const ctx = makeCtx(active(members), ledger, settings); const ys = YEARS.filter((y) => y >= (settings.debtFromYear || YEARS[0]) && y <= ctx.asOf);
      const rows = ctx.members.map((m) => { const row = { registryNumber: m.registryNumber, name: fullName(m), phone: m.mobilePhone, email: m.email }; ys.forEach((y) => { row[`y${y}`] = Math.max(0, memberYear(ctx, m, y).balance); }); row.total = memberDebt(ctx, m); return row; }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
      const d = debtAnalysis(ctx);
      return { title: 'Αναφορά Οφειλών', subtitle: `${lodgeTitle(settings)} — έως ${ctx.asOf}`, sheet: 'Οφειλές', columns: [{ key: 'registryNumber', label: 'Αρ.' }, { key: 'name', label: 'Μέλος' }, { key: 'phone', label: 'Κινητό' }, ...ys.map((y) => ({ key: `y${y}`, label: String(y), type: 'money' })), { key: 'total', label: 'Σύνολο οφειλής', type: 'money' }], rows,
        summary: [['Συνολική οφειλή', fmtMoney(d.total)], ['Μέλη με οφειλή', d.count]] };
    },
  },
  {
    id: 'revenue', label: 'Αναφορά Εσόδων', desc: 'Μηνιαία έσοδα, έσοδα ανά κατηγορία και τρόπο πληρωμής.', needsYear: true,
    build({ members, ledger, settings, year }) {
      const ctx = makeCtx(members, ledger, settings); const mr = monthlyRevenue(ctx, year); let cum = 0;
      const rows = MONTHS.map((mn, i) => { cum += mr[i]; const n = ledger.filter((p) => p.date?.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).length; return { month: mn, payments: n, amount: mr[i], cumulative: round2(cum) }; });
      const byMethod = groupBy(ledger.filter((p) => p.date?.startsWith(String(year))), (p) => p.method || 'other');
      const cats = revenueByCategory(ctx, [year]);
      return { title: `Αναφορά Εσόδων ${year}`, subtitle: lodgeTitle(settings), sheet: `Έσοδα ${year}`, columns: [{ key: 'month', label: 'Μήνας' }, { key: 'payments', label: 'Πληρωμές', type: 'number' }, { key: 'amount', label: 'Έσοδα', type: 'money' }, { key: 'cumulative', label: 'Σωρευτικά', type: 'money' }], rows,
        summary: [['Σύνολο έτους', fmtMoney(cum)], ...[...byMethod].map(([k, v]) => [PAYMENT_METHODS[k] || k, fmtMoney(sum(v, (p) => p.amount))]), ...cats.series.map((s) => [CATEGORIES[s.category], fmtMoney(s.values[0])])] };
    },
  },
  {
    id: 'activity', label: 'Αναφορά Δραστηριότητας', desc: 'Καταγραφή ενεργειών χρηστών (δημιουργίες, αλλαγές, πληρωμές, εισαγωγές).', needsYear: false,
    build({ audit, settings }) {
      const rows = [...audit].reverse().slice(0, 1000).map((a) => ({ at: a.at.replace('T', ' ').slice(0, 19), role: ROLES[a.role]?.label || a.role, action: a.action, entity: a.entity, detail: a.detail }));
      return { title: 'Αναφορά Δραστηριότητας', subtitle: lodgeTitle(settings), sheet: 'Δραστηριότητα', columns: [{ key: 'at', label: 'Ημερομηνία/Ώρα' }, { key: 'role', label: 'Ρόλος' }, { key: 'action', label: 'Ενέργεια' }, { key: 'entity', label: 'Αντικείμενο' }, { key: 'detail', label: 'Λεπτομέρειες' }], rows, summary: [['Εγγραφές', audit.length]] };
    },
  },
  {
    id: 'executive', label: 'Εκτελεστική Σύνοψη', desc: 'KPIs, προβλέψεις και ευρήματα ανωμαλιών σε μία σελίδα.', needsYear: true,
    build({ members, ledger, settings, year }) {
      const e = executive(members, ledger, settings, { year }); const f = e.forecast.rows;
      const rows = [
        ...f.map((r) => ({ section: 'Πρόβλεψη', item: String(r.year), value: fmtMoney(r.forecast), note: `Εύρος ${fmtMoney(r.low)} – ${fmtMoney(r.high)} · τάση ${fmtMoney(r.trend)}` })),
        ...anomalies(members, ledger, settings).slice(0, 25).map((a) => ({ section: 'Ανωμαλία', item: a.type, value: a.severity, note: a.text })),
      ];
      return { title: `Εκτελεστική Σύνοψη ${year}`, subtitle: lodgeTitle(settings), sheet: 'Σύνοψη', columns: [{ key: 'section', label: 'Ενότητα' }, { key: 'item', label: 'Στοιχείο' }, { key: 'value', label: 'Τιμή' }, { key: 'note', label: 'Σχόλιο' }], rows,
        summary: [['Ενεργά μέλη', e.counts.active], ['Έσοδα έτους', fmtMoney(e.summary.paid)], ['Οφειλές', fmtMoney(e.debt)], ['Είσπραξη', fmtPct(e.summary.collectionRate)], ['Μεταβολή εσόδων', e.revenueGrowth === null ? '—' : fmtPct(e.revenueGrowth)], ['Μέση ηλικία', e.age.toFixed(1)]] };
    },
  },
  {
    id: 'forecast', label: 'Προβλέψεις Εσόδων', desc: 'Προβολή εσόδων επόμενων ετών με εύρος αβεβαιότητας.', needsYear: false,
    build({ members, ledger, settings }) {
      const ctx = makeCtx(active(members), ledger, settings); const f = forecast(ctx, 4);
      return { title: 'Προβλέψεις Εσόδων', subtitle: lodgeTitle(settings), sheet: 'Προβλέψεις', columns: [{ key: 'year', label: 'Έτος', type: 'plain' }, { key: 'expected', label: 'Αναμενόμενα', type: 'money' }, { key: 'forecast', label: 'Πρόβλεψη εισπράξεων', type: 'money' }, { key: 'low', label: 'Κατώτερο', type: 'money' }, { key: 'high', label: 'Ανώτερο', type: 'money' }, { key: 'trend', label: 'Μοντέλο τάσης', type: 'money' }, { key: 'prepaid', label: 'Προπληρωμένα', type: 'money' }], rows: f.rows, summary: [['Μέσο ποσοστό είσπραξης', fmtPct(f.rate)]] };
    },
  },
];

export const getReport = (id) => REPORTS.find((r) => r.id === id);
export { compliance, fmtDate };
