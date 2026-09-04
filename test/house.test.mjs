// The house's regression suite: boots a fresh instance on a scratch directory
// and drives it through the API the way the owner and the CLI do. Zero
// dependencies; `npm test`. Every assertion here was once a hand check.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3010 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-test-'));
let child;
const api = async (p, opts = {}) => {
  const r = await fetch(BASE + p, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  return { status: r.status, j, headers: r.headers };
};
const post = (p, body) => api(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

before(async () => {
  child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT), PRAJNA_DATA_DIR: DIR, PRAJNA_PUBLIC_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'] });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
});
after(() => { child?.kill(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('health and the app shell answer', async () => {
  const h = await api('/api/health');
  assert.equal(h.status, 200); assert.ok(h.j.version); assert.equal(h.j.dataWritable, true);
  const shell = await fetch(`${BASE}/`); assert.equal(shell.status, 200); assert.match(shell.headers.get('content-type'), /text\/html/);
  for (const p of ['/logo.png', '/mark.png', '/favicon.png']) { const r = await fetch(BASE + p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /image\/png/, p); }
});

test('nothing that changes the workspace runs before the house rules are accepted', async () => {
  const legal = await api('/api/legal'); assert.equal(legal.status, 200); assert.ok(legal.j.version);
  for (const p of ['/api/housecheck', '/api/housecheck/repair', '/api/missions']) { const r = await post(p, {}); assert.equal(r.status, 403, p); assert.equal(r.j.consentRequired, true, p); }
  const bad = await post('/api/consent', { accept: true, version: 'wrong' }); assert.equal(bad.status, 400);
  const ok = await post('/api/consent', { accept: true, version: legal.j.version, name: 'Test Owner' }); assert.equal(ok.status, 200); assert.equal(ok.j.consent.version, legal.j.version);
});

test('the fresh house is seeded and sound', async () => {
  const b = await api('/api/bootstrap'); assert.equal(b.status, 200);
  assert.ok(b.j.missions.filter((m) => m.status === 'FILLED').length >= 1, 'seeded delivered missions');
  assert.ok(b.j.artifacts.length >= 1);
  const c = await post('/api/housecheck'); assert.equal(c.status, 200);
  assert.equal(c.j.ok, c.j.total, JSON.stringify(c.j.rows.filter((r) => !r.ok)));
  const ids = c.j.rows.map((r) => r.id); for (const id of ['data-dir', 'artifacts', 'reserve', 'consent']) assert.ok(ids.includes(id), id);
});

test('repair regenerates a missing artifact file and reconciles a drifted reserve', async () => {
  const b = await api('/api/bootstrap');
  const a = b.j.artifacts[0];
  fs.unlinkSync(path.join(DIR, 'artifacts', `${a.id}.html`));
  const c1 = await post('/api/housecheck'); assert.equal(c1.j.rows.find((r) => r.id === 'artifacts').ok, false);
  const r = await post('/api/housecheck/repair'); assert.equal(r.status, 200);
  assert.ok(r.j.actions.some((x) => x.id === 'artifacts' && x.ok), JSON.stringify(r.j.actions));
  assert.equal(r.j.check.rows.find((x) => x.id === 'artifacts').ok, true);
  assert.equal((await fetch(`${BASE}/api/artifacts/${a.id}/html`)).status, 200);
});

test('a ticket is written, launched, runs to delivery and settles within its ceiling', async () => {
  const w = await post('/api/missions', { goal: 'Test: a brief for a Hampi guesthouse', deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200, JSON.stringify(w.j)); assert.equal(w.j.status, 'OPEN'); assert.ok(w.j.contract.ceiling > 0);
  const l = await post(`/api/missions/${w.j.id}/launch`); assert.equal(l.status, 200);
  const started = Date.now(); let m;
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${w.j.id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) await post(`/api/missions/${m.id}/attention/${a.id}`, { decision: 'approve', justification: 'test run, approving to reach delivery' }); }
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
  assert.ok(m.settlement.settled <= m.contract.ceiling + 0.01, 'settled within ceiling');
  assert.ok(m.artifactId, 'artifact delivered');
  const html = await fetch(`${BASE}/api/artifacts/${m.artifactId}/html`); assert.equal(html.status, 200);
  assert.match(await html.text(), /prajna\.provenance\.v1/, 'provenance travels with the artifact');
  const c = await post('/api/housecheck'); assert.equal(c.j.rows.find((r) => r.id === 'reserve').ok, true, 'reserve reconciles after settlement');
});

test('share links open and close, and revocation is on the record', async () => {
  const b = await api('/api/bootstrap'); const a = b.j.artifacts.find((x) => x.missionId);
  const s = await post(`/api/artifacts/${a.id}/share`); assert.equal(s.status, 200); assert.match(s.j.path, /^\/s\/[a-f0-9]{32}$/);
  assert.equal((await fetch(BASE + s.j.path)).status, 200);
  const d = await api(`/api/artifacts/${a.id}/share`, { method: 'DELETE' }); assert.equal(d.status, 200);
  assert.equal((await fetch(BASE + s.j.path)).status, 404);
});

test('standing orders: repeat, run now, cap, pause, orphan, stop', async () => {
  const b = await api('/api/bootstrap');
  const filled = b.j.missions.filter((m) => m.status === 'FILLED' && !m.lineage && !m.standing);
  assert.ok(filled.length >= 2, 'two delivered tickets to repeat');
  const [m1, m2] = filled;
  const bad = await post(`/api/missions/${m1.id}/standing`, { cadence: 'daily', cap: 'abc' }); assert.equal(bad.status, 400);
  const o1 = await post(`/api/missions/${m1.id}/standing`, { cadence: 'daily', cap: 1 }); assert.equal(o1.status, 200); assert.equal(o1.j.cap, 1);
  const dup = await post(`/api/missions/${m1.id}/standing`, { cadence: 'daily' }); assert.equal(dup.status, 400);
  const r1 = await post(`/api/standing/${o1.j.id}/run`); assert.match(r1.j.run.skipped || '', /monthly cap/);
  const voided = (await api(`/api/missions/${r1.j.run.missionId}`)).j; assert.equal(voided.status, 'KILLED'); assert.equal(voided.voidedBeforeRun, true);
  const o2 = await post(`/api/missions/${m2.id}/standing`, { cadence: 'weekly' }); assert.equal(o2.status, 200);
  const r2 = await post(`/api/standing/${o2.j.id}/run`); assert.equal(r2.j.run.skipped, undefined, JSON.stringify(r2.j.run)); assert.ok(r2.j.run.serial);
  const child2 = (await api(`/api/missions/${r2.j.run.missionId}`)).j; assert.equal(child2.lineage.parentId, m2.id); assert.equal(child2.standing.id, o2.j.id);
  const root = (await api(`/api/missions/${m2.id}`)).j; assert.equal(root.standing.id, o2.j.id, 'root ticket knows its order');
  const paused = await post(`/api/standing/${o2.j.id}/pause`, { paused: true }); assert.equal(paused.j.paused, true);
  const list = await api('/api/standing'); assert.equal(list.j.orders.length, 2);
  const dead = await post(`/api/standing/${o1.j.id}/run`); assert.ok(dead.status === 200);
  const c = await post('/api/housecheck'); assert.ok(c.j.rows.find((r) => r.id === 'standing'));
  for (const o of list.j.orders) { const d = await api(`/api/standing/${o.id}`, { method: 'DELETE' }); assert.equal(d.status, 200); }
  assert.equal((await api('/api/standing')).j.orders.length, 0);
});

test('an amendment carries a delta against its parent, and the record can say what changed', async () => {
  const b = await api('/api/bootstrap');
  const parent = b.j.missions.find((m) => m.status === 'FILLED' && !m.lineage);
  const f = await post(`/api/missions/${parent.id}/fork`, { feedback: ['Make it shorter'] }); assert.equal(f.status, 200); assert.equal(f.j.lineage.parentId, parent.id);
  const d0 = await api(`/api/missions/${f.j.id}/delta`); assert.equal(d0.status, 200); assert.equal(d0.j.delta.done, false);
  const noParent = await api(`/api/missions/${parent.id}/delta`); assert.equal(noParent.j.delta, null);
  const bundle = await fetch(`${BASE}/api/missions/${parent.id}/bundle`); assert.equal(bundle.status, 200);
});

test('the digest and the status page read from the same ledger', async () => {
  const d = await api('/api/digest'); assert.equal(d.status, 200); assert.match(d.j.text, /Prajñā digest/); assert.match(d.j.text, /Balance \d+ credits/);
  const s = await fetch(`${BASE}/status`); assert.equal(s.status, 200); assert.match(await s.text(), /Last house check/);
});
