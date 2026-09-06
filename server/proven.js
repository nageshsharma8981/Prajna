// Proven briefs: what has actually worked in this house, read off the record
// rather than voted on. A brief is proven by delivering, by clearing the
// gate first time, by costing what it was estimated to cost, and by being
// asked for again. Zenith's factory ranks prompts by likes; the house ranks
// them by evidence. Derived when asked, never stored, and one click away
// from the composer with the same brief on the same desk.
import { store } from './store.js';

const MODE = { site: 'website', mobile: 'mobile', deck: 'deck', brief: 'research', analysis: 'analysis' };
const norm = (g) => String(g || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function provenBriefs({ limit = 12 } = {}) {
  const groups = new Map();
  for (const m of store.missions()) {
    if (m.status !== 'FILLED' || m.partial || m.voided || !m.artifactId || m.standing) continue;
    const key = `${m.desk}|${norm(m.goal)}`;
    const g = groups.get(key) || { desk: m.desk, deskName: m.deskName, goal: m.goal, runs: 0, firstTime: 0, live: 0, spent: 0, estimate: 0, last: null, looks: {} };
    g.runs += 1;
    const v = m.validations || [];
    if (v.length === 1 && v[0].gate && v[0].gate.cleared) g.firstTime += 1;
    if (m.authored && m.authored.live) g.live += 1;
    g.spent += Number(m.spent || 0); g.estimate += Number(m.contract?.estimate || 0);
    if (m.look && m.look.mood) g.looks[m.look.mood] = (g.looks[m.look.mood] || 0) + 1;
    if (!g.last || (m.filledAt || m.createdAt || 0) > (g.last.filledAt || g.last.createdAt || 0)) g.last = m;
    groups.set(key, g);
  }
  const score = (g) => (g.firstTime / g.runs) * 3 + Math.min(g.runs, 5) + (g.live ? 1 : 0) + (g.spent <= g.estimate ? 1 : 0);
  return [...groups.values()]
    .sort((a, b) => score(b) - score(a) || (b.last.filledAt || 0) - (a.last.filledAt || 0))
    .slice(0, limit)
    .map((g) => {
      const art = store.artifact(g.last.artifactId);
      const look = Object.entries(g.looks).sort((x, y) => y[1] - x[1])[0];
      return {
        goal: g.goal, desk: g.desk, deskName: g.deskName, mode: MODE[g.desk] || 'chat',
        runs: g.runs, firstTime: g.firstTime, live: g.live,
        cost: Math.round((g.spent / g.runs) * 10) / 10, estimate: Math.round((g.estimate / g.runs) * 10) / 10,
        look: look ? look[0] : null,
        latest: { serial: g.last.serial, missionId: g.last.id, artifactId: g.last.artifactId, at: g.last.filledAt || g.last.createdAt || null, title: art ? art.title.replace(/^VOID · /, '') : null, record: g.last.shareToken ? `/r/${g.last.shareToken}` : null },
        use: `/?desk=${encodeURIComponent(MODE[g.desk] || 'chat')}&brief=${encodeURIComponent(String(g.goal).slice(0, 600))}`,
        why: [
          g.firstTime === g.runs ? (g.runs === 1 ? 'cleared the gate first time' : `cleared the gate first time, all ${g.runs} runs`) : `cleared the gate first time in ${g.firstTime} of ${g.runs} runs`,
          g.spent <= g.estimate ? 'settled at or under its estimate' : 'settled over its estimate',
          g.live ? `written live by a model ${g.live === g.runs ? 'every time' : `${g.live} of ${g.runs} times`}` : 'scripted substance',
        ],
      };
    });
}
