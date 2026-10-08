/**
 * Treasury calculations – pure functions over a context built with {@link makeCtx}.
 * All monetary values are rounded to cents.
 * @module treasury
 */
import { YEARS } from './config.js';
import { round2, sum, avg, linreg, stddev, yearOf } from './utils.js';

/**
 * Build a calculation context (pre-indexes the ledger once).
 * @param {object[]} members @param {object[]} ledger @param {object} settings @param {number} [asOf]
 */
export function makeCtx(members, ledger, settings, asOf) {
  const paid = new Map(); const ledgerYears = new Set();
  for (const p of ledger) {
    let byYear = paid.get(p.memberId); if (!byYear) { byYear = new Map(); paid.set(p.memberId, byYear); }
    byYear.set(p.year, round2((byYear.get(p.year) || 0) + p.amount)); ledgerYears.add(p.year);
  }
  return {
    members, ledger, settings, paid, ledgerYears,
    asOf: asOf || settings.asOfYear || new Date().getFullYear(),
    paidOf: (id, y) => paid.get(id)?.get(y) || 0,
  };
}

/** Fee the member owes for a year, honouring overrides, exemption, membership period and status. */
export function expectedFee(m, year, settings) {
  if (m.exempt) return 0;
  if (m.feeOverride && m.feeOverride[year] !== undefined && m.feeOverride[year] !== '') return round2(+m.feeOverride[year]);
  const joined = yearOf(m.initiationDate); if (joined && year < joined) return 0;
  if (m.status !== 'active') {
    const left = yearOf(m.statusChangedAt);
    if (!left || year >= left) return 0;
  }
  return round2(settings.fees?.[m.category]?.[year] ?? 0);
}

export function memberYear(ctx, m, year) {
  const expected = expectedFee(m, year, ctx.settings); const paid = ctx.paidOf(m.id, year);
  const balance = round2(expected - paid);
  let state = 'n/a';
  if (expected > 0) state = paid <= 0 ? 'unpaid' : paid < expected ? 'partial' : paid > expected ? 'overpaid' : 'paid';
  else if (paid > 0) state = 'overpaid';
  return { year, expected, paid, balance, pct: expected ? (paid / expected) * 100 : (paid > 0 ? 100 : 0), state };
}

/** Outstanding debt of a member for the years debtFromYear … asOf. */
export function memberDebt(ctx, m) {
  let d = 0;
  for (let y = ctx.settings.debtFromYear || YEARS[0]; y <= ctx.asOf; y++) d += Math.max(0, memberYear(ctx, m, y).balance);
  return round2(d);
}

export function memberTotals(ctx, m, years = YEARS) {
  const perYear = years.map((y) => memberYear(ctx, m, y));
  const lifetime = round2(sum([...(ctx.paid.get(m.id)?.values() || [])]));
  return {
    perYear, lifetime, paid: round2(sum(perYear, (r) => r.paid)), expected: round2(sum(perYear, (r) => r.expected)),
    debt: memberDebt(ctx, m), average: avg(perYear.filter((r) => r.paid > 0), (r) => r.paid),
  };
}

/** Aggregate figures for one contribution year. */
export function yearSummary(ctx, year, members = ctx.members) {
  let expected = 0; let paid = 0; let outstanding = 0; let credit = 0; let payers = 0; let full = 0; let partial = 0; let unpaid = 0; let owed = 0;
  for (const m of members) {
    const r = memberYear(ctx, m, year);
    expected += r.expected; paid += r.paid;
    if (r.balance > 0) outstanding += r.balance; else credit += -r.balance;
    if (r.paid > 0) payers++;
    if (r.expected > 0) { owed++; if (r.state === 'unpaid') unpaid++; else if (r.state === 'partial') partial++; else full++; }
  }
  expected = round2(expected); paid = round2(paid); outstanding = round2(outstanding);
  return {
    year, expected, paid, outstanding, credit: round2(credit), payers, full, partial, unpaid, owed,
    collectionRate: expected ? Math.min(100, (Math.min(paid, expected) / expected) * 100) : 0,
    debtRatio: expected ? (outstanding / expected) * 100 : 0,
    averageContribution: payers ? round2(paid / payers) : 0,
  };
}

export const allYears = (ctx) => [...new Set([...YEARS, ...ctx.ledgerYears])].sort((a, b) => a - b);

/** Year over year growth of an ordered numeric series → [null, %, %…]. */
export function growth(series) {
  return series.map((v, i) => (i === 0 || !series[i - 1] ? null : ((v - series[i - 1]) / series[i - 1]) * 100));
}

/** Direction + slope of a series for trend indicators. */
export function trendOf(series) {
  const clean = series.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return { direction: 'flat', slope: 0, change: 0 };
  const { slope } = linreg(clean); const first = clean[0]; const last = clean[clean.length - 1];
  const change = first ? ((last - first) / Math.abs(first)) * 100 : 0;
  const rel = Math.abs(slope) / (avg(clean.map(Math.abs)) || 1);
  return { direction: rel < 0.02 ? 'flat' : slope > 0 ? 'up' : 'down', slope, change };
}

/** Revenue (money received) per calendar month for payments dated in `year`. */
export function monthlyRevenue(ctx, year) {
  const out = Array(12).fill(0);
  for (const p of ctx.ledger) if (p.date && +p.date.slice(0, 4) === year) out[+p.date.slice(5, 7) - 1] += p.amount;
  return out.map(round2);
}

/**
 * Revenue forecast for the next `horizon` years after `ctx.asOf`.
 *  - schedule model: expected fees of the current roster (+ projected new members) × historical collection rate
 *  - trend model:    linear regression over yearly revenue
 */
export function forecast(ctx, horizon = 4) {
  const years = allYears(ctx).filter((y) => y <= ctx.asOf);
  const sums = years.map((y) => yearSummary(ctx, y));
  const rates = sums.filter((s) => s.expected > 0 && s.year < ctx.asOf).map((s) => s.collectionRate / 100);
  const ytd = sums.find((s) => s.year === ctx.asOf);
  const rate = Math.min(0.98, rates.length ? avg(rates) : (ytd?.expected ? ytd.collectionRate / 100 : 0.85));
  const spread = rates.length > 1 ? stddev(rates) : 0.05;
  const active = ctx.members.filter((m) => m.status === 'active');
  const inits = {}; for (const m of ctx.members) { const y = yearOf(m.initiationDate); if (y) inits[y] = (inits[y] || 0) + 1; }
  const recent = Object.keys(inits).map(Number).filter((y) => y > ctx.asOf - 4 && y <= ctx.asOf);
  const newPerYear = recent.length ? avg(recent, (y) => inits[y]) : 0;
  const leavers = ctx.members.filter((m) => m.status === 'former' || m.status === 'deleted').length;
  const net = Math.max(0, newPerYear - leavers / Math.max(1, years.length));
  const avgFee = (y) => avg(active, (m) => ctx.settings.fees?.[m.category]?.[y] ?? 0);
  // trend model: completed years + the current year projected at the historical collection rate
  const hist = years.filter((y) => y >= ctx.asOf - 3).map((y) => {
    const s = sums[years.indexOf(y)];
    return y === ctx.asOf ? Math.max(s.paid, s.expected * rate) : s.paid;
  });
  const trend = linreg(hist);
  const rows = [];
  for (let i = 1; i <= horizon; i++) {
    const y = ctx.asOf + i;
    const roster = round2(sum(active, (m) => expectedFee(m, y, ctx.settings)));
    const expected = round2(roster + net * i * avgFee(y));
    const model = round2(expected * rate);
    rows.push({
      year: y, expected, forecast: model, low: round2(expected * Math.max(0, rate - spread)), high: round2(expected * Math.min(1, rate + spread)),
      trend: round2(Math.max(0, trend.predict(hist.length - 1 + i))), prepaid: round2(sum(ctx.members, (m) => ctx.paidOf(m.id, y))),
    });
  }
  return { rate: rate * 100, rows, history: years.map((y, i) => ({ year: y, paid: sums[i].paid })) };
}

/** Payment compliance for a year: on time (by the configured due date), late, partial, unpaid. */
export function compliance(ctx, year) {
  const due = `${year}-${ctx.settings.dueMonthDay || '03-31'}`;
  const out = { onTime: 0, late: 0, partial: 0, unpaid: 0, owed: 0, lateDays: [] };
  for (const m of ctx.members) {
    const r = memberYear(ctx, m, year); if (r.expected <= 0) continue; out.owed++;
    if (r.paid <= 0) { out.unpaid++; continue; }
    if (r.paid < r.expected) { out.partial++; continue; }
    const pays = ctx.ledger.filter((p) => p.memberId === m.id && p.year === year).sort((a, b) => a.date.localeCompare(b.date));
    let acc = 0; let doneOn = pays[pays.length - 1]?.date;
    for (const p of pays) { acc += p.amount; if (acc >= r.expected) { doneOn = p.date; break; } }
    if (doneOn <= due) out.onTime++; else { out.late++; out.lateDays.push((Date.parse(doneOn) - Date.parse(due)) / 86400000); }
  }
  out.onTimeRate = out.owed ? (out.onTime / out.owed) * 100 : 0;
  out.avgLateDays = out.lateDays.length ? avg(out.lateDays) : 0;
  return out;
}
