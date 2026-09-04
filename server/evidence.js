// Evidence check: the sources a delivery cites are addresses on the open
// web, and addresses die. The house re-visits them and records what it
// found, so an artifact that rests on a page that is gone says so instead
// of quietly implying the evidence still stands. Read-only: a HEAD, then a
// GET if HEAD is refused; never a private address; nothing is rewritten.
import { store } from './store.js';
import { ws, flushWs } from './workspace.js';

const MS = 7000;
const UA = 'Prajna/0.11 (contract-first agent workspace; evidence re-check)';
const privateHost = (h) => { h = String(h).toLowerCase().replace(/^\[|\]$/g, ''); return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^fc|^fd|^fe80/i.test(h); };

async function visit(url, allowLocal) {
  let u; try { u = new URL(url); } catch { return { ok: false, detail: 'not a valid address' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, detail: 'not a web address' };
  if (!allowLocal && privateHost(u.hostname)) return { ok: null, detail: 'private address, not visited' };
  const once = async (method) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), MS);
    try { const r = await fetch(u, { method, headers: { 'user-agent': UA }, signal: ctl.signal, redirect: 'follow' }); return { status: r.status, ok: r.ok }; }
    finally { clearTimeout(t); }
  };
  try {
    let r = await once('HEAD');
    if (!r.ok && [403, 405, 501].includes(r.status)) r = await once('GET');
    return { ok: r.ok, status: r.status, detail: r.ok ? `resolves (${r.status})` : `gone or refused (${r.status})` };
  } catch (e) { return { ok: false, detail: e.name === 'AbortError' ? 'no answer within seven seconds' : String(e.message || e).slice(0, 70) }; }
}

// One mission's cited addresses, re-visited and written onto its record.
export async function checkMission(missionId, { allowLocal = process.env.PRAJNA_ALLOW_LOCAL_PAGES === '1' } = {}) {
  const m = store.mission(missionId);
  if (!m) return null;
  const cited = (m.sources || []).filter((s) => s.url);
  // A mission cites a handful of addresses; visit them together, not in a queue.
  const rows = await Promise.all(cited.map(async (s) => ({ id: s.id, title: s.title, url: s.url, engine: s.engine, ...(await visit(s.url, allowLocal)) })));
  const evidence = { at: Date.now(), checked: rows.length, dead: rows.filter((r) => r.ok === false).length, rows };
  m.evidence = evidence;
  store.flushMissions();
  return evidence;
}

// The house-wide sweep: the most recent deliveries that cite addresses.
export async function sweep({ limit = 15, allowLocal } = {}) {
  const ms = store.missions().filter((m) => m.status === 'FILLED' && (m.sources || []).some((s) => s.url)).sort((a, b) => (b.filledAt || 0) - (a.filledAt || 0)).slice(0, limit);
  let checked = 0, dead = 0, covered = 0; const missions = [];
  // A sweep is a courtesy to the record, not an errand that can run all day:
  // it stops after forty-five seconds and reports what it managed.
  const deadline = Date.now() + 45000;
  for (const m of ms) {
    if (Date.now() > deadline) break;
    const e = await checkMission(m.id, { allowLocal });
    if (!e) continue;
    covered++; checked += e.checked; dead += e.dead;
    if (e.dead) missions.push({ serial: m.serial, id: m.id, dead: e.dead, gone: e.rows.filter((r) => r.ok === false).map((r) => r.url).slice(0, 3) });
  }
  const result = { at: Date.now(), missions: covered, considered: ms.length, checked, dead, withDead: missions, partial: covered < ms.length };
  ws().lastEvidenceSweep = result; flushWs();
  return result;
}

export function evidenceHealth() {
  const e = ws().lastEvidenceSweep;
  if (!e) return null;
  const days = Math.round((Date.now() - e.at) / 86400000);
  return { ok: e.dead === 0, detail: e.dead === 0
    ? `${e.checked} cited address(es) across ${e.missions} deliver${e.missions === 1 ? 'y' : 'ies'} all resolve, checked ${days ? `${days}d ago` : 'today'}`
    : `${e.dead} of ${e.checked} cited address(es) no longer resolve: ${e.withDead.map((m) => `${m.serial} (${m.gone.join(', ')})`).join('; ')}` };
}
