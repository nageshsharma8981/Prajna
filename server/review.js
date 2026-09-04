// The weekly review: not what happened yesterday, but how the house is doing.
// Every figure is counted from the record and set beside the same figure for
// the period before it, so a number that moved says so. Nothing is modelled,
// and a period with too little in it says that rather than reporting noise.
import { store } from './store.js';
import { ws } from './workspace.js';

const DAY = 86400000;
const settled = (m) => (m.settlement?.settled ?? m.spent) || 0;
const median = (xs) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); const i = Math.floor(a.length / 2); return Math.round((a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2) * 10) / 10; };
const pct = (n, of) => (of ? Math.round((n / of) * 100) : null);

function windowStats(from, to) {
  const ms = store.missions().filter((m) => { const at = m.filledAt || m.launchedAt || m.createdAt || 0; return at >= from && at < to; });
  const delivered = ms.filter((m) => m.status === 'FILLED');
  const stopped = ms.filter((m) => m.status === 'KILLED');
  const gated = delivered.filter((m) => (m.validations || []).length);
  const firstTime = gated.filter((m) => m.validations.length === 1 && m.validations[0].gate?.cleared).length;
  const costs = delivered.map(settled);
  const byDesk = {};
  for (const m of delivered) byDesk[m.deskName] = (byDesk[m.deskName] || 0) + 1;
  return {
    started: ms.length,
    delivered: delivered.length,
    stopped: stopped.length,
    settled: Math.round(costs.reduce((a, b) => a + b, 0) * 10) / 10,
    median: median(costs),
    gated: gated.length,
    firstTime,
    firstTimeRate: pct(firstTime, gated.length),
    patched: delivered.filter((m) => (m.patches || []).length).length,
    risks: delivered.reduce((a, m) => a + (m.acceptedRisks || []).length, 0),
    dissent: delivered.filter((m) => m.dissent?.model).length,
    live: delivered.filter((m) => m.authored?.live).length,
    composed: delivered.filter((m) => m.authored?.composed).length,
    ceilingHit: ms.filter((m) => (m.attention || []).some((a) => a.kind === 'ceiling')).length,
    desks: Object.entries(byDesk).sort((a, b) => b[1] - a[1]),
  };
}

// A comparison is only worth making against a week that had something in it.
let comparable = true;
const move = (now, before, unit = '') => {
  if (!comparable || before == null || now == null) return '';
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return `, the same as the week before`;
  return `, ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}${unit} on the week before`;
};

export function weeklyReview({ weeks = 1, at = Date.now() } = {}) {
  const span = weeks * 7 * DAY;
  const now = windowStats(at - span, at);
  const before = windowStats(at - 2 * span, at - span);
  const w = ws();
  const orders = (w.standingOrders || []).flatMap((o) => (o.runs || []).filter((r) => r.at >= at - span).map((r) => ({ ...r, order: o.serial })));
  const entered = (w.consentLog || []).filter((e) => e.acceptedAt >= at - span);
  const evidence = w.lastEvidenceSweep && w.lastEvidenceSweep.at >= at - span ? w.lastEvidenceSweep : null;
  comparable = before.started > 0;
  const lines = [];
  lines.push(`Prajñā weekly review: ${new Date(at - span).toISOString().slice(0, 10)} to ${new Date(at).toISOString().slice(0, 10)}`);
  lines.push('');
  if (!now.started) lines.push('Nothing ran this week.');
  else {
    lines.push(`${now.delivered} delivered${move(now.delivered, before.delivered)}, ${now.stopped} stopped, ${now.settled} credits settled${move(now.settled, before.settled, ' cr')}.`);
    if (now.delivered) lines.push(`The middle delivery cost ${now.median} credits${move(now.median, before.median, ' cr')}.`);
    if (now.gated) lines.push(`${now.firstTime} of ${now.gated} cleared the gate first time, ${now.firstTimeRate}%${before.firstTimeRate == null ? '' : `${move(now.firstTimeRate, before.firstTimeRate, ' points')}`}. ${now.patched} needed a patch, ${now.risks} risk${now.risks === 1 ? '' : 's'} accepted on the record.`);
    if (now.ceilingHit) lines.push(`${now.ceilingHit} run${now.ceilingHit === 1 ? '' : 's'} hit the ceiling and had to be decided${move(now.ceilingHit, before.ceilingHit)}.`);
    lines.push(`${now.live} were written by a live model on your own key, ${now.composed} composed from sources, ${now.delivered - now.live - now.composed} house-scripted. Dissent was carried in ${now.dissent}.`);
    if (now.desks.length) lines.push(`Busiest desk: ${now.desks[0][0]} with ${now.desks[0][1]}.`);
  }
  if (orders.length) { const ran = orders.filter((r) => !r.skipped); lines.push(`Standing orders: ${ran.length} ran, ${orders.length - ran.length} skipped${orders.length - ran.length ? ` (${orders.filter((r) => r.skipped).map((r) => `${r.order}: ${r.skipped}`).join('; ')})` : ''}.`); }
  if (evidence) lines.push(evidence.dead ? `Evidence: ${evidence.dead} of ${evidence.checked} cited address(es) no longer resolve.` : `Evidence: all ${evidence.checked} cited address(es) still resolve.`);
  if (entered.length) lines.push(`${entered.length} acceptance${entered.length === 1 ? '' : 's'} of the house rules: ${entered.map((e) => e.name || 'someone unnamed').join(', ')}.`);
  lines.push('');
  lines.push(comparable ? 'Every figure is counted from the mission ledger, and set beside the week before it.' : 'Every figure is counted from the mission ledger. The week before this one was empty, so there is nothing yet to compare against.');
  return { at, weeks, now, before, text: lines.join('\n') };
}
