// House webhooks: the events an owner should not have to sit in a tab to
// hear. One address, the events you choose, a small JSON body. The signing
// secret, like every key here, lives in memory only and is gone on restart;
// the house says so rather than pretending otherwise. Every attempt, and
// every failure, is on a short log the owner can read.
import crypto from 'node:crypto';
import { store } from './store.js';
import { ws, flushWs } from './workspace.js';

export const HOOK_EVENTS = ['decision.needed', 'run.delivered', 'run.stopped', 'limit.refused', 'housecheck.failed', 'house.entered'];
const MS = 5000;
let secret = null; // memory only, never written to disk, never returned to the browser

const privateHost = (h) => { h = String(h).toLowerCase().replace(/^\[|\]$/g, ''); return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^fc|^fd|^fe80/i.test(h); };

export function hooks() {
  const w = ws();
  if (!w.hooks) w.hooks = { url: null, events: Object.fromEntries(HOOK_EVENTS.map((e) => [e, true])) };
  return w.hooks;
}
export function hookState() { return { ...hooks(), secretHeld: !!secret, log: (ws().hookLog || []).slice(0, 12) }; }

export function setHooks({ url, events, secret: sec }, { allowLocal = process.env.PRAJNA_ALLOW_LOCAL_PAGES === '1' } = {}) {
  const h = hooks();
  if (url !== undefined) {
    const raw = String(url || '').trim();
    if (!raw) h.url = null;
    else {
      let u; try { u = new URL(raw); } catch { return { error: 'That is not a web address.' }; }
      if (!/^https?:$/.test(u.protocol)) return { error: 'The address must be http or https.' };
      if (!allowLocal && privateHost(u.hostname)) return { error: 'A private address cannot be reached from the house.' };
      h.url = u.href;
    }
  }
  if (events && typeof events === 'object') for (const e of HOOK_EVENTS) if (e in events) h.events[e] = !!events[e];
  flushWs();
  if (sec !== undefined) secret = String(sec || '').trim() || null; // memory only
  return { hooks: hookState() };
}

function log(entry) {
  const w = ws();
  if (!Array.isArray(w.hookLog)) w.hookLog = [];
  w.hookLog.unshift(entry);
  if (w.hookLog.length > 40) w.hookLog.length = 40;
  flushWs();
}

// One attempt, then one retry. Never throws into a run.
export async function fire(event, payload, { force = false } = {}) {
  const h = hooks();
  if (!h.url || (!force && !h.events[event])) return null;
  const body = JSON.stringify({ event, at: Date.now(), house: ws().profile?.name || ws().workspace?.name || 'Prajñā', ...payload });
  const headers = { 'content-type': 'application/json', 'user-agent': 'Prajna/0.11 (house webhook)', 'x-prajna-event': event };
  if (secret) headers['x-prajna-signature'] = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const once = async () => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), MS);
    try { const r = await fetch(h.url, { method: 'POST', headers, body, signal: ctl.signal }); return { ok: r.ok, status: r.status }; }
    finally { clearTimeout(t); }
  };
  let result;
  try { result = await once(); if (!result.ok) result = await once(); }
  catch (e) { try { result = await once(); } catch (e2) { result = { ok: false, detail: String(e2.message || e2).slice(0, 70) }; } }
  log({ at: Date.now(), event, url: h.url, ok: !!result.ok, status: result.status || null, detail: result.detail || null, signed: !!secret });
  return result;
}

// The house's own events, mapped to the five an owner cares about.
export function fromMissionEvent(missionId, ev) {
  const m = store.mission(missionId);
  if (!m) return;
  const base = { mission: { id: m.id, serial: m.serial, subject: m.subject || m.goal, desk: m.deskName, status: m.status } };
  if (ev.type === 'attention.raised') fire('decision.needed', { ...base, decision: { kind: ev.kind, prompt: ev.prompt, options: ev.options } });
  else if (ev.type === 'run.done') fire('run.delivered', { ...base, settled: m.settlement?.settled ?? m.spent, ceiling: m.contract?.ceiling, artifactId: m.artifactId || null });
  else if (ev.type === 'run.killed') fire('run.stopped', { ...base, settled: m.spent, note: ev.note || null });
}
