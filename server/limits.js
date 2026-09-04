// House limits: standing guardrails the owner sets once and the house keeps
// on its own. A ticket that would break one is refused before anything is
// reserved, in plain words, with nothing spent. Limits are the owner's, so
// they live in the workspace file and travel in the export.
import { store } from './store.js';
import { ws, flushWs } from './workspace.js';

const DAY = 86400000;
const FIELDS = ['ticketCeiling', 'monthlySpend', 'dailyRuns'];
const settled = (m) => (m.settlement?.settled ?? m.spent) || 0;

export function limits() {
  const w = ws();
  if (!w.limits) w.limits = { ticketCeiling: null, monthlySpend: null, dailyRuns: null };
  return w.limits;
}
export function setLimits(patch) {
  const l = limits();
  for (const f of FIELDS) {
    if (!(f in patch)) continue;
    const v = patch[f];
    if (v === null || v === '' || v === undefined) { l[f] = null; continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { error: `${f} must be a number of ${f === 'dailyRuns' ? 'runs' : 'credits'}, or empty for no limit.` };
    l[f] = Math.round(n);
  }
  flushWs();
  return { limits: l };
}

// What the limits are measured against, now.
export function usage(now = Date.now()) {
  const ms = store.missions();
  return {
    monthSpend: Math.round(ms.filter((m) => (m.filledAt || m.createdAt || 0) >= now - 30 * DAY).reduce((a, m) => a + settled(m), 0) * 10) / 10,
    runsToday: ms.filter((m) => (m.launchedAt || 0) >= now - DAY).length,
  };
}

// The one place a launch is judged. Returns null when the ticket may run.
export function refusal(mission, now = Date.now()) {
  const l = limits();
  const u = usage(now);
  const ceiling = mission.contract?.ceiling || 0;
  if (l.ticketCeiling !== null && ceiling > l.ticketCeiling) {
    return `House limit: no single ticket may reserve more than ${l.ticketCeiling} credits, and this one's ceiling is ${ceiling}. Nothing was spent. Lower the plan, or raise the limit under Settings.`;
  }
  if (l.monthlySpend !== null && u.monthSpend + ceiling > l.monthlySpend) {
    return `House limit: ${l.monthlySpend} credits in any 30 days. The last 30 days already settled ${u.monthSpend}, and this ticket reserves ${ceiling}. Nothing was spent. Wait, or raise the limit under Settings.`;
  }
  if (l.dailyRuns !== null && u.runsToday >= l.dailyRuns) {
    return `House limit: ${l.dailyRuns} run${l.dailyRuns === 1 ? '' : 's'} in any 24 hours, and ${u.runsToday} ${u.runsToday === 1 ? 'has' : 'have'} started. Nothing was spent. Wait, or raise the limit under Settings.`;
  }
  return null;
}

// For the house check: a row that names what is set and where it stands.
export function limitHealth(now = Date.now()) {
  const l = limits(); const u = usage(now);
  const set = FIELDS.filter((f) => l[f] !== null);
  if (!set.length) return { ok: true, detail: 'none set; every ticket is judged on its own ceiling alone' };
  const parts = [];
  if (l.ticketCeiling !== null) parts.push(`ticket ceiling ${l.ticketCeiling} cr`);
  if (l.monthlySpend !== null) parts.push(`${u.monthSpend} of ${l.monthlySpend} cr settled in 30 days`);
  if (l.dailyRuns !== null) parts.push(`${u.runsToday} of ${l.dailyRuns} runs today`);
  const overspent = l.monthlySpend !== null && u.monthSpend > l.monthlySpend;
  return { ok: !overspent, detail: overspent ? `${parts.join('; ')} — the 30-day cap is already exceeded; new tickets are refused until it falls` : parts.join('; ') };
}
