/** Import Wizard: 1 Upload · 2 Column mapping · 3 Validation preview · 4 Confirmation (+ report, samples, documentation). */
import { FIELDS, FIELD_MAP, CATEGORIES, DEGREES } from '../config.js';
import { esc, fullName, download, stamp, fmtDate } from '../utils.js';
import { icon, badge, sectionHead, dataTable, toast, announce, kpiCard } from '../ui.js';
import * as I from '../importer.js';
import { exportXLSX, exportCSV, exportJSON, tablesToXLSX } from '../exporter.js';

const STEPS = ['Αρχείο', 'Αντιστοίχιση στηλών', 'Έλεγχος & προεπισκόπηση', 'Επιβεβαίωση'];

export default {
  id: 'import', title: 'Εισαγωγή',
  async render(root, app) {
    const { store } = app;
    if (!app.can('import')) { root.innerHTML = `${sectionHead('Εισαγωγή Excel')}<div class="notice">${icon('lock')}<div>Ο ρόλος σας δεν επιτρέπει εισαγωγή δεδομένων.</div></div>`; return undefined; }
    const S = { step: 1, file: null, wb: null, sheet: 0, headerRow: 0, mapping: [], opts: { uppercaseNames: true, stripAccents: true, formatPhones: true, inferDegree: true }, dup: 'skip', analysis: null, filter: 'all', report: null, busy: false };

    const stepper = () => `<ol class="wizard" aria-label="Βήματα εισαγωγής">${STEPS.map((l, i) => `<li class="${S.step === i + 1 ? 'current' : S.step > i + 1 ? 'done' : ''}" ${S.step === i + 1 ? 'aria-current="step"' : ''}><span class="dot">${S.step > i + 1 ? icon('check', { size: 14 }) : i + 1}</span><span>${l}</span></li>`).join('')}</ol>`;
    const rowsOf = () => S.wb.sheets[S.sheet].rows;

    function paint() {
      root.innerHTML = `${sectionHead('Εισαγωγή δεδομένων', '', 'Excel (.xlsx/.xls), CSV ή JSON · απευθείας υποστήριξη της μορφής Book2.xlsx')}${stepper()}<div id="w-body"></div>${S.step === 1 ? docsAndSamples() : ''}${reportsList()}`;
      const body = root.querySelector('#w-body');
      [null, step1, step2, step3, step4][S.step](body);
      announce(`Βήμα ${S.step} από 4: ${STEPS[S.step - 1]}`);
      body.focus?.();
    }

    /* ---------------------------- step 1: upload ---------------------------- */
    function step1(body) {
      body.innerHTML = `<section class="card" aria-labelledby="s1-h"><h3 id="s1-h">1. Επιλογή αρχείου</h3>
        <div class="dropzone" id="drop" tabindex="0" role="button" aria-label="Επιλογή ή απόθεση αρχείου">${icon('upload', { size: 38 })}<p><strong>Σύρετε εδώ το αρχείο</strong> ή πατήστε για επιλογή</p><p class="dim">.xlsx · .xls · .csv · .json — τα δεδομένα επεξεργάζονται μόνο στον περιηγητή σας</p><input type="file" id="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.json" hidden></div>
        ${S.file ? `<p class="ok">${icon('check', { size: 16 })} ${esc(S.file.name)}</p>` : ''}
        <p class="actions"><button class="btn" id="load-book2">${icon('file', { size: 16 })} Δοκιμή με το δείγμα Book2-sample.xlsx</button></p></section>`;
      const input = body.querySelector('#file'); const drop = body.querySelector('#drop');
      drop.addEventListener('click', () => input.click()); drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
      input.addEventListener('change', () => input.files[0] && loadFile(input.files[0]));
      body.querySelector('#load-book2').addEventListener('click', async () => { try { const r = await fetch('assets/samples/Book2-sample.xlsx'); const blob = await r.blob(); loadFile(new File([blob], 'Book2-sample.xlsx')); } catch (e) { toast('Δεν φορτώθηκε το δείγμα.', 'error'); } });
    }

    async function loadFile(file) {
      try {
        S.wb = await I.readFile(file); S.file = file; S.sheet = 0;
        const withData = S.wb.sheets.findIndex((s) => s.rows.length > 1); S.sheet = Math.max(0, withData);
        initMapping(); S.step = 2; paint();
      } catch (e) { toast(`Σφάλμα ανάγνωσης: ${e.message}`, 'error', 7000); }
    }
    function initMapping() {
      const rows = rowsOf(); S.headerRow = I.detectHeaderRow(rows);
      S.mapping = I.autoMap((rows[S.headerRow] || []).map((c) => (c === null || c === undefined ? '' : String(c))));
    }

    /* --------------------------- step 2: mapping --------------------------- */
    function step2(body) {
      const rows = rowsOf(); const data = rows.slice(S.headerRow + 1);
      const used = new Set(S.mapping.filter((m) => m.field).map((m) => m.field));
      const missing = FIELDS.filter((f) => f.required && !used.has(f.key));
      body.innerHTML = `<section class="card" aria-labelledby="s2-h"><h3 id="s2-h">2. Αντιστοίχιση στηλών</h3>
        <p class="sub">${esc(S.file.name)} · ${data.length} γραμμές δεδομένων · η αντιστοίχιση έγινε αυτόματα — μπορείτε να την αλλάξετε.</p>
        <div class="toolbar">${S.wb.sheets.length > 1 ? `<label class="inline">Φύλλο <select id="sheet">${S.wb.sheets.map((s, i) => `<option value="${i}"${i === S.sheet ? ' selected' : ''}>${esc(s.name)} (${s.rows.length})</option>`).join('')}</select></label>` : ''}
          <label class="inline">Γραμμή επικεφαλίδων <input type="number" id="hrow" min="1" max="${Math.min(rows.length, 50)}" value="${S.headerRow + 1}" style="width:5em"></label><button class="btn sm" id="remap">Αυτόματη αντιστοίχιση</button></div>
        ${missing.length ? `<div class="form-error" role="alert">Λείπουν υποχρεωτικά πεδία: ${missing.map((f) => esc(f.label)).join(', ')}</div>` : ''}
        <div class="table-wrap" tabindex="0" role="region" aria-label="Αντιστοίχιση στηλών"><table class="tbl"><caption class="sr-only">Αντιστοίχιση στηλών αρχείου σε πεδία μητρώου</caption><thead><tr><th scope="col">Στήλη αρχείου</th><th scope="col">Δείγμα τιμής</th><th scope="col">Πεδίο μητρώου</th><th scope="col">Βεβαιότητα</th></tr></thead><tbody>
        ${S.mapping.map((m, i) => { const sample = data.find((r) => r[m.index] !== null && r[m.index] !== undefined && r[m.index] !== ''); const sv = sample ? sample[m.index] : ''; return `<tr><td>${esc(m.header || `(στήλη ${i + 1})`)}</td><td class="dim">${esc(sv instanceof Date ? fmtDate(I.normalizeDate(sv)) : sv)}</td><td><label class="sr-only" for="map-${i}">Πεδίο για τη στήλη ${esc(m.header)}</label><select id="map-${i}" data-map="${i}"><option value="">— Παράλειψη —</option>${FIELDS.map((f) => `<option value="${f.key}"${m.field === f.key ? ' selected' : ''}>${esc(f.label)}${f.required ? ' *' : ''}</option>`).join('')}</select></td><td>${m.field ? badge(`${Math.round(m.score * 100)}%`, m.score >= 0.9 ? 'good' : m.score >= 0.7 ? 'warn' : 'bad') : '<span class="dim">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
        <fieldset class="opts"><legend>Καθαρισμός δεδομένων</legend>
          <label><input type="checkbox" data-opt="uppercaseNames" ${S.opts.uppercaseNames ? 'checked' : ''}> Κεφαλαία ονόματα, χωρίς τόνους (ΠΑΝΑΓΙΩΤΗΣ)</label>
          <label><input type="checkbox" data-opt="stripAccents" ${S.opts.stripAccents ? 'checked' : ''}> Αφαίρεση τόνων από ονόματα (όταν δεν είναι κεφαλαία)</label>
          <label><input type="checkbox" data-opt="formatPhones" ${S.opts.formatPhones ? 'checked' : ''}> Μορφοποίηση τηλεφώνων (+30 697 799 9137)</label>
          <label><input type="checkbox" data-opt="inferDegree" ${S.opts.inferDegree ? 'checked' : ''}> Συμπλήρωση βαθμού από τις ημερομηνίες όταν λείπει</label></fieldset>
        <div class="actions"><button class="btn" id="back">‹ Πίσω</button><button class="btn primary" id="next" ${missing.length ? 'disabled' : ''}>Έλεγχος δεδομένων ›</button></div></section>`;
      body.querySelector('#back').onclick = () => { S.step = 1; paint(); };
      body.querySelector('#next').onclick = () => { S.analysis = I.analyze(rowsOf().slice(S.headerRow + 1), S.mapping, store.members, S.opts); S.filter = 'all'; S.step = 3; paint(); };
      body.querySelector('#remap').onclick = () => { initMapping(); paint(); };
      body.querySelector('#sheet')?.addEventListener('change', (e) => { S.sheet = +e.target.value; initMapping(); paint(); });
      body.querySelector('#hrow').addEventListener('change', (e) => { S.headerRow = Math.max(0, +e.target.value - 1); S.mapping = I.autoMap((rowsOf()[S.headerRow] || []).map((c) => String(c ?? ''))); paint(); });
      body.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.map !== undefined) { const i = +t.dataset.map; const f = t.value || null; if (f) S.mapping.forEach((m) => { if (m.field === f) m.field = null; }); S.mapping[i].field = f; S.mapping[i].score = f ? 1 : 0; paint(); }
        if (t.dataset.opt) S.opts[t.dataset.opt] = t.checked;
      });
    }

    /* --------------------------- step 3: validation --------------------------- */
    function step3(body) {
      const a = S.analysis; const st = I.computeStats(a.items, a.blank);
      const items = a.items.filter((it) => S.filter === 'all' || (S.filter === 'issues' ? it.issues.length : it.state === S.filter));
      const tone = { valid: 'good', warning: 'warn', invalid: 'bad', duplicate: 'info' }; const label = { valid: 'Έγκυρη', warning: 'Με προειδοποίηση', invalid: 'Άκυρη', duplicate: 'Διπλότυπο' };
      body.innerHTML = `<section class="card" aria-labelledby="s3-h"><h3 id="s3-h">3. Έλεγχος & προεπισκόπηση</h3>
        <div class="kpi-grid compact">${[['Σύνολο γραμμών', st.total, 'file'], ['Έγκυρες', st.valid, 'check', 'good'], ['Άκυρες', st.invalid, 'alert', st.invalid ? 'bad' : ''], ['Διπλότυπα', st.duplicates, 'users', st.duplicates ? 'warn' : ''], ['Παραλείψεις (κενές)', a.blank, 'archive'], ['Προειδοποιήσεις', st.warnings, 'info']].map(([l, v, ic, tn]) => kpiCard({ label: l, value: v, ic, tone: tn || '' })).join('')}</div>
        <div class="pill-tabs" role="group" aria-label="Φίλτρο γραμμών">${[['all', 'Όλες'], ['valid', 'Έγκυρες'], ['warning', 'Προειδοποιήσεις'], ['invalid', 'Άκυρες'], ['duplicate', 'Διπλότυπα']].map(([k, l]) => `<button class="pill" data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Προεπισκόπηση γραμμών"><table class="tbl compact"><caption class="sr-only">Προεπισκόπηση εισαγωγής</caption><thead><tr><th scope="col">Εισαγωγή</th><th scope="col">Γρ.</th><th scope="col">Αρ.</th><th scope="col">Μέλος</th><th scope="col">Βαθμός</th><th scope="col">Κινητό</th><th scope="col">Email</th><th scope="col">Εισδοχή</th><th scope="col">Κατάσταση</th><th scope="col">Παρατηρήσεις</th></tr></thead><tbody>
        ${items.slice(0, 300).map((it) => `<tr class="st-${it.state}"><td><input type="checkbox" data-inc="${it.rowNo}" ${it.include ? 'checked' : ''} ${it.state === 'invalid' ? 'disabled' : ''} aria-label="Συμπερίληψη γραμμής ${it.rowNo}"></td><td>${it.rowNo}</td><td class="mono">${esc(it.record.registryNumber)}</td><td>${esc(`${it.record.lastName} ${it.record.firstName}`)}</td><td>${esc(DEGREES[it.record.degree]?.label || '')}</td><td>${esc(it.record.mobilePhone)}</td><td>${esc(it.record.email)}</td><td>${fmtDate(it.record.initiationDate)}</td><td>${badge(label[it.state], tone[it.state])}</td><td class="notes-cell">${[...it.issues.map((x) => `<span class="${x.level}">${esc(x.msg)}</span>`), ...(it.duplicate || []).map((d) => `<span class="warn">Διπλότυπο (${{ registryNumber: 'αρ. μητρώου', email: 'email', phone: 'τηλέφωνο' }[d.by]}) με ${esc(d.with)}</span>`)].join('<br>')}</td></tr>`).join('')}</tbody></table></div>
        ${items.length > 300 ? `<p class="dim">Εμφανίζονται οι πρώτες 300 από ${items.length} γραμμές.</p>` : ''}
        <div class="actions"><button class="btn" id="back">‹ Αντιστοίχιση</button><button class="btn primary" id="next" ${st.valid + st.duplicates === 0 ? 'disabled' : ''}>Συνέχεια ›</button></div></section>`;
      body.querySelector('#back').onclick = () => { S.step = 2; paint(); };
      body.querySelector('#next').onclick = () => { S.step = 4; paint(); };
      body.addEventListener('click', (e) => { const f = e.target.closest('[data-f]'); if (f) { S.filter = f.dataset.f; step3(body); } });
      body.addEventListener('change', (e) => { const c = e.target.dataset.inc; if (c) { const it = a.items.find((x) => x.rowNo === +c); it.include = e.target.checked; } });
    }

    /* --------------------------- step 4: confirm --------------------------- */
    function step4(body) {
      const a = S.analysis; const st = I.computeStats(a.items, a.blank);
      if (S.report) {
        const r = S.report; const s = r.stats;
        body.innerHTML = `<section class="card" aria-labelledby="s4-h"><h3 id="s4-h">Η εισαγωγή ολοκληρώθηκε</h3><div class="kpi-grid compact">${[['Σύνολο γραμμών', s.total, 'file'], ['Έγκυρες', s.valid, 'check', 'good'], ['Άκυρες', s.invalid, 'alert'], ['Διπλότυπα', s.duplicates, 'users'], ['Παραλείφθηκαν', s.skipped, 'archive'], ['Εισήχθησαν', s.imported, 'upload', 'gold']].map(([l, v, ic, tn]) => kpiCard({ label: l, value: v, ic, tone: tn || '' })).join('')}</div>
          <p>Δημιουργήθηκαν <strong>${s.created}</strong> νέα μέλη, ενημερώθηκαν <strong>${s.updated}</strong>.</p>
          <div class="actions"><button class="btn" id="rep-json">${icon('download', { size: 15 })} Αναφορά JSON</button><button class="btn" id="rep-xlsx">${icon('download', { size: 15 })} Αναφορά Excel</button><button class="btn" id="rep-csv">${icon('download', { size: 15 })} Αναφορά CSV</button><a class="btn primary" href="#/members">Μετάβαση στο μητρώο</a><button class="btn" id="again">Νέα εισαγωγή</button></div></section>`;
        const tbl = () => ({ title: 'Αναφορά εισαγωγής', sheet: 'Εισαγωγή', columns: [{ key: 'row', label: 'Γραμμή' }, { key: 'registry', label: 'Αρ. Μητρώου' }, { key: 'name', label: 'Μέλος' }, { key: 'action', label: 'Ενέργεια' }, { key: 'reason', label: 'Αιτιολογία' }], rows: r.details, summary: Object.entries(s).map(([k, v]) => [k, v]) });
        body.querySelector('#rep-json').onclick = () => exportJSON(r, `import-report-${stamp()}`);
        body.querySelector('#rep-xlsx').onclick = () => exportXLSX(tbl(), `import-report-${stamp()}`);
        body.querySelector('#rep-csv').onclick = () => exportCSV(tbl(), `import-report-${stamp()}`, store.settings.csvDelimiter);
        body.querySelector('#again').onclick = () => { Object.assign(S, { step: 1, file: null, wb: null, analysis: null, report: null }); paint(); };
        return;
      }
      const dupCount = st.duplicates;
      body.innerHTML = `<section class="card" aria-labelledby="s4-h"><h3 id="s4-h">4. Επιβεβαίωση εισαγωγής</h3>
        <p>Θα εισαχθούν έως <strong>${st.valid - a.items.filter((x) => !x.include && x.state !== 'invalid' && x.state !== 'duplicate').length}</strong> έγκυρες εγγραφές από το «${esc(S.file.name)}».</p>
        ${dupCount ? `<fieldset class="opts"><legend>Διαχείριση διπλοτύπων (${dupCount}) — έλεγχος με αρ. μητρώου, email και τηλέφωνο</legend>
          <label><input type="radio" name="dup" value="skip" ${S.dup === 'skip' ? 'checked' : ''}> Παράλειψη διπλοτύπων (προτεινόμενο)</label>
          <label><input type="radio" name="dup" value="update" ${S.dup === 'update' ? 'checked' : ''}> Ενημέρωση υπαρχόντων μελών με ίδιο αρ. μητρώου (συμπληρώνει μόνο μη κενά πεδία)</label>
          <label><input type="radio" name="dup" value="import" ${S.dup === 'import' ? 'checked' : ''}> Εισαγωγή ως νέα όταν ταυτίζεται μόνο email/τηλέφωνο</label></fieldset>` : '<p class="ok">Δεν εντοπίστηκαν διπλότυπα.</p>'}
        <div class="notice" role="note">${icon('info')}<div>Δημιουργείται αυτόματα αντίγραφο ασφαλείας (λήψη JSON) πριν την εισαγωγή. Μπορείτε να επαναφέρετε από τις Ρυθμίσεις.</div></div>
        <div class="actions"><button class="btn" id="back">‹ Πίσω</button><button class="btn primary" id="go" ${S.busy ? 'disabled' : ''}>${icon('upload', { size: 16 })} Εισαγωγή τώρα</button></div></section>`;
      body.querySelector('#back').onclick = () => { S.step = 3; paint(); };
      body.addEventListener('change', (e) => { if (e.target.name === 'dup') S.dup = e.target.value; });
      body.querySelector('#go').onclick = () => {
        S.busy = true;
        try {
          exportJSON(store.exportBackup(), `backup-before-import-${stamp()}`);
          S.report = I.runImport(store, S.analysis, { duplicates: S.dup, fileName: S.file.name, sheet: S.wb.sheets[S.sheet].name, mapping: S.mapping });
          if (store.isSample && S.report.stats.imported) toast('Τα δεδομένα δείγματος παραμένουν· καθαρίστε τα από τις Ρυθμίσεις.', 'warn', 6000);
          toast(`Εισήχθησαν ${S.report.stats.imported} εγγραφές.`, 'success');
        } catch (e) { toast(`Αποτυχία εισαγωγής: ${e.message}`, 'error', 8000); }
        S.busy = false; paint();
      };
    }

    /* ----------------------- samples / docs / reports ----------------------- */
    function docsAndSamples() {
      return `<section class="card" aria-labelledby="smp-h"><h3 id="smp-h">Πρότυπα & δείγματα αρχείων</h3><p class="sub">Κατεβάστε ένα αρχείο με την ακριβή δομή του Book2.xlsx.</p>
        <div class="actions"><button class="btn" data-dl="template-xlsx">${icon('download', { size: 15 })} Πρότυπο XLSX (κενό)</button><a class="btn" href="assets/samples/Book2-sample.xlsx" download>${icon('download', { size: 15 })} Δείγμα XLSX</a><a class="btn" href="assets/samples/Book2-sample.csv" download>${icon('download', { size: 15 })} Δείγμα CSV</a><a class="btn" href="assets/samples/Book2-sample.json" download>${icon('download', { size: 15 })} Δείγμα JSON</a></div></section>
        <section class="card" aria-labelledby="doc-h"><h3 id="doc-h">Οδηγός εισαγωγής/εξαγωγής</h3>
          <details open><summary>Αυτόματη αναγνώριση στηλών</summary><div class="table-wrap"><table class="tbl compact"><thead><tr><th scope="col">Στήλη Excel</th><th scope="col">Πεδίο</th></tr></thead><tbody>${I.BOOK2_HEADERS.map((h, i) => `<tr><td>${esc(h)}</td><td><code>${I.BOOK2_FIELDS[i]}</code></td></tr>`).join('')}</tbody></table></div><p class="dim">Η αναγνώριση αγνοεί τόνους, κεφαλαία/πεζά και σημεία στίξης. Η στήλη κατηγορίας αναγνωρίζεται και όταν η επικεφαλίδα της είναι τιμή όπως «1. ΤΑΚΤΙΚΟ».</p></details>
          <details><summary>Καθαρισμός & έλεγχος</summary><ul><li>Κεφαλαία ονόματα χωρίς τόνους, καθαρισμός πολλαπλών κενών.</li><li>Τηλέφωνα: κανονικοποίηση σε <code>+30 697 799 9137</code>.</li><li>Email: έλεγχος μορφής, μετατροπή σε πεζά.</li><li>Ημερομηνίες: Excel serial, <code>dd/mm/yyyy</code>, <code>dd.mm.yy</code>, <code>yyyy-mm-dd</code> → ISO.</li><li>Διπλότυπα: αριθμός μητρώου, email και κινητό (και μέσα στο ίδιο αρχείο).</li><li>Κατηγορία «5. ΔΙΑΓΡΑΦΕΝ» → κατάσταση «Πρώην».</li></ul></details>
          <details><summary>Εξαγωγές</summary><p>Μητρώο: Excel, CSV (διαχωριστικό <code>;</code> με UTF-8 BOM για σωστά ελληνικά στο Excel), PDF, JSON και εκτύπωση. Αναφορές και analytics: PDF/Excel/CSV/PNG. Πλήρες αντίγραφο ασφαλείας: Ρυθμίσεις → JSON.</p></details></section>`;
    }
    function reportsList() {
      const list = store.state.imports; if (!list.length) return '';
      return `<section class="card" aria-labelledby="hist-h"><h3 id="hist-h">Προηγούμενες εισαγωγές</h3>${dataTable({ caption: 'Αναφορές εισαγωγής', cls: 'compact', columns: [{ key: 'at', label: 'Ημερομηνία' }, { key: 'file', label: 'Αρχείο' }, { key: 'total', label: 'Γραμμές' }, { key: 'imported', label: 'Εισήχθησαν' }, { key: 'skipped', label: 'Παραλείφθηκαν' }, { key: 'invalid', label: 'Άκυρες' }, { key: 'duplicates', label: 'Διπλότυπα' }], rows: list.map((r) => ({ at: r.at.replace('T', ' ').slice(0, 16), file: r.file, ...r.stats })) })}</section>`;
    }
    root.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-dl]'); if (!d) return;
      if (d.dataset.dl === 'template-xlsx') { const X = await I.getXLSX(); const ws = X.utils.aoa_to_sheet(I.templateRows()); ws['!cols'] = I.BOOK2_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) })); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Sheet1'); download(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/octet-stream' }), 'Book2-template.xlsx'); }
    });
    paint();
    return undefined;
  },
};
