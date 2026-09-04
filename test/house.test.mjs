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
  child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT), PRAJNA_DATA_DIR: DIR, PRAJNA_PUBLIC_URL: BASE, PRAJNA_ALLOW_LOCAL_PAGES: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (m.status.startsWith('PAUSED')) {
      const a = (m.attention || []).find((x) => !x.decision);
      if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; const d = await post(`/api/missions/${m.id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick} to reach delivery` }); assert.equal(d.status, 200, `decision ${pick} on ${a.kind}: ${JSON.stringify(d.j)}`); }
    }
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

test('take your data: the export is a real zip holding the whole workspace, without keys', async () => {
  const r = await fetch(`${BASE}/api/export`); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /application\/zip/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip local header');
  const text = buf.toString('latin1');
  for (const name of ['README.txt', 'workspace.json', 'workspace-ui.json', 'missions.json', 'artifacts.json', 'artifacts/']) assert.ok(text.includes(name), name);
  assert.ok(Number(r.headers.get('x-entries')) >= 6);
  assert.ok(!/"key":\s*"sk-/.test(text), 'no provider key in the export');
});

test('erase: typed confirmation only, then a fresh house with the consent record kept', async () => {
  const no = await post('/api/erase', { confirm: 'yes' }); assert.equal(no.status, 400);
  const before = (await api('/api/bootstrap')).j; assert.ok(before.missions.length > 3);
  const r = await post('/api/erase', { confirm: 'ERASE' }); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.consentKept, true);
  const after = (await api('/api/bootstrap')).j;
  assert.equal(after.missions.length, 3, 'fresh seeded house');
  assert.ok(after.consent && after.consent.version, 'consent version kept'); assert.equal(after.consent.name, undefined, 'no personal data in the kept consent');
  assert.equal(after.profile.name, '', 'profile erased');
  const c = await post('/api/housecheck'); assert.equal(c.status, 200); assert.equal(c.j.ok, c.j.total, JSON.stringify(c.j.rows.filter((x) => !x.ok)));
});

test('restore: an export goes back in whole after an erase', async () => {
  const w = await post('/api/missions', { goal: 'Restore test: a brief', deskId: 'brief', depth: 'fast' }); assert.equal(w.status, 200);
  const live = await post('/api/missions', { goal: 'Restore test: a run in flight', deskId: 'brief', depth: 'fast' }); assert.equal((await post(`/api/missions/${live.j.id}/launch`)).status, 200);
  const before = (await api('/api/bootstrap')).j;
  assert.equal(before.missions.find((m) => m.id === live.j.id).status, 'LIVE');
  const zip = Buffer.from(await (await fetch(`${BASE}/api/export`)).arrayBuffer());
  const e = await post('/api/erase', { confirm: 'ERASE' }); assert.equal(e.status, 200);
  assert.equal((await api('/api/bootstrap')).j.missions.length, 3);
  const noConfirm = await fetch(`${BASE}/api/import`, { method: 'POST', body: zip }); assert.equal(noConfirm.status, 400);
  const junk = await fetch(`${BASE}/api/import?confirm=REPLACE`, { method: 'POST', body: Buffer.from('not a zip at all, but long enough to pass the size check') }); assert.equal(junk.status, 400);
  const r = await fetch(`${BASE}/api/import?confirm=REPLACE`, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: zip }); const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  const after = (await api('/api/bootstrap')).j;
  assert.equal(after.missions.length, before.missions.length, 'missions restored');
  assert.equal(after.artifacts.length, before.artifacts.length, 'artifacts restored');
  assert.ok(after.missions.some((m) => m.id === w.j.id), 'the open ticket came back');
  const back = after.missions.find((m) => m.id === live.j.id); assert.equal(back.status, 'KILLED'); assert.equal(back.partial, true); assert.ok(back.settlement, 'interrupted run settled');
  assert.equal(j.interrupted, 1);
  for (const a of after.artifacts) assert.equal((await fetch(`${BASE}/api/artifacts/${a.id}/html`)).status, 200, a.id);
  const c = await post('/api/housecheck'); assert.equal(c.j.ok, c.j.total, JSON.stringify(c.j.rows.filter((x) => !x.ok)));
});

test('backups: written on demand, listed, healthy, downloadable, and a way back', async () => {
  const w = await post('/api/missions', { goal: 'Backup test: a brief', deskId: 'brief', depth: 'fast' }); assert.equal(w.status, 200);
  const b = await post('/api/backup'); assert.equal(b.status, 200, JSON.stringify(b.j)); assert.match(b.j.name, /^prajna-backup-.*\.zip$/); assert.ok(b.j.bytes > 1000);
  const list = await api('/api/backups'); assert.equal(list.j.backups[0].name, b.j.name); assert.equal(list.j.health.ok, true, list.j.health.detail);
  const dl = await fetch(`${BASE}/api/backups/${b.j.name}`); assert.equal(dl.status, 200); assert.equal(Buffer.from(await dl.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  assert.equal((await fetch(`${BASE}/api/backups/prajna-backup-nope.zip`)).status, 404);
  const c = await post('/api/housecheck'); const row = c.j.rows.find((r) => r.id === 'backups'); assert.ok(row && row.ok, JSON.stringify(row));
  const e = await post('/api/erase', { confirm: 'ERASE' }); assert.equal(e.status, 200);
  assert.equal((await api('/api/backups')).j.backups.length >= 1, true, 'backups survive an erase');
  const no = await post(`/api/backups/${b.j.name}/restore`, { confirm: 'no' }); assert.equal(no.status, 400);
  const r = await post(`/api/backups/${b.j.name}/restore`, { confirm: 'REPLACE' }); assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.ok((await api('/api/bootstrap')).j.missions.some((m) => m.id === w.j.id), 'the ticket came back from the backup');
});

test('the Browser tool reads the pages a ticket names and puts them on the table', async () => {
  const t = await post('/api/tools/browser/toggle'); assert.equal(t.status, 200);
  if (!t.j.enabled) await post('/api/tools/browser/toggle');
  const w = await post('/api/missions', { goal: `Summarise the house rules at ${BASE}/legal/terms for a new user`, deskId: 'brief', depth: 'fast' }); assert.equal(w.status, 200, JSON.stringify(w.j));
  assert.equal(w.j.status, 'OPEN');
  const onTable = (w.j.sources || []).find((s) => s.engine === 'page'); assert.ok(onTable && onTable.words > 500, `page on the table before stamping: ${JSON.stringify(w.j.sources)}`);
  assert.ok((w.j.attachments || []).some((a) => a.page && /Terms/.test(a.name)), `the ticket lists the page: ${JSON.stringify(w.j.attachments)}`);
  assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200);
  const started = Date.now(); let m;
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${w.j.id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${m.id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
  const page = (m.sources || []).find((s) => s.engine === 'page');
  assert.ok(page, `a page source on the table: ${JSON.stringify((m.sources || []).map((s) => s.engine))}`);
  assert.match(page.title, /Terms and Conditions/); assert.ok(page.words > 500);
  assert.equal((m.sources || []).filter((s) => s.engine === 'page').length, 1, 'read once, kept once');
});

test('the companion reads a pasted address and quotes it, even without a model key', async () => {
  const t = await api('/api/bootstrap'); if (!t.j.tools?.browser) await post('/api/tools/browser/toggle');
  const c = await post('/api/chats', { title: 'Page test' }); assert.equal(c.status, 200);
  const r = await fetch(`${BASE}/api/chats/${c.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `What do the rules at ${BASE}/legal/ai say?` }) });
  assert.equal(r.status, 200);
  const raw = await r.text();
  const done = raw.split('\n\n').map((b) => b.trim()).filter((b) => b.startsWith('event: done')).map((b) => JSON.parse(b.split('\ndata: ')[1]))[0];
  assert.ok(done, 'a done event');
  assert.match(done.message.text, /I read .*AI Disclaimer/i, done.message.text.slice(0, 200));
  assert.ok(raw.includes('event: read'), 'a read event before the reply');
  const user = done.chat.messages.find((m) => m.role === 'user' && m.pages);
  assert.ok(user && user.pages[0].words > 100, JSON.stringify(user?.pages));
  const off = await post('/api/tools/browser/toggle'); assert.equal(off.j.enabled, false);
  const r2 = await fetch(`${BASE}/api/chats/${c.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `And ${BASE}/legal/terms?` }) });
  const raw2 = await r2.text(); assert.ok(!raw2.includes('event: read'), 'nothing read with the tool off');
});
