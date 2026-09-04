// Standing orders: a delivered ticket that re-runs itself on a cadence.
// Each run is a new mission in the same lineage, stamped and reserved like
// any other; when the balance cannot cover the ceiling the run is skipped
// and recorded, never silently dropped. Orders live in the workspace file.
import { store } from './store.js';
import { ws, flushWs } from './workspace.js';
import { forkMission, launchMission, voidTicket } from './engine.js';

export const CADENCES = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
const id = () => `so_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function standingOrders() { const w = ws(); if (!w.standingOrders) w.standingOrders = []; return w.standingOrders; }
export function standingFor(missionId) { return standingOrders().find((o) => o.rootId === missionId || o.missionId === missionId || (o.runs || []).some((r) => r.missionId === missionId)) || null; }

const MONTH = 30 * 24 * 60 * 60 * 1000;
// What an order's runs have actually settled in the last 30 days.
export function spentThisMonth(o, now = Date.now()) {
  return Math.round((o.runs || []).filter((r) => !r.skipped && r.at >= now - MONTH).reduce((a, r) => { const m = store.mission(r.missionId); return a + (m ? (m.settlement?.settled ?? m.spent ?? 0) : 0); }, 0) * 10) / 10;
}
// Orders the house should worry about: root ticket gone, or overdue by more
// than one interval (the scheduler was down, or every run has been skipped).
export function standingHealth(now = Date.now()) {
  const orphaned = standingOrders().filter((o) => !o.paused && !store.mission(o.missionId));
  const overdue = standingOrders().filter((o) => !o.paused && now - o.nextAt > CADENCES[o.cadence]);
  return { total: standingOrders().length, orphaned, overdue };
}

export function addStandingOrder(missionId, cadence, cap) {
  const m = store.mission(missionId);
  if (!m) return { error: 'Mission not found.' };
  if (m.status !== 'FILLED') return { error: 'Only a delivered ticket can become a standing order.' };
  if (!CADENCES[cadence]) return { error: 'Cadence must be daily or weekly.' };
  if (standingFor(missionId)) return { error: 'This ticket already has a standing order.' };
  const capN = Number(cap);
  if (cap !== undefined && cap !== null && cap !== '' && !(capN > 0)) return { error: 'The monthly cap must be a positive number of credits, or left empty.' };
  const o = { id: id(), rootId: m.id, missionId: m.id, serial: m.serial, goal: m.goal, deskName: m.deskName, cadence, cap: capN > 0 ? Math.round(capN) : null, createdAt: Date.now(), nextAt: Date.now() + CADENCES[cadence], paused: false, runs: [] };
  standingOrders().push(o); flushWs();
  return { order: o };
}
export function removeStandingOrder(oid) { const list = standingOrders(); const i = list.findIndex((o) => o.id === oid); if (i < 0) return false; list.splice(i, 1); flushWs(); return true; }
export function pauseStandingOrder(oid, paused) { const o = standingOrders().find((x) => x.id === oid); if (!o) return null; o.paused = !!paused; if (!paused && o.nextAt < Date.now()) o.nextAt = Date.now() + CADENCES[o.cadence]; flushWs(); return o; }

// Run one order now: fork the latest mission in its lineage and launch it.
export function runOrder(o, { installedSkills, queuedConnectors, notify }) {
  const parent = store.mission(o.missionId);
  const at = Date.now();
  let run;
  if (!parent) run = { at, skipped: 'the ticket it repeats is gone' };
  else {
    const next = forkMission(parent.id, { installedSkills, queuedConnectors, feedback: [], redeliverTo: [...new Set((parent.deliveries || []).filter((d) => d.ok).map((d) => d.connector))].filter((c) => queuedConnectors.includes(c)) });
    if (!next) run = { at, skipped: 'could not write the ticket' };
    else {
      next.standingOrderId = o.id; store.flushMissions();
      const credits = store.workspace().credits;
      const used = o.cap ? spentThisMonth(o, at) : 0;
      if (o.cap && used + next.contract.ceiling > o.cap) {
        run = { at, skipped: `monthly cap ${o.cap} cr: ${used} cr settled in the last 30 days, this run's ceiling is ${next.contract.ceiling} cr`, missionId: next.id, serial: next.serial };
        try { voidTicket(next.id, notify); } catch { /* stays open for the owner */ }
      } else if (credits < next.contract.ceiling || !launchMission(next.id, notify)) {
        run = { at, skipped: `balance ${credits.toFixed(0)} cr is below the ${next.contract.ceiling} cr ceiling`, missionId: next.id, serial: next.serial };
        try { voidTicket(next.id, notify); } catch { /* the ticket stays open for the owner to fund */ }
      } else { run = { at, missionId: next.id, serial: next.serial }; o.missionId = next.id; }
    }
  }
  o.runs = [run, ...(o.runs || [])].slice(0, 30);
  o.nextAt = at + CADENCES[o.cadence];
  o.lastAt = at;
  flushWs();
  return run;
}
export function runDue(deps, now = Date.now()) {
  const out = [];
  for (const o of standingOrders()) if (!o.paused && o.nextAt <= now) out.push({ order: o, run: runOrder(o, deps) });
  return out;
}
export function scheduleStandingOrders(deps) {
  setInterval(() => { try { for (const { order, run } of runDue(deps())) console.log(`prajna: standing order ${order.serial} ${run.skipped ? `skipped (${run.skipped})` : `ran as ${run.serial}`}`); } catch (e) { console.error('prajna: standing orders,', e.message); } }, 60 * 1000).unref();
}
