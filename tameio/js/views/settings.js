/** Settings: lodge data, preferences, roles & passwords, backup/restore, storage and maintenance. */
import { ROLES, APP } from '../config.js';
import { esc, fmtNum, download, stamp, parseMoney } from '../utils.js';
import { icon, sectionHead, field, readForm, toast, confirmDialog, openDialog, kpiCard, badge } from '../ui.js';
import { setPassword, verify } from '../auth.js';
import { exportJSON } from '../exporter.js';

export default {
  id: 'settings', title: 'Ρυθμίσεις',
  async render(root, app) {
    const { store } = app; const s = store.settings; const admin = app.can('settings'); const bk = app.can('backup');
    root.innerHTML = `${sectionHead('Ρυθμίσεις', '', `${APP.name} v${APP.version}`)}
      <div class="grid g2">
        <section class="card" aria-labelledby="st-pref"><h3 id="st-pref">Προτιμήσεις</h3><form id="f-pref" class="form-grid one">
          ${field({ id: 'theme', label: 'Θέμα', type: 'select', value: s.theme, options: [['auto', 'Αυτόματο (σύστημα)'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']] })}
          ${field({ id: 'csvDelimiter', label: 'Διαχωριστικό CSV', type: 'select', value: s.csvDelimiter, options: [[';', 'Ερωτηματικό ; (Excel Ελλάδας)'], [',', 'Κόμμα ,'], ['\t', 'Tab']] })}
          ${field({ id: 'pageSize', label: 'Γραμμές ανά σελίδα', type: 'select', value: s.pageSize, options: [10, 25, 50, 100].map((n) => [n, n]) })}
          ${field({ id: 'workerThreshold', label: 'Όριο μελών για Web Worker αναζήτηση', type: 'number', value: s.workerThreshold, hint: 'Κάτω από το όριο χρησιμοποιείται η τοπική μηχανή.', attrs: 'min="0"' })}
          ${field({ id: 'asOfYear', label: 'Τρέχον οικονομικό έτος', type: 'number', value: s.asOfYear || new Date().getFullYear(), hint: 'Χρησιμοποιείται για τον υπολογισμό οφειλών και προβλέψεων.', attrs: 'min="2020" max="2100"' })}
          ${field({ id: 'debtFromYear', label: 'Υπολογισμός οφειλών από το έτος', type: 'number', value: s.debtFromYear, attrs: 'min="2020" max="2100"' })}
          ${field({ id: 'dueMonthDay', label: 'Καταληκτική ημερομηνία εισφοράς (μμ-ηη)', value: s.dueMonthDay, hint: 'Για την ανάλυση συμμόρφωσης, π.χ. 03-31' })}
          <div class="actions"><button class="btn primary" type="submit" ${admin ? '' : 'disabled'}>Αποθήκευση</button></div></form></section>
        <section class="card" aria-labelledby="st-lodge"><h3 id="st-lodge">Στοιχεία Στοάς</h3><form id="f-lodge" class="form-grid one">
          ${field({ id: 'fullName', label: 'Πλήρης τίτλος', value: s.lodge.fullName })}${field({ id: 'name', label: 'Όνομα Στοάς', value: s.lodge.name })}${field({ id: 'number', label: 'Αριθμός', type: 'number', value: s.lodge.number })}${field({ id: 'province', label: 'Επαρχιακή Μεγάλη Στοά', value: s.lodge.province })}${field({ id: 'grandLodge', label: 'Μεγάλη Στοά', value: s.lodge.grandLodge })}
          <div class="actions"><button class="btn primary" type="submit" ${admin ? '' : 'disabled'}>Αποθήκευση</button></div></form></section>
        <section class="card" aria-labelledby="st-role"><h3 id="st-role">Ρόλοι & προστασία με κωδικό</h3>
          <p class="sub">Ο τρέχων ρόλος: <strong>${esc(ROLES[s.role].label)}</strong>. ${s.auth.enabled ? badge('Κωδικοί ενεργοί', 'good') : badge('Χωρίς κωδικό', 'warn')}</p>
          <label class="inline">Ενεργός ρόλος <select id="role-sel" ${s.auth.enabled && !admin ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${k === s.role ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
          <div class="table-wrap"><table class="tbl compact"><caption class="sr-only">Δικαιώματα ανά ρόλο</caption><thead><tr><th scope="col">Ρόλος</th><th scope="col">Δικαιώματα</th><th scope="col">Κωδικός</th></tr></thead><tbody>${Object.entries(ROLES).map(([k, v]) => `<tr><td>${esc(v.label)}</td><td class="dim">${esc(v.can.join(', '))}</td><td>${s.auth.hashes[k] ? badge('ορισμένος', 'good') : '<span class="dim">—</span>'} ${admin ? `<button class="btn sm" data-pw="${k}">Ορισμός</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
          <label class="check"><input type="checkbox" id="auth-on" ${s.auth.enabled ? 'checked' : ''} ${admin ? '' : 'disabled'}> Απαίτηση κωδικού κατά την εκκίνηση</label>
          <p class="dim">Προσοχή: η προστασία γίνεται στον περιηγητή και αποθηκεύεται τοπικά· αποτρέπει τυχαία πρόσβαση, δεν αντικαθιστά κρυπτογράφηση ή διακομιστή.</p></section>
        <section class="card" aria-labelledby="st-bk"><h3 id="st-bk">Αντίγραφα ασφαλείας</h3>
          <p>Εξαγωγή/επαναφορά όλων των δεδομένων (μέλη, πληρωμές, ρυθμίσεις, ιστορικό) σε αρχείο JSON.</p>
          <div class="actions"><button class="btn primary" id="bk-export" ${bk ? '' : 'disabled'}>${icon('download', { size: 15 })} Λήψη αντιγράφου JSON</button><button class="btn" id="bk-import" ${bk ? '' : 'disabled'}>${icon('upload', { size: 15 })} Επαναφορά από JSON</button><input type="file" id="bk-file" accept=".json,application/json" hidden></div>
          <div class="kpi-grid compact">${kpiCard({ label: 'Μέλη', value: store.members.length, ic: 'users' })}${kpiCard({ label: 'Κινήσεις', value: store.ledger.length, ic: 'coins' })}${kpiCard({ label: 'Αποθήκευση', value: `${fmtNum(store.usage() / 1024)} KB`, sub: store.storage.ok ? 'LocalStorage + IndexedDB' : 'μόνο μνήμη!', ic: 'archive' })}</div>
          <p class="dim">Τελευταία αποθήκευση: ${store.lastSaved ? store.lastSaved.toLocaleString('el-GR') : '—'}</p></section>
        <section class="card danger-zone" aria-labelledby="st-data"><h3 id="st-data">Διαχείριση δεδομένων</h3>
          ${store.isSample ? `<div class="notice">${icon('info')}<div>Χρησιμοποιείτε <strong>δεδομένα δείγματος</strong> (22 μέλη, πλασματικές πληρωμές).</div></div>` : ''}
          <div class="actions"><button class="btn" id="d-clear" ${admin ? '' : 'disabled'}>Καθαρισμός όλων των μελών & πληρωμών</button><button class="btn" id="d-seed" ${admin ? '' : 'disabled'}>Επαναφορά δεδομένων δείγματος</button><button class="btn danger" id="d-reset" ${admin ? '' : 'disabled'}>Πλήρης επαναφορά εφαρμογής</button></div></section>
        <section class="card" aria-labelledby="st-pwa"><h3 id="st-pwa">Εγκατάσταση (PWA)</h3><p>Εγκαταστήστε την εφαρμογή για χρήση εκτός σύνδεσης.</p><div class="actions"><button class="btn primary" id="pwa-install" hidden>${icon('download', { size: 15 })} Εγκατάσταση εφαρμογής</button></div>
          <ul><li><strong>Windows/Chrome/Edge:</strong> εικονίδιο εγκατάστασης στη γραμμή διευθύνσεων.</li><li><strong>Android:</strong> μενού ⋮ → «Εγκατάσταση εφαρμογής».</li><li><strong>iPhone/iPad (Safari):</strong> Κοινοποίηση → «Προσθήκη στην οθόνη Αφετηρίας».</li></ul></section>
      </div>`;

    root.querySelector('#f-pref').addEventListener('submit', (e) => {
      e.preventDefault(); if (!app.guard('settings')) return; const f = readForm(e.target);
      store.updateSettings({ theme: f.theme, csvDelimiter: f.csvDelimiter, pageSize: +f.pageSize, workerThreshold: +f.workerThreshold || 0, asOfYear: +f.asOfYear || null, debtFromYear: +f.debtFromYear || 2026, dueMonthDay: f.dueMonthDay || '03-31' });
      app.applyTheme(); app.engine.threshold = store.settings.workerThreshold; app.engine.init(); toast('Οι προτιμήσεις αποθηκεύτηκαν.', 'success'); app.refresh();
    });
    root.querySelector('#f-lodge').addEventListener('submit', (e) => { e.preventDefault(); if (!app.guard('settings')) return; const f = readForm(e.target); store.updateSettings({ lodge: { ...s.lodge, ...f, number: +f.number } }); toast('Τα στοιχεία της Στοάς αποθηκεύτηκαν.', 'success'); });
    root.querySelector('#role-sel').addEventListener('change', async (e) => { if (!(await app.switchRole(e.target.value))) e.target.value = store.settings.role; else app.refresh(); });
    root.querySelector('#auth-on').addEventListener('change', async (e) => {
      if (e.target.checked && !store.settings.auth.hashes.admin) { toast('Ορίστε πρώτα κωδικό για τον Διαχειριστή.', 'warn'); e.target.checked = false; return; }
      store.updateSettings({ auth: { ...store.settings.auth, enabled: e.target.checked } }); toast(e.target.checked ? 'Η προστασία με κωδικό ενεργοποιήθηκε.' : 'Η προστασία απενεργοποιήθηκε.', 'success');
    });
    root.addEventListener('click', async (e) => {
      const pw = e.target.closest('[data-pw]');
      if (pw) {
        const role = pw.dataset.pw;
        const res = await openDialog({ title: `Κωδικός: ${ROLES[role].label}`, size: 'sm', body: `<p class="dim">Αφήστε κενό για αφαίρεση κωδικού.</p>${field({ id: 'pw1', label: 'Νέος κωδικός', type: 'password', attrs: 'autocomplete="new-password" minlength="6"' })}${field({ id: 'pw2', label: 'Επανάληψη', type: 'password', attrs: 'autocomplete="new-password"' })}`, actions: [{ label: 'Άκυρο', value: undefined }, { label: 'Αποθήκευση', kind: 'primary', validate: (d) => { const a = d.querySelector('#pw1').value; const b = d.querySelector('#pw2').value; if (a !== b) return 'Οι κωδικοί δεν ταυτίζονται.'; if (a && a.length < 6) return 'Τουλάχιστον 6 χαρακτήρες.'; if (!a && role === 'admin' && store.settings.auth.enabled) return 'Δεν μπορείτε να αφαιρέσετε τον κωδικό του Διαχειριστή ενώ η προστασία είναι ενεργή.'; return true; }, collect: (d) => d.querySelector('#pw1').value }] });
        if (res !== undefined) { await setPassword(store, role, res); toast(res ? 'Ο κωδικός ορίστηκε.' : 'Ο κωδικός αφαιρέθηκε.', 'success'); app.refresh(); }
        return;
      }
      const id = e.target.closest('button')?.id;
      if (id === 'bk-export') { if (!app.guard('backup')) return; exportJSON(store.exportBackup(), `tameio-backup-${stamp()}`); toast('Το αντίγραφο ασφαλείας λήφθηκε.', 'success'); }
      if (id === 'bk-import') root.querySelector('#bk-file').click();
      if (id === 'd-clear' && await confirmDialog('Θα διαγραφούν ΟΛΑ τα μέλη και οι πληρωμές. Προτείνεται πρώτα αντίγραφο ασφαλείας. Συνέχεια;', { danger: true, ok: 'Καθαρισμός' })) { exportJSON(store.exportBackup(), `backup-before-clear-${stamp()}`); store.clearData(); toast('Τα δεδομένα καθαρίστηκαν.', 'success'); app.refresh(); }
      if (id === 'd-seed' && await confirmDialog('Θα αντικατασταθούν τα τρέχοντα δεδομένα με τα δεδομένα δείγματος.', { danger: true, ok: 'Επαναφορά δείγματος' })) { store.loadSeed(); toast('Φορτώθηκαν τα δεδομένα δείγματος.', 'success'); app.refresh(); }
      if (id === 'd-reset' && await confirmDialog('ΠΛΗΡΗΣ επαναφορά: διαγράφονται δεδομένα, ρυθμίσεις και κωδικοί από αυτόν τον περιηγητή. Η ενέργεια δεν αναιρείται.', { danger: true, ok: 'Επαναφορά', title: 'Πλήρης επαναφορά' })) { await store.factoryReset(); location.reload(); }
    });
    root.querySelector('#bk-file').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!(await confirmDialog(`Επαναφορά από «${f.name}»; Τα τρέχοντα δεδομένα θα αντικατασταθούν.`, { danger: true, ok: 'Επαναφορά' }))) return;
        store.restoreBackup(obj); toast(`Επαναφέρθηκαν ${store.members.length} μέλη.`, 'success'); app.refresh();
      } catch (err) { toast(`Αποτυχία επαναφοράς: ${err.message}`, 'error', 7000); }
    });
    const inst = root.querySelector('#pwa-install'); if (app.installPrompt) inst.hidden = false;
    inst.addEventListener('click', () => app.install());
    return undefined;
  },
};
