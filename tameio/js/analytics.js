/**
 * Business-intelligence calculations for membership and treasury analytics.
 * Pure functions – the UI layer only renders what is returned here.
 * @module analytics
 */
import { DEGREES, NO_OFFICE, CATEGORIES, YEARS } from './config.js';
import { sum, avg, linreg, stddev, yearOf, monthsBetween, round2, groupBy, fullName, normText } from './utils.js';
import { memberDebt, yearSummary, allYears, forecast, memberYear, growth, trendOf, compliance, makeCtx, monthlyRevenue } from './treasury.js';

/** Filter members by year of initiation (≤), degree, province, office, status and category. */
export function filterMembers(members, f = {}) {
  return members.filter((m) => {
    if (f.status ? m.status !== f.status : m.status === 'deleted') return false;
    if (f.degree && m.degree !== f.degree) return false;
    if (f.province && m.province !== f.province) return false;
    if (f.category && m.category !== f.category) return false;
    if (f.office && (f.office === NO_OFFICE ? !!m.office && m.office !== NO_OFFICE : m.office !== f.office)) return false;
    if (f.year) { const y = yearOf(m.initiationDate); if (y && y > f.year) return false; }
    return true;
  });
}

export const isOfficer = (m) => !!m.office && m.office !== NO_OFFICE && !/άνευ/i.test(m.office);

export function counts(members) {
  const by = (fn) => members.filter(fn).length;
  return {
    total: by((m) => m.status !== 'deleted'), active: by((m) => m.status === 'active'), former: by((m) => m.status === 'former'),
    archived: by((m) => m.status === 'archived'), deleted: by((m) => m.status === 'deleted'),
    initiated: by((m) => m.status === 'active' && m.degree === 'ΜΑΘΗΤΗΣ'),
    passed: by((m) => m.status === 'active' && m.degree === 'ΕΤΑΙΡΟΣ'),
    raised: by((m) => m.status === 'active' && m.degree === 'ΔΙΔΑΣΚΑΛΟΣ'),
  };
}

export function membershipGrowth(members, asOf) {
  const dated = members.map((m) => yearOf(m.initiationDate)).filter(Boolean);
  const start = Math.min(...dated, asOf - 5); const years = []; for (let y = start; y <= asOf; y++) years.push(y);
  const undated = members.filter((m) => !yearOf(m.initiationDate)).length;
  let cum = undated;
  const rows = years.map((y) => {
    const joined = members.filter((m) => yearOf(m.initiationDate) === y).length;
    const left = members.filter((m) => m.status !== 'active' && yearOf(m.statusChangedAt) === y).length;
    cum += joined - left;
    return { year: y, joined, left, total: cum };
  });
  return { years, rows, undated };
}

export function ageDistribution(members, asOf) {
  const bins = [['<30', 0, 29], ['30–39', 30, 39], ['40–49', 40, 49], ['50–59', 50, 59], ['60–69', 60, 69], ['70+', 70, 200]];
  const ages = members.filter((m) => m.birthYear).map((m) => asOf - m.birthYear);
  const sorted = [...ages].sort((a, b) => a - b);
  return {
    labels: [...bins.map((b) => b[0]), 'Άγνωστη'],
    values: [...bins.map(([, lo, hi]) => ages.filter((a) => a >= lo && a <= hi).length), members.length - ages.length],
    average: ages.length ? avg(ages) : 0, median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0, known: ages.length,
  };
}

export function degreeDistribution(members) {
  const keys = [...Object.keys(DEGREES), ''];
  return { labels: keys.map((k) => DEGREES[k]?.label || 'Δ/Κ'), values: keys.map((k) => members.filter((m) => (m.degree || '') === k).length), keys };
}

export function distributionBy(members, field, top = 10) {
  const g = groupBy(members, (m) => m[field] || 'Δ/Κ');
  const rows = [...g].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]);
  const head = rows.slice(0, top); const rest = sum(rows.slice(top), (r) => r[1]);
  if (rest) head.push(['Λοιπά', rest]);
  return { labels: head.map((r) => r[0]), values: head.map((r) => r[1]) };
}

export function officerParticipation(members) {
  const officers = members.filter(isOfficer);
  const g = groupBy(officers, (m) => m.office);
  const held = sum(members, (m) => (m.offices || []).length);
  return {
    officers: officers.length, rate: members.length ? (officers.length / members.length) * 100 : 0,
    everHeld: members.filter((m) => (m.offices || []).length).length, held,
    labels: [...g.keys()], values: [...g.values()].map((v) => v.length),
    byDegree: Object.keys(DEGREES).map((k) => ({ degree: DEGREES[k].label, officers: officers.filter((m) => m.degree === k).length, total: members.filter((m) => m.degree === k).length })),
  };
}

export function retention(members, asOf) {
  const cohorts = groupBy(members.filter((m) => yearOf(m.initiationDate)), (m) => yearOf(m.initiationDate));
  const rows = [...cohorts].sort((a, b) => a[0] - b[0]).map(([y, list]) => {
    const kept = list.filter((m) => m.status === 'active').length;
    return { year: y, joined: list.length, active: kept, retention: (kept / list.length) * 100 };
  });
  const churn = [];
  for (let y = asOf - 5; y <= asOf; y++) {
    const start = members.filter((m) => (yearOf(m.initiationDate) || 0) < y && (m.status === 'active' || (yearOf(m.statusChangedAt) || 9999) >= y)).length;
    const left = members.filter((m) => m.status !== 'active' && yearOf(m.statusChangedAt) === y).length;
    churn.push({ year: y, start, left, rate: start ? (left / start) * 100 : 0 });
  }
  const total = members.length;
  return { rows, churn, overall: total ? (members.filter((m) => m.status === 'active').length / total) * 100 : 0 };
}

export function progression(members) {
  const rows = members.filter((m) => m.initiationDate).map((m) => ({
    id: m.id, name: fullName(m), registry: m.registryNumber, initiation: m.initiationDate, passing: m.passingDate, raising: m.raisingDate,
    toPass: monthsBetween(m.initiationDate, m.passingDate), toRaise: monthsBetween(m.passingDate, m.raisingDate), total: monthsBetween(m.initiationDate, m.raisingDate),
  }));
  const num = (k) => rows.map((r) => r[k]).filter((v) => v !== null && v >= 0);
  const bins = [['0–6', 0, 6], ['6–9', 6, 9], ['9–12', 9, 12], ['12–18', 12, 18], ['18–24', 18, 24], ['24+', 24, 1e9]];
  const hist = (arr) => bins.map(([, lo, hi]) => arr.filter((v) => v >= lo && v < hi).length);
  const a = num('toPass'); const b = num('toRaise'); const c = num('total');
  return { rows, labels: bins.map((x) => x[0]), histPass: hist(a), histRaise: hist(b), avgPass: a.length ? avg(a) : 0, avgRaise: b.length ? avg(b) : 0, avgTotal: c.length ? avg(c) : 0,
    stages: { initiated: rows.length, passed: rows.filter((r) => r.passing).length, raised: rows.filter((r) => r.raising).length } };
}

export function revenueByCategory(ctx, years = allYears(ctx)) {
  const cats = Object.keys(CATEGORIES);
  const byId = new Map(ctx.members.map((m) => [m.id, m]));
  const series = cats.map((c) => ({ category: c, values: years.map((y) => round2(sum(ctx.ledger.filter((p) => p.year === y && byId.get(p.memberId)?.category === c), (p) => p.amount))) }));
  return { years, series: series.filter((s) => s.values.some((v) => v)) };
}

export function debtAnalysis(ctx) {
  const rows = ctx.members.map((m) => ({ m, debt: memberDebt(ctx, m) })).filter((r) => r.debt > 0).sort((a, b) => b.debt - a.debt);
  const buckets = [['0–100€', 0, 100], ['100–200€', 100, 200], ['200–400€', 200, 400], ['400€+', 400, 1e9]];
  const byYear = YEARS.filter((y) => y <= ctx.asOf && y >= (ctx.settings.debtFromYear || YEARS[0])).map((y) => ({ year: y, debt: yearSummary(ctx, y).outstanding }));
  return { rows, total: round2(sum(rows, (r) => r.debt)), count: rows.length, byYear, bucketLabels: buckets.map((b) => b[0]), bucketValues: buckets.map(([, lo, hi]) => rows.filter((r) => r.debt >= lo && r.debt < hi).length) };
}

/** Executive KPI set. */
export function executive(members, ledger, settings, f = {}) {
  const asOf = settings.asOfYear || new Date().getFullYear();
  const scope = filterMembers(members, f); const ids = new Set(scope.map((m) => m.id));
  const ctx = makeCtx(scope, ledger.filter((p) => ids.has(p.memberId)), settings, asOf);
  const year = f.year || asOf; const sum0 = yearSummary(ctx, year);
  const prev = yearSummary(ctx, year - 1); const fc = forecast(ctx, 4);
  const c = counts(scope); const debt = debtAnalysis(ctx);
  return {
    ctx, scope, counts: c, year, summary: sum0, previous: prev, revenueGrowth: prev.paid ? ((sum0.paid - prev.paid) / prev.paid) * 100 : null,
    lifetime: round2(sum(ledger.filter((p) => ids.has(p.memberId)), (p) => p.amount)), debt: debt.total, debtCount: debt.count, forecast: fc,
    officerRate: officerParticipation(scope.filter((m) => m.status === 'active')).rate, age: ageDistribution(scope, asOf).average,
  };
}

/** Detect data and financial anomalies. */
export function anomalies(members, ledger, settings) {
  const out = []; const asOf = settings.asOfYear || new Date().getFullYear();
  const ctx = makeCtx(members, ledger, settings, asOf);
  const noContact = [];
  const regs = groupBy(members.filter((m) => m.registryNumber), (m) => String(m.registryNumber));
  for (const [r, l] of regs) if (l.length > 1) out.push({ severity: 'high', type: 'Διπλότυπο', text: `Ο αριθμός μητρώου ${r} εμφανίζεται ${l.length} φορές`, memberId: l[0].id });
  for (const m of members) {
    const n = fullName(m);
    const seq = [m.initiationDate, m.passingDate, m.raisingDate].filter(Boolean);
    if (seq.some((d, i) => i && d < seq[i - 1])) out.push({ severity: 'high', type: 'Χρονολογία', text: `${n}: οι ημερομηνίες εισδοχής/διελεύσεως/εγέρσεως δεν είναι χρονολογικές`, memberId: m.id });
    if (m.raisingDate && m.degree && m.degree !== 'ΔΙΔΑΣΚΑΛΟΣ') out.push({ severity: 'medium', type: 'Βαθμός', text: `${n}: υπάρχει ημερομηνία εγέρσεως αλλά ο βαθμός είναι ${m.degree}`, memberId: m.id });
    if (m.birthYear && (m.birthYear < 1920 || asOf - m.birthYear < 18)) out.push({ severity: 'medium', type: 'Ηλικία', text: `${n}: ύποπτο έτος γεννήσεως (${m.birthYear})`, memberId: m.id });
    if (m.status === 'active' && !m.email && !m.mobilePhone) noContact.push(m);
    for (let y = settings.debtFromYear || YEARS[0]; y <= asOf; y++) {
      const r = memberYear(ctx, m, y);
      if (r.state === 'overpaid' && r.paid > r.expected * 1.5 && r.expected > 0) out.push({ severity: 'medium', type: 'Υπερπληρωμή', text: `${n}: καταβλήθηκαν ${r.paid}€ για ${y} (οφειλή ${r.expected}€)`, memberId: m.id });
      if (r.expected > 0 && r.paid === 0 && y < asOf) out.push({ severity: 'high', type: 'Απλήρωτο έτος', text: `${n}: καμία πληρωμή για το ${y}`, memberId: m.id });
    }
  }
  if (noContact.length > 3) out.push({ severity: 'low', type: 'Επικοινωνία', text: `${noContact.length} ενεργά μέλη χωρίς email ή κινητό`, memberId: null });
  else noContact.forEach((m) => out.push({ severity: 'low', type: 'Επικοινωνία', text: `${fullName(m)}: δεν υπάρχει email ή κινητό`, memberId: m.id }));
  const amts = ledger.map((p) => p.amount); const mu = avg(amts); const sd = stddev(amts);
  for (const p of ledger) {
    if (sd && Math.abs(p.amount - mu) / sd > 3) out.push({ severity: 'medium', type: 'Ασυνήθης πληρωμή', text: `Πληρωμή ${p.amount}€ (${p.receipt || p.id}) αποκλίνει >3σ από τον μέσο όρο ${round2(mu)}€`, memberId: p.memberId });
    if (p.amount < 0) out.push({ severity: 'low', type: 'Διόρθωση', text: `Αρνητική κίνηση ${p.amount}€ (${p.note || 'χωρίς σημείωση'})`, memberId: p.memberId });
  }
  const mr = monthlyRevenue(ctx, asOf).filter((v) => v > 0);
  if (mr.length > 3) { const m2 = avg(mr); const s2 = stddev(mr); mr.forEach((v, i) => { if (s2 && (v - m2) / s2 > 2) out.push({ severity: 'low', type: 'Κορυφή εσόδων', text: `Μηνιαία έσοδα ${round2(v)}€ υψηλότερα κατά >2σ από το μέσο όρο`, memberId: null }); }); }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Human readable trend statements for a numeric series. */
export function describeTrend(label, series, unit = '') {
  const t = trendOf(series);
  const word = t.direction === 'up' ? 'ανοδική' : t.direction === 'down' ? 'καθοδική' : 'σταθερή';
  return { ...t, text: `${label}: ${word} τάση (${t.change >= 0 ? '+' : ''}${t.change.toFixed(1)}%${unit})` };
}

export { growth, compliance, linreg, normText };
