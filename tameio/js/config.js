/**
 * Application-wide constants and static definitions.
 * @module config
 */
export const APP = Object.freeze({
  name: 'TAMEIO THEMISTOCLES 96',
  version: '1.0.1',
  schemaVersion: 1,
  storagePrefix: 't96.',
  idbName: 't96-tameio',
});

/** Treasury years managed by the application. */
export const YEARS = Object.freeze([2026, 2027, 2028, 2029, 2030]);

export const DEGREES = Object.freeze({
  'ΜΑΘΗΤΗΣ': { label: 'Μαθητής', stage: 'Εισδοχή', order: 1 },
  'ΕΤΑΙΡΟΣ': { label: 'Εταίρος', stage: 'Διέλευση', order: 2 },
  'ΔΙΔΑΣΚΑΛΟΣ': { label: 'Διδάσκαλος', stage: 'Έγερση', order: 3 },
});

export const CATEGORIES = Object.freeze({
  'ΤΑΚΤΙΚΟ': 'Τακτικό',
  'ΜΕΤΟΙΚΟ': 'Μέτοικο',
  'ΥΙΟΘΕΤΗΜΕΝΟ': 'Υιοθετημένο',
  'ΕΠΙΤΙΜΟ': 'Επίτιμο',
  'ΟΜΟΤΙΜΟ': 'Ομότιμο',
  'ΔΙΑΓΡΑΦΕΝ': 'Διαγραμμένο',
});

export const STATUSES = Object.freeze({
  active: 'Ενεργό',
  former: 'Πρώην',
  archived: 'Αρχειοθετημένο',
  deleted: 'Διαγραμμένο',
});

export const NO_OFFICE = 'Άλλο ή Άνευ Αξιώματος';

export const PAYMENT_METHODS = Object.freeze({ bank: 'Τραπεζική κατάθεση', cash: 'Μετρητά', card: 'Κάρτα', other: 'Άλλο' });

/**
 * Member fields: key, Greek label, import aliases (header names, accent/case-insensitive) and group.
 * `required` fields are validated on import and in the member form.
 */
export const FIELDS = Object.freeze([
  { key: 'registryNumber', label: 'Αρ. Μέλους', required: true, aliases: ['αρ. μελους', 'αριθμος μελους', 'αρ μητρωου', 'αριθμος μητρωου', 'registry number', 'member number', 'member no', 'registry no', 'reg no'] },
  { key: 'firstName', label: 'Όνομα', required: true, aliases: ['ονομα μελους', 'ονομα', 'first name', 'firstname', 'given name'] },
  { key: 'lastName', label: 'Επώνυμο', required: true, aliases: ['επωνυμο μελους', 'επωνυμο', 'last name', 'lastname', 'surname', 'family name'] },
  { key: 'birthYear', label: 'Έτος Γεννήσεως', aliases: ['ετος γεννησεως', 'ετος γεννησης', 'γεννηση', 'year of birth', 'birth year', 'birthyear'] },
  { key: 'fatherName', label: 'Όνομα Πατρός', aliases: ['ονομα πατρος', 'πατρωνυμο', 'father name', "father's name", 'fathername'] },
  { key: 'category', label: 'Κατηγορία Μέλους', aliases: ['κατηγορια μελους', 'κατηγορια', 'membership category', 'category'], patterns: [/^\d+\.\s*(τακτικ|υιοθετ|διαγραφ|επιτιμ)/] },
  { key: 'mobilePhone', label: 'Κινητό', aliases: ['κιν. τηλεφωνο μελους', 'κιν τηλεφωνο μελους', 'κινητο τηλεφωνο', 'κινητο', 'τηλεφωνο', 'mobile phone', 'mobile', 'phone'] },
  { key: 'email', label: 'Email', aliases: ['e-mail μελους', 'email μελους', 'e-mail', 'email', 'ηλεκτρονικο ταχυδρομειο', 'email address'] },
  { key: 'initiationDate', label: 'Ημ. Εισδοχής', aliases: ['ημερομηνια εισδοχης', 'εισδοχη', 'initiation date', 'initiation'] },
  { key: 'passingDate', label: 'Ημ. Διελεύσεως', aliases: ['ημερομηνια διελευσεως', 'ημερομηνια διελευσης', 'διελευση', 'passing date', 'passing'] },
  { key: 'raisingDate', label: 'Ημ. Εγέρσεως', aliases: ['ημερομηνια εγερσεως', 'ημερομηνια εγερσης', 'εγερση', 'raising date', 'raising'] },
  { key: 'adoptionDate', label: 'Ημ. Υιοθεσίας', aliases: ['ημερομηνια υιοθεσιας', 'adoption date'] },
  { key: 'reinstatementDate', label: 'Ημ. Επαναφοράς', aliases: ['ημερομηνια επαναφορας', 'reinstatement date'] },
  { key: 'residence', label: 'Τόπος Κατοικίας', aliases: ['τοπος κατοικιας', 'κατοικια', 'πολη', 'residence', 'city', 'address'] },
  { key: 'degree', label: 'Βαθμός', aliases: ['βαθμος', 'degree', 'grade'] },
  { key: 'office', label: 'Παρόν Αξίωμα', aliases: ['παρον αξιωμα εν τη στοα', 'παρον αξιωμα', 'αξιωμα', 'current office', 'office'] },
  { key: 'officeInstallDate', label: 'Ημ. Εγκατάστασης Αξιώματος', aliases: ['ημερομηνια εγκαταστασης νεων τεκτ. αρχων', 'ημερομηνια εγκαταστασης νεων τεκτ αρχων', 'ημερομηνια εγκαταστασης', 'office install date'] },
  { key: 'grandOffice', label: 'Αξίωμα στη Μ. Στοά', aliases: ['αξιωμα εν τη μ. στοα', 'αξιωμα εν τη μ στοα', 'αξιωμα μεγαλης στοας', 'grand lodge office'] },
  { key: 'notes', label: 'Παρατηρήσεις', aliases: ['λοιπες παρατηρησεις', 'παρατηρησεις', 'σημειωσεις', 'notes', 'remarks'] },
  { key: 'lodgeEmail', label: 'Lodge mail', aliases: ['lodge mail', 'lodge email'] },
  { key: 'lodgeNumber', label: 'Στοά Υπ’ Αρ.', aliases: ['στοα υπ αρ.', 'στοα υπ αρ', 'στοα υπ αριθμ', 'αριθμος στοας', 'lodge number', 'lodge no'] },
  { key: 'lodgeName', label: 'Στοά', aliases: ['σ. στοα', 'σ στοα', 'στοα', 'ονομα στοας', 'lodge name', 'lodge'] },
  { key: 'province', label: 'Επαρχία', aliases: ['επαρχια', 'province'] },
  { key: 'status', label: 'Κατάσταση', aliases: ['κατασταση', 'κατασταση μελους', 'membership status', 'status'] },
]);

export const FIELD_MAP = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f.key, f])));

/** Search fields with relevance weights. */
export const SEARCH_FIELDS = Object.freeze([
  ['registryNumber', 4], ['lastName', 4], ['firstName', 3], ['email', 2], ['mobilePhone', 2],
  ['residence', 1.5], ['office', 1.5], ['degree', 1], ['notes', 1],
]);

/** Role based access control. */
export const ROLES = Object.freeze({
  admin: { label: 'Διαχειριστής', can: ['view', 'members.write', 'members.delete', 'treasury.write', 'import', 'export', 'settings', 'tests', 'backup'] },
  secretary: { label: 'Γραμματέας', can: ['view', 'members.write', 'members.delete', 'import', 'export', 'tests'] },
  treasurer: { label: 'Ταμίας', can: ['view', 'treasury.write', 'export', 'tests'] },
  readonly: { label: 'Μόνο ανάγνωση', can: ['view'] },
});

export const COLORS = Object.freeze({
  gold: '#D4AF37', navy: '#0B1F3A', white: '#FFFFFF',
  series: ['#D4AF37', '#2F5D9B', '#2A9D8F', '#C0504D', '#7B5EA7', '#E08A2E', '#5C6B82', '#6FA8DC'],
});

export const DEFAULT_SETTINGS = Object.freeze({
  lodge: { name: 'Θεμιστοκλής', number: 96, fullName: 'Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96', province: 'Επαρχιακή Μεγάλη Στοά Πειραιώς και Αιγαίου', grandLodge: 'Εθνική Μεγάλη Στοά της Ελλάδος' },
  // Annual contribution per category, same for every year 2026–2030 (edit in Ταμείο → Πρόγραμμα εισφορών).
  fees: Object.fromEntries(Object.entries({ 'ΤΑΚΤΙΚΟ': 200, 'ΜΕΤΟΙΚΟ': 100, 'ΥΙΟΘΕΤΗΜΕΝΟ': 20, 'ΕΠΙΤΙΜΟ': 0, 'ΟΜΟΤΙΜΟ': 0, 'ΔΙΑΓΡΑΦΕΝ': 0 }).map(([c, v]) => [c, Object.fromEntries([2026, 2027, 2028, 2029, 2030].map((y) => [y, v]))])),
  debtFromYear: 2027,
  asOfYear: null,          // null = current calendar year
  dueMonthDay: '03-31',    // payment due date used by compliance analysis
  csvDelimiter: ';',
  theme: 'auto',
  pageSize: 25,
  workerThreshold: 200,    // members count from which the Web Worker search is used
  role: 'admin',
  auth: { enabled: false, hashes: {}, salt: '' },
});
