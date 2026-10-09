# TAMEIO THEMISTOCLES 96

Membership, treasury, analytics and reporting system for the **Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96**
(Εθνική Μεγάλη Στοά της Ελλάδος · Επαρχιακή Μεγάλη Στοά Πειραιώς και Αιγαίου).
100 % client-side: HTML5, CSS3, ES2023 modules, LocalStorage, IndexedDB and a Service Worker. **No server, no Node.js, no build step.**

## Table of contents
Overview · Features · Screenshots Placeholder · Installation · GitHub Pages Deployment · Excel Import Guide · Data Structure · Treasury Module Guide · Analytics Guide · Offline Mode · PWA Installation · Backup Procedures · Security Considerations · User Roles · Maintenance · Troubleshooting · Version History · License

## Overview
The UI is in Greek (navy `#0B1F3A`, gold `#D4AF37`, white; light & dark themes, responsive, WCAG 2.2 oriented).
All data lives in the browser of the person using it. First start loads **sample data** (22 members from the lodge roster with names and categories only, no payments); replace it with your own via *Εισαγωγή* and clear the sample in *Ρυθμίσεις*.

## Features
- **Member registry** – add, edit, soft-delete, restore, archive, former members; Excel/CSV/PDF/JSON export and printing; full profile page (registry data, contacts, degree progression, offices, payment history, analytics, notes, timeline).
- **Treasury 2026–2030** – annual contribution per member stored as real money values (editable grid; differences are booked as ledger entries), fee schedule per category, totals, balances, debt ratios, collection %, lifetime contributions, year-over-year growth, forecasts.
- **Analytics / BI** – KPIs, membership growth, age/degree/geography, officer participation, retention & churn, degree-progression histograms, revenue by year/category, debt buckets, payment compliance, forecasting, trend & anomaly detection, filters (year, degree, province, office, status, category); export to PDF, Excel, PNG.
- **Reports** – Treasurer, Annual, Membership, Debt, Revenue, Activity, Executive summary, Forecast → PDF / Excel / CSV / print.
- **Import wizard** (4 steps) with automatic Greek column mapping (direct `Book2.xlsx` support), cleansing, validation, duplicate detection (registry no., e-mail, phone), import reports, templates and samples.
- **Enterprise search** – inverted index on `Map`, memoised LRU cache, incremental updates, debounce, accent-insensitive & Greeklish; Web Worker engine with automatic local fallback; ARIA 1.2 combobox with ↑ ↓ Enter Tab Esc.
- **Offline PWA**, autosave of everything, IndexedDB mirror, RBAC, optional password lock, built-in **diagnostics suite (105 checks, “Run All Tests”)**.

## Screenshots Placeholder
Put PNGs in `assets/screenshots/` and reference them here:
`![Dashboard](assets/screenshots/dashboard.png)` · `![Treasury](assets/screenshots/treasury.png)` · `![Analytics](assets/screenshots/analytics.png)` · `![Import](assets/screenshots/import.png)`

## Installation
```bash
git clone https://github.com/USERNAME/THEMISTOCLES96-TAMEIO.git
cd THEMISTOCLES96-TAMEIO
python3 -m http.server 8000      # optional local preview → http://localhost:8000
```
Service Worker, Web Worker and ES modules need `http(s)://` – opening `index.html` via `file://` works only partially. The ready-made repository layout:

```
index.html  styles.css  app.js  worker.js  service-worker.js  manifest.json  README.md
build_release.py  VERSION  CHANGELOG.md  LICENSE  .nojekyll
.github/workflows/deploy.yml
js/            modules (store, search-core, search-engine, autocomplete, importer, exporter, treasury, analytics, reports, tests, ui, charts, auth, utils, config, seed-data)
js/views/      dashboard, members, profile, treasury, analytics, reports, import, tests, settings, docs
assets/        icons/ vendor/ (Chart.js, SheetJS, jsPDF) fonts/ samples/ screenshots/
sample-data/   members.json ledger.json seed.json treasury-summary.json
tools/         make_seed.py
```

## GitHub Pages Deployment
1. Create a GitHub repository named **THEMISTOCLES96-TAMEIO**.
2. Upload all project files (the *contents* of this folder, so `index.html` is at the repository root).
3. Commit the changes to the **main** branch.
4. Open **Repository → Settings → Pages**.
5. Under *Build and deployment* choose **“Deploy from a branch”**.
6. Select the **main** branch and the **/ (root)** folder.
7. **Save** and wait for the deployment (1–2 minutes).
8. Open `https://USERNAME.github.io/THEMISTOCLES96-TAMEIO/`.

> This copy lives in the `tameio/` folder of the lodge-website repository. To deploy it from there, either copy the folder contents into the dedicated repository above, or publish this repo with Pages pointing at the folder via a workflow. All paths are relative, so it works under any sub-path.

> **Privacy:** a GitHub Pages site is public. Never commit real member data (phones, e-mails, payments). Import real data only through the app on the devices that need it. The bundled sample contains names, registry numbers, degrees and dates only; contacts are blank and no payments are bundled.

**CI (`.github/workflows/deploy.yml`)** validates HTML, CSS and JavaScript on every push, checks version consistency, builds the ZIP and – for tags `vX.Y.Z` – creates a GitHub release with changelog notes.

## Excel Import Guide
Open **Εισαγωγή** → follow the 4 steps: *Αρχείο → Αντιστοίχιση στηλών → Έλεγχος & προεπισκόπηση → Επιβεβαίωση*.
Automatic mapping (accent/case/punctuation-insensitive):

| Excel column | Field | | Excel column | Field |
|---|---|---|---|---|
| Αρ. Μέλους | registryNumber | | Τόπος Κατοικίας | residence |
| Όνομα Μέλους | firstName | | Βαθμός | degree |
| Επώνυμο Μέλους | lastName | | Παρόν Αξίωμα Εν τη Στοά | office |
| Έτος Γεννήσεως | birthYear | | Λοιπές Παρατηρήσεις | notes |
| Όνομα Πατρός | fatherName | | Στοά Υπ Αρ. | lodgeNumber |
| Κατηγορία Μέλους (or header like `1. ΤΑΚΤΙΚΟ`) | category | | Σ. Στοά | lodgeName |
| Κιν. Τηλέφωνο Μέλους | mobilePhone | | Επαρχία | province |
| e-mail Μέλους | email | | Ημ. Εισδοχής / Διελεύσεως / Εγέρσεως | initiationDate / passingDate / raisingDate |

Extra Book2 columns (adoption/reinstatement dates, office install date, grand-lodge office, lodge mail) are also recognised. Cleansing: uppercase accent-free names, `+30 697 799 9137` phones, e-mail validation, date normalisation (Excel serials, `dd/mm/yyyy`, `dd.mm.yy`, ISO). Statistics: total / valid / invalid / duplicates / skipped / imported. A JSON backup is downloaded automatically before importing and a report (JSON/Excel/CSV) is produced after.
Samples: `assets/samples/Book2-sample.xlsx|csv|json`; template download in the wizard.

## Data Structure
LocalStorage keys (prefix `t96.`): `members`, `ledger`, `settings`, `ui` (filters, search history, dashboard config), `audit`, `imports`, `meta` (schema version). A full snapshot is mirrored to IndexedDB and used for recovery.

```jsonc
// member
{ "id":"m_960003","registryNumber":"960003","firstName":"ΠΑΥΛΟΣ","lastName":"ΚΡΕΟΥΖΗΣ","birthYear":1961,"fatherName":"ΓΕΩΡΓΙΟΣ",
  "category":"ΤΑΚΤΙΚΟ","mobilePhone":"","email":"","initiationDate":"2023-11-21","passingDate":"2024-03-12","raisingDate":"2024-12-18",
  "residence":"ΕΛΕΥΣΙΝΑ","degree":"ΔΙΔΑΣΚΑΛΟΣ","office":"Α Επόπτης","lodgeNumber":96,"lodgeName":"ΘΕΜΙΣΤΟΚΛΗΣ","province":"Πειραιως & Αιγαιου",
  "status":"active","offices":[{"office":"Α Επόπτης","from":"2026-06-09","to":""}],"history":[],"feeOverride":{},"exempt":false }
// ledger entry
{ "id":"p_0001","memberId":"m_960003","year":2026,"amount":300,"date":"2026-02-11","method":"bank","receipt":"ΑΠ-2026-0001","note":"" }
```
Status values: `active`, `former`, `archived`, `deleted` (soft delete). Schema migrations live in `js/store.js` (`MIGRATIONS`).

## Treasury Module Guide
- **Εισφορές ανά μέλος**: one money cell per member for 2026–2030. Type the new *total paid* and press Enter/Tab: the difference is stored as an adjustment ledger entry, so history is never lost.
- **Categories & fees (every year 2026–2030):** Τακτικό 200 €, Μέτοικο 100 €, Υιοθετημένο 20 €, Επίτιμο 0, Ομότιμο 0, Διαγραμμένο (not a member, no fee). Editable in *Πρόγραμμα εισφορών*.
- **Expected fee** = fee schedule(category, year) or personal override; 0 for exempt members, years before initiation and years after leaving.
- **Debt** = Σ max(0, expected − paid) from `debtFromYear` to the current year. **Collection rate** = min(paid, expected)/expected. **Debt ratio** = outstanding/expected.
- Tabs: grid · ledger · debtors · fee schedule · analysis & forecast. Exports use the Reports engine.

## Analytics Guide
*Analytics* applies the filters to every chart and KPI. Each chart has **PNG** export and an accessible **data table**; the page exports to **PDF** (charts + KPIs), **Excel** (one sheet per analysis) and one combined **PNG**. Forecasts combine the fee schedule × historical collection rate (with ± band) and a linear trend model. Anomalies: duplicates, non-chronological degree dates, implausible ages, unpaid years, over-payments, statistical outliers (>3σ).

## Offline Mode
After the first visit the Service Worker caches the whole app (network-first for the page, network-first for code, cache-first for assets). Data is stored locally, so the app works without a connection; a status chip shows online/offline and save state (autosave on every change).

## PWA Installation
Windows/Chrome/Edge: install icon in the address bar · Android: ⋮ → *Install app* · iPhone/iPad (Safari): *Share → Add to Home Screen*. Icons: `assets/icons` (192, 512, maskable, Apple touch).

## Backup Procedures
**Ρυθμίσεις → Αντίγραφα ασφαλείας → Λήψη αντιγράφου JSON** (members, payments, settings, history; passwords are *not* included). Restore with **Επαναφορά από JSON** (replaces current data; schema migrations are applied). Keep a dated backup after each treasury session, store it outside the browser, and test a restore occasionally. Manual alternative in the browser console: `JSON.stringify(__app.store.exportBackup())`.

## Security Considerations
Data never leaves the browser. The optional password lock (salted SHA-256, per role) and roles are **client-side conveniences**: anyone with access to the device/browser profile or developer tools can bypass them, and LocalStorage is not encrypted. Use device encryption and an OS user account for real confidentiality. A strict Content-Security-Policy is set in `index.html`; user-controlled text is HTML-escaped everywhere. Do not publish real personal data in the repository.

## User Roles
| Role | Rights |
|---|---|
| Διαχειριστής (Administrator) | everything incl. settings, backup, passwords |
| Γραμματέας (Secretary) | members (create/edit/delete), import, export, tests |
| Ταμίας (Treasurer) | treasury write, export, tests |
| Μόνο ανάγνωση (Read-only) | view only |

## Maintenance
- **Update:** replace files in the repository, run `python3 build_release.py --bump patch` (bumps `VERSION`, `js/config.js`, service-worker cache name, regenerates the pre-cache list, builds the ZIP, then walks through git add/commit/push with previews). Users receive the update on next visit (a toast asks them to reopen).
- **`build_release.py`** flow: ZIP preview → build ZIP → git dry run → confirm → git add → staged preview → commit confirmation → commit → select branch → push confirmation → push. Flags: `--dry-run`, `--zip-only`, `--changelog`, `--update-sw`, `-y`.
- **Sample data:** `python3 tools/make_seed.py Book2.xlsx` regenerates `sample-data/`, `assets/samples/` and `js/seed-data.js`.
- **Health check:** open *Δοκιμές* → **Run All Tests**.
- Libraries are vendored in `assets/vendor` (Chart.js 4.4.1, SheetJS 0.18.5, jsPDF 2.5.1) – no CDN needed.

## Troubleshooting
- **GitHub Pages shows 404 / README:** check *Settings → Pages* (branch `main`, folder `/root`) and that `index.html` is in the repo root; wait a couple of minutes.
- **MIME type errors (“Expected a JavaScript module”):** Pages serves `.js` correctly; this appears when opening via `file://` or a server that sends `text/plain` for `.js`/`.json`/`.webmanifest`. Use `python3 -m http.server` locally.
- **Service Worker not registering / old version shown:** needs https or localhost; in DevTools → Application → Service Workers use *Unregister* + *Clear site data*, or hard reload. After a release bump `VERSION` (cache name changes).
- **LocalStorage migration issues:** schema version is in `t96.meta`. If data looks wrong, download a backup (Ρυθμίσεις), then restore it; a corrupt key is copied to `t96.<key>.corrupt` and the IndexedDB snapshot is used for recovery. Private/incognito windows and blocked storage fall back to memory only (a red “Σφάλμα αποθήκευσης” chip appears).
- **Excel import issues:** use the first sheet with a header row (the wizard detects it; adjust “Γραμμή επικεφαλίδων”). CSV should be UTF-8 (Windows-1253 is auto-detected). Dates typed as text must be `dd/mm/yyyy`. Unrecognised columns can be mapped manually in step 2.
- **Greek text garbled in CSV:** open via *Data → From Text* choosing UTF-8, or use the Excel export.
- **PDF without Greek letters:** the font `assets/fonts/DejaVuSans-subset.ttf` failed to load (offline before first cache) – reload online once.
- **Browser compatibility:** Chrome/Edge 100+, Firefox 115+, Safari 16.4+ (module workers, `<dialog>`, `color-mix`). Older browsers fall back to the local search engine where Web Workers are unavailable.

## Version History
See [CHANGELOG.md](CHANGELOG.md). Current: **1.0.0**.

## License
MIT – see [LICENSE](LICENSE). Bundled third-party libraries keep their own licenses (`assets/vendor/LICENSE-*.txt`).
