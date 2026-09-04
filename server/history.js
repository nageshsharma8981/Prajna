// What this kind of work has actually cost. The estimate on a ticket comes
// from a table of step costs; the house also has its own past, and that is
// worth saying before anyone stamps. Every figure here is counted from
// delivered missions, never modelled: with too few to be worth quoting, the
// house says so instead of inventing a range.
import { store } from './store.js';

const settled = (m) => (m.settlement?.settled ?? m.spent) || 0;
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : Math.round(((a[i - 1] + a[i]) / 2) * 10) / 10; };

export function costHistory({ desk, depth, variant, exclude } = {}) {
  const all = store.missions().filter((m) => m.status === 'FILLED' && m.desk === desk && m.id !== exclude && settled(m) > 0);
  // Prefer like for like: the same depth and variant. Fall back to the desk
  // alone, and say which comparison is being made.
  const alike = all.filter((m) => (!depth || m.depth === depth) && (!variant || (m.variant || 'build') === variant));
  const pool = alike.length >= 3 ? alike : all;
  if (pool.length < 3) return { enough: false, n: pool.length, desk, like: alike.length >= 3 };
  const costs = pool.map(settled);
  const gated = pool.filter((m) => (m.validations || []).length);
  const firstTime = gated.filter((m) => m.validations.length === 1 && m.validations[0].gate?.cleared).length;
  const patched = pool.filter((m) => (m.patches || []).length).length;
  const overran = pool.filter((m) => (m.attention || []).some((a) => a.kind === 'ceiling')).length;
  return {
    enough: true,
    n: pool.length,
    like: pool === alike,
    desk,
    low: Math.round(Math.min(...costs) * 10) / 10,
    high: Math.round(Math.max(...costs) * 10) / 10,
    median: median(costs),
    firstTime: gated.length ? { of: gated.length, cleared: firstTime } : null,
    patched,
    overran,
  };
}

// The same thing in a sentence, for the ticket and for the tape.
export function historyLine(h, estimate) {
  if (!h?.enough) return `The house has only ${h?.n || 0} finished ${h?.desk || 'mission'}${(h?.n || 0) === 1 ? '' : 's'} of this kind, too few to say what it usually costs.`;
  const cmp = estimate == null ? '' : estimate > h.high ? ` This ticket estimates ${estimate}, above every one of them.`
    : estimate < h.low ? ` This ticket estimates ${estimate}, below every one of them.`
    : ` This ticket estimates ${estimate}, inside that range.`;
  return `${h.n} ${h.like ? 'like this' : `${h.desk} mission${h.n === 1 ? '' : 's'}`} settled between ${h.low} and ${h.high} credits, median ${h.median}.${h.firstTime ? ` ${h.firstTime.cleared} of ${h.firstTime.of} cleared the gate first time.` : ''}${h.overran ? ` ${h.overran} hit the ceiling and had to be decided.` : ''}${cmp}`;
}
