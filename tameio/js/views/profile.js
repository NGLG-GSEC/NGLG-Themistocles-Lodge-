/** Complete member profile page. */
import { DEGREES, CATEGORIES, STATUSES, YEARS, PAYMENT_METHODS } from '../config.js';
import { esc, fmtDate, fmtMoney, fmtPct, fullName, initials, age, monthsBetween, round2, sum } from '../utils.js';
import { icon, badge, sectionHead, dataTable, confirmDialog, toast, kpiCard } from '../ui.js';
import { memberDialog, paymentDialog } from './forms.js';
import { statusTone } from './members.js';
import { memberTotals, memberYear, allYears } from '../treasury.js';
import { barConfig } from '../charts.js';
import { chartCard, ChartHost } from './shared.js';
import { exportAs } from '../exporter.js';

const dl = (pairs) => `<dl class="dl">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v === '' || v === null || v === undefined ? '<span class="dim">—</span>' : v}</dd></div>`).join('')}</dl>`;

function timeline(m, ledger) {
  const ev = [];
  const add = (date, text, type) => { if (date) ev.push({ date, text, type }); };
  add(m.initiationDate, 'Εισδοχή (Μαθητής)', 'degree'); add(m.passingDate, 'Διέλευση (Εταίρος)', 'degree'); add(m.raisingDate, 'Έγερση (Διδάσκαλος)', 'degree');
  add(m.adoptionDate, 'Υιοθεσία', 'degree'); add(m.reinstatementDate, 'Επαναφορά', 'status');
  for (const o of m.offices || []) { add(o.from, `Ανάληψη αξιώματος: ${o.office}`, 'office'); add(o.to, `Λήξη αξιώματος: ${o.office}`, 'office'); }
  for (const h of m.history || []) add(h.date, h.text, h.type);
  for (const p of ledger.filter((x) => x.memberId === m.id)) add(p.date, `${p.amount < 0 ? 'Διόρθωση' : 'Πληρωμή'} ${fmtMoney(p.amount)} για ${p.year}`, 'payment');
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}

export default {
  id: 'member', title: 'Προφίλ Μέλους',
  async render(root, app, params) {
    const { store } = app; const m = store.getMember(params.id);
    if (!m) { root.innerHTML = `<div class="empty">${icon('alert', { size: 36 })}<p>Το μέλος δεν βρέθηκε.</p><a class="btn" href="#/members">Επιστροφή στο μητρώο</a></div>`; return undefined; }
    const ctx = app.ctx(); const tot = memberTotals(ctx, m, YEARS); const canW = app.can('members.write'); const canT = app.can('treasury.write');
    const pays = store.ledger.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date));
    const steps = [['Εισδοχή', 'ΜΑΘΗΤΗΣ', m.initiationDate], ['Διέλευση', 'ΕΤΑΙΡΟΣ', m.passingDate], ['Έγερση', 'ΔΙΔΑΣΚΑΛΟΣ', m.raisingDate]];
    const rank = DEGREES[m.degree]?.order || 0;
    const gap = (a, b) => { const x = monthsBetween(a, b); return x === null ? '' : `${Math.round(x)} μήνες`; };

    root.innerHTML = `
      <nav aria-label="Διαδρομή" class="crumbs"><a href="#/members">Μητρώο</a> <span aria-hidden="true">›</span> <span>${esc(fullName(m))}</span></nav>
      <section class="card profile-head">
        <div class="avatar" aria-hidden="true">${esc(initials(m))}</div>
        <div class="grow"><h2>${esc(fullName(m))}</h2>
          <p class="sub">Αρ. Μητρώου <span class="mono">${esc(m.registryNumber)}</span>${m.fatherName ? ` · του ${esc(m.fatherName)}` : ''}${m.birthYear ? ` · γεν. ${m.birthYear} (${age(m)} ετών)` : ''}</p>
          <p>${badge(STATUSES[m.status], statusTone[m.status])} ${badge(DEGREES[m.degree]?.label || 'Χωρίς βαθμό', 'gold')} ${badge(CATEGORIES[m.category] || m.category)} ${m.office ? badge(m.office, 'info') : ''}</p></div>
        <div class="actions">${canW ? `<button class="btn" id="p-edit">${icon('edit', { size: 16 })} Επεξεργασία</button>` : ''}${canT ? `<button class="btn primary" id="p-pay">${icon('coins', { size: 16 })} Νέα πληρωμή</button>` : ''}${app.can('export') ? `<button class="btn" id="p-pdf">${icon('download', { size: 16 })} PDF</button><button class="btn" id="p-print">${icon('print', { size: 16 })} Εκτύπωση</button>` : ''}</div>
      </section>
      <div class="kpi-grid compact">
        ${kpiCard({ label: 'Συνολικές εισφορές (διαχρονικά)', value: fmtMoney(tot.lifetime), ic: 'coins', tone: 'gold' })}
        ${kpiCard({ label: `Καταβλήθηκαν ${YEARS[0]}–${YEARS.at(-1)}`, value: fmtMoney(tot.paid), sub: `από ${fmtMoney(tot.expected)}`, ic: 'coins' })}
        ${kpiCard({ label: 'Εκκρεμής οφειλή', value: fmtMoney(tot.debt), ic: 'alert', tone: tot.debt ? 'bad' : 'good' })}
        ${kpiCard({ label: 'Μέση ετήσια εισφορά', value: fmtMoney(tot.average), ic: 'chart' })}
      </div>
      <div class="grid g2">
        <section class="card" aria-labelledby="h-reg"><h3 id="h-reg">Στοιχεία μητρώου</h3>${dl([['Επώνυμο', esc(m.lastName)], ['Όνομα', esc(m.firstName)], ['Όνομα Πατρός', esc(m.fatherName)], ['Έτος γεννήσεως', m.birthYear || ''], ['Κατηγορία', esc(CATEGORIES[m.category] || m.category)], ['Βαθμός', esc(DEGREES[m.degree]?.label || '')], ['Παρόν αξίωμα', esc(m.office)], ['Ημ. εγκατάστασης αξιώματος', fmtDate(m.officeInstallDate)], ['Αξίωμα στη Μ. Στοά', esc(m.grandOffice)], ['Στοά', `${esc(m.lodgeName)} υπ’ αρ. ${esc(m.lodgeNumber)}`], ['Επαρχία', esc(m.province)], ['Απαλλαγή εισφορών', m.exempt ? 'Ναι' : 'Όχι']])}</section>
        <section class="card" aria-labelledby="h-con"><h3 id="h-con">Στοιχεία επικοινωνίας</h3>${dl([['Κινητό', m.mobilePhone ? `<a href="tel:${esc(m.mobilePhone.replace(/\s/g, ''))}">${esc(m.mobilePhone)}</a>` : ''], ['Email', m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''], ['Τόπος κατοικίας', esc(m.residence)], ['Lodge mail', esc(m.lodgeEmail)]])}
          <h3 id="h-prog">Πορεία βαθμών</h3>
          <ol class="stepper" aria-labelledby="h-prog">${steps.map(([l, d, date], i) => `<li class="${rank > i ? 'done' : rank === i && date ? 'done' : ''}" ${rank === i + 1 ? 'aria-current="step"' : ''}><span class="dot">${rank > i || date ? icon('check', { size: 14 }) : i + 1}</span><div><strong>${l}</strong><div>${date ? fmtDate(date) : '<span class="dim">χωρίς ημερομηνία</span>'}</div>${i > 0 && date && steps[i - 1][2] ? `<small class="dim">${gap(steps[i - 1][2], date)} από ${steps[i - 1][0].toLowerCase()}</small>` : ''}</div></li>`).join('')}</ol></section>
      </div>
      <div class="grid g2">
        <section class="card" aria-labelledby="h-off"><h3 id="h-off">Αξιώματα που διατέλεσε</h3>${dataTable({ caption: 'Αξιώματα', cls: 'compact', columns: [{ key: 'office', label: 'Αξίωμα' }, { key: 'from', label: 'Από', type: 'date' }, { key: 'to', label: 'Έως', type: 'date' }], rows: [...(m.offices || [])].reverse(), empty: 'Δεν έχουν καταγραφεί αξιώματα.', render: { to: (v) => v ? fmtDate(v) : badge('σε εξέλιξη', 'good') } })}</section>
        ${chartCard('c-member-pay', 'Αναλυτικά εισφορών', { sub: 'Αναμενόμενα έναντι πληρωθέντων ανά έτος', h: 220 })}
      </div>
      <section class="card" aria-labelledby="h-pay"><header class="card-head"><h3 id="h-pay">Ιστορικό πληρωμών</h3></header>
        ${dataTable({ caption: 'Ιστορικό πληρωμών', columns: [{ key: 'date', label: 'Ημερομηνία', type: 'date' }, { key: 'year', label: 'Έτος εισφοράς' }, { key: 'amount', label: 'Ποσό', type: 'money' }, { key: 'method', label: 'Τρόπος' }, { key: 'receipt', label: 'Απόδειξη' }, { key: 'note', label: 'Σημείωση' }, ...(canT ? [{ key: 'id', label: '' }] : [])], rows: pays, empty: 'Δεν υπάρχουν πληρωμές.', render: { method: (v) => esc(PAYMENT_METHODS[v] || v), id: (v) => `<button class="icon-btn danger" data-delpay="${v}" aria-label="Διαγραφή πληρωμής">${icon('trash', { size: 16 })}</button>` } })}
        <h4>Ανά έτος</h4>${dataTable({ caption: 'Εισφορές ανά έτος', cls: 'compact', columns: [{ key: 'year', label: 'Έτος' }, { key: 'expected', label: 'Εισφορά', type: 'money' }, { key: 'paid', label: 'Πληρωμένα', type: 'money' }, { key: 'balance', label: 'Υπόλοιπο', type: 'money' }, { key: 'state', label: 'Κατάσταση' }], rows: tot.perYear, render: { state: (v) => badge({ paid: 'Εξοφλημένο', partial: 'Μερικώς', unpaid: 'Απλήρωτο', overpaid: 'Υπερπληρωμή', 'n/a': '—' }[v], { paid: 'good', partial: 'warn', unpaid: 'bad', overpaid: 'info', 'n/a': 'neutral' }[v]) } })}</section>
      <div class="grid g2">
        <section class="card" aria-labelledby="h-notes"><h3 id="h-notes">Σημειώσεις</h3><label class="sr-only" for="p-notes">Σημειώσεις μέλους</label><textarea id="p-notes" rows="5" ${canW ? '' : 'readonly'}>${esc(m.notes)}</textarea>${canW ? '<div class="actions"><button class="btn sm primary" id="p-save-notes">Αποθήκευση σημειώσεων</button></div>' : ''}</section>
        <section class="card" aria-labelledby="h-tl"><h3 id="h-tl">Χρονολόγιο</h3><ol class="timeline">${timeline(m, store.ledger).slice(0, 40).map((e) => `<li class="t-${e.type}"><time datetime="${esc(e.date)}">${fmtDate(e.date)}</time><span>${esc(e.text)}</span></li>`).join('') || '<li class="dim">Κανένα γεγονός.</li>'}</ol></section>
      </div>`;

    const host = new ChartHost(app, root);
    await host.mount('c-member-pay', barConfig(tot.perYear.map((r) => r.year), [{ label: 'Εισφορά', data: tot.perYear.map((r) => r.expected) }, { label: 'Πληρωμένα', data: tot.perYear.map((r) => r.paid) }], { money: true }));

    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#p-edit')) await memberDialog(app, m);
      else if (t.closest('#p-pay')) await paymentDialog(app, m.id);
      else if (t.closest('#p-save-notes')) { store.updateMember(m.id, { notes: root.querySelector('#p-notes').value }); toast('Οι σημειώσεις αποθηκεύτηκαν.', 'success'); }
      else if (t.closest('[data-delpay]')) { if (await confirmDialog('Διαγραφή της πληρωμής;', { danger: true, ok: 'Διαγραφή' })) store.removePayment(t.closest('[data-delpay]').dataset.delpay); }
      else if (t.closest('#p-pdf, #p-print')) {
        const table = { title: `Καρτέλα Μέλους: ${fullName(m)}`, subtitle: `Αρ. Μητρώου ${m.registryNumber}`, columns: [{ key: 'k', label: 'Στοιχείο' }, { key: 'v', label: 'Τιμή' }],
          rows: [['Επώνυμο', m.lastName], ['Όνομα', m.firstName], ['Όνομα Πατρός', m.fatherName], ['Έτος γεννήσεως', m.birthYear], ['Κατηγορία', CATEGORIES[m.category]], ['Βαθμός', DEGREES[m.degree]?.label], ['Αξίωμα', m.office], ['Κινητό', m.mobilePhone], ['Email', m.email], ['Κατοικία', m.residence], ['Εισδοχή', fmtDate(m.initiationDate)], ['Διέλευση', fmtDate(m.passingDate)], ['Έγερση', fmtDate(m.raisingDate)], ...tot.perYear.map((r) => [`Εισφορά ${r.year}`, `${fmtMoney(r.paid)} / ${fmtMoney(r.expected)}`]), ['Εκκρεμής οφειλή', fmtMoney(tot.debt)], ['Παρατηρήσεις', m.notes]].map(([k, v]) => ({ k, v: v ?? '' })),
          summary: [['Διαχρονικές εισφορές', fmtMoney(tot.lifetime)], ['Οφειλή', fmtMoney(tot.debt)]] };
        try { await exportAs(t.closest('#p-print') ? 'print' : 'pdf', table, `kartela-${m.registryNumber}`, { pdf: { orientation: 'portrait' } }); } catch (err) { toast(err.message, 'error'); }
      }
    });
    const off = store.subscribe((type, payload) => { if (/member:upsert|ledger|reset|bulk/.test(type)) app.refresh(); });
    return () => off();
  },
};
