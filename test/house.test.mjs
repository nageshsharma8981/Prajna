// The house's regression suite: boots a fresh instance on a scratch directory
// and drives it through the API the way the owner and the CLI do. Zero
// dependencies; `npm test`. Every assertion here was once a hand check.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
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

test('the companion reads an attached text file and quotes it, even without a model key', async () => {
  const c = await post('/api/chats', { title: 'Attachment test' }); assert.equal(c.status, 200);
  const note = 'Board note. The Mysore roastery pilot settled at 41 credits and cleared the gate first time. Dissent from DeepSeek was carried into the deck. Next step: a second site by March.';
  const r = await fetch(`${BASE}/api/chats/${c.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'What does the attached note say about the next step?', attachments: [{ name: 'board-note.txt', text: note }, { name: 'photo.png' }] }) });
  assert.equal(r.status, 200);
  const raw = await r.text();
  const done = raw.split('\n\n').map((b) => b.trim()).filter((b) => b.startsWith('event: done')).map((b) => JSON.parse(b.split('\ndata: ')[1]))[0];
  assert.ok(done, 'a done event');
  assert.match(done.message.text, /I read board-note\.txt \(\d+ words\)/, done.message.text.slice(0, 200));
  assert.match(done.message.text, /Mysore roastery pilot/, 'quotes the note');
  const user = done.chat.messages.find((m) => m.role === 'user' && m.read);
  assert.ok(user && user.read.length === 1 && user.read[0].name === 'board-note.txt' && user.read[0].words > 20, JSON.stringify(user?.read));
  assert.deepEqual(user.attachments, ['board-note.txt', 'photo.png'], 'both names recorded, only the text one read');
});

test('the record answers about any serial and about the latest delivery, not only this thread', async () => {
  const b = await api('/api/bootstrap');
  const done = b.j.missions.filter((m) => m.status === 'FILLED' && m.narrative).sort((x, y) => (y.filledAt || 0) - (x.filledAt || 0));
  assert.ok(done.length >= 1, 'a delivered mission with a narrative');
  const c = await post('/api/chats', { title: 'Record test' });
  const ask = async (text) => { const r = await fetch(`${BASE}/api/chats/${c.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); const raw = await r.text(); return raw.split('\n\n').map((x) => x.trim()).filter((x) => x.startsWith('event: done')).map((x) => JSON.parse(x.split('\ndata: ')[1]))[0].message; };
  const named = await ask(`What happened in ${done[0].serial}?`);
  assert.equal(named.kind, 'record', named.text.slice(0, 160)); assert.match(named.text, /^From the record:/);
  const latest = await ask('What did the latest delivery cost?');
  assert.equal(latest.kind, 'record', latest.text.slice(0, 160));
  const none = await ask('What happened in PJ-999999?');
  assert.notEqual(none.kind, 'record', 'an unknown serial is not answered from the record');
});

test('the house answers about money and schedule from the ledger, without a model', async () => {
  const c = await post('/api/chats', { title: 'Money test' });
  const ask = async (text) => { const r = await fetch(`${BASE}/api/chats/${c.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); const raw = await r.text(); return raw.split('\n\n').map((x) => x.trim()).filter((x) => x.startsWith('event: done')).map((x) => JSON.parse(x.split('\ndata: ')[1]))[0].message; };
  const b = (await api('/api/bootstrap')).j;
  const week = await ask('How much did the house spend this week, and what was the costliest?');
  assert.equal(week.kind, 'house', week.text.slice(0, 160));
  assert.match(week.text, /This week the house settled \d+ credits across \d+ deliver/);
  assert.match(week.text, /costliest was PJ-\d+/);
  assert.ok(week.text.includes(`Balance ${b.workspace.credits.toFixed(0)} credits`), `balance from the ledger: ${week.text}`);
  const none = await ask('What is scheduled?');
  assert.equal(none.kind, 'house'); assert.match(none.text, /Nothing is scheduled/);
  const filled = b.missions.find((m) => m.status === 'FILLED' && !m.standing);
  const o = await post(`/api/missions/${filled.id}/standing`, { cadence: 'weekly', cap: 120 }); assert.equal(o.status, 200);
  const sched = await ask('What is scheduled next?');
  assert.ok(sched.text.includes(filled.serial) && /weekly, cap 120 cr a month, next/.test(sched.text), sched.text);
  await api(`/api/standing/${o.j.id}`, { method: 'DELETE' });
});

test('search finds the words themselves, in tapes, artifacts, decisions and chats', async () => {
  const b = (await api('/api/bootstrap')).j;
  const m = b.missions.find((x) => x.status === 'FILLED' && x.subject);
  const word = (m.subject.match(/[A-Za-z]{6,}/) || ['brief'])[0].toLowerCase();
  const r = await api(`/api/search?q=${encodeURIComponent(word)}`);
  assert.equal(r.status, 200);
  assert.ok(r.j.hits.length > 0, `a hit for "${word}"`);
  for (const h of r.j.hits) { assert.ok(h.to && h.where && h.snippet, JSON.stringify(h)); assert.ok(h.snippet.toLowerCase().includes(word) || h.title.toLowerCase().includes(word), h.snippet); }
  assert.ok(r.j.scanned.missions >= 1 && r.j.scanned.artifacts >= 1);
  const inTape = await api('/api/search?q=' + encodeURIComponent('reserved'));
  assert.ok(inTape.j.hits.some((h) => /tape|narrative|ticket|delivered/.test(h.where)), JSON.stringify(inTape.j.hits.map((h) => h.where)));
  const two = await api('/api/search?q=' + encodeURIComponent('zzzznotaword ' + word));
  assert.equal(two.j.hits.length, 0, 'every term must match');
  assert.equal((await api('/api/search?q=a')).j.hits.length, 0, 'a single letter is not a search');
});

test('house limits refuse a ticket before anything is reserved, and let it through when raised', async () => {
  const before = (await api('/api/bootstrap')).j.workspace;
  const w = await post('/api/missions', { goal: 'Limits test: a brief for a Coorg homestay', deskId: 'brief', depth: 'fast' });
  const ceiling = w.j.contract.ceiling; assert.ok(ceiling > 2);
  const bad = await api('/api/limits', { method: 'PUT', body: JSON.stringify({ ticketCeiling: -3 }) }); assert.equal(bad.status, 400);
  assert.equal((await api('/api/limits', { method: 'PUT', body: JSON.stringify({ ticketCeiling: ceiling - 1 }) })).status, 200);
  const refused = await post(`/api/missions/${w.j.id}/launch`);
  assert.equal(refused.status, 403); assert.equal(refused.j.limit, true); assert.match(refused.j.error, /no single ticket may reserve more than/);
  const still = (await api(`/api/missions/${w.j.id}`)).j; assert.equal(still.status, 'OPEN', 'the ticket is untouched');
  assert.equal((await api('/api/bootstrap')).j.workspace.reserved, before.reserved, 'nothing was reserved');
  const check = await post('/api/housecheck'); const row = check.j.rows.find((r) => r.id === 'limits'); assert.ok(row && /ticket ceiling/.test(row.detail), JSON.stringify(row));
  assert.equal((await api('/api/limits', { method: 'PUT', body: JSON.stringify({ ticketCeiling: null, dailyRuns: 0 }) })).status, 200);
  const byRuns = await post(`/api/missions/${w.j.id}/launch`);
  assert.equal(byRuns.status, 403); assert.match(byRuns.j.error, /run(s)? in any 24 hours/);
  assert.equal((await api('/api/limits', { method: 'PUT', body: JSON.stringify({ dailyRuns: null }) })).status, 200);
  assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200, 'with no limit it runs');
  const l = (await api('/api/limits')).j; assert.deepEqual(l.limits, { ticketCeiling: null, monthlySpend: null, dailyRuns: null });
  assert.ok(l.usage.runsToday >= 1);
});

test('the evidence check re-visits cited addresses and catches one that has gone', async () => {
  // A delivery that cites a public link: the link is revoked afterwards, so the
  // evidence it rested on is gone. The house should say so, not imply otherwise.
  const b = (await api('/api/bootstrap')).j;
  const art = b.artifacts[0];
  const share = await post(`/api/artifacts/${art.id}/share`); assert.equal(share.status, 200);
  const link = `${BASE}${share.j.path}`;
  if (!(await api('/api/bootstrap')).j.tools?.browser) await post('/api/tools/browser/toggle');
  const w = await post('/api/missions', { goal: `Evidence test: summarise ${link} and ${BASE}/legal/ai`, deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200);
  const cited = (w.j.sources || []).filter((s) => s.url);
  assert.equal(cited.length, 2, `both pages on the table: ${JSON.stringify((w.j.sources || []).map((s) => s.url))}`);
  const first = await post(`/api/missions/${w.j.id}/evidence`);
  assert.equal(first.status, 200); assert.equal(first.j.checked, 2); assert.equal(first.j.dead, 0, JSON.stringify(first.j.rows));
  assert.ok(first.j.rows.every((r) => /resolves \(200\)/.test(r.detail)), JSON.stringify(first.j.rows));
  assert.equal((await api(`/api/artifacts/${art.id}/share`, { method: 'DELETE' })).status, 200);
  const again = await post(`/api/missions/${w.j.id}/evidence`);
  assert.equal(again.j.dead, 1, JSON.stringify(again.j.rows));
  const goneRow = again.j.rows.find((r) => r.ok === false);
  assert.equal(goneRow.url, link); assert.match(goneRow.detail, /gone or refused \(404\)/);
  assert.equal((await api(`/api/missions/${w.j.id}`)).j.evidence.dead, 1, 'the finding is on the record');
});

test('house webhooks carry decisions, deliveries and refusals to an address of your own', async () => {
  const got = [];
  const sink = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => { got.push({ event: req.headers['x-prajna-event'], sig: req.headers['x-prajna-signature'], body: JSON.parse(body || '{}'), raw: body }); res.writeHead(204); res.end(); });
  });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  const sinkUrl = `http://127.0.0.1:${sink.address().port}/hook`;
  try {
    const bad = await api('/api/hooks', { method: 'PUT', body: JSON.stringify({ url: 'ftp://nope' }) });
    assert.equal(bad.status, 400);
    const set = await api('/api/hooks', { method: 'PUT', body: JSON.stringify({ url: sinkUrl, secret: 'house-secret' }) });
    assert.equal(set.status, 200); assert.equal(set.j.hooks.secretHeld, true);
    assert.ok(!JSON.stringify(set.j).includes('house-secret'), 'the secret never comes back');

    const t = await post('/api/hooks/test'); assert.equal(t.status, 200); assert.equal(t.j.ok, true);
    assert.equal(got.length, 1); assert.equal(got[0].event, 'housecheck.failed');
    const expect = `sha256=${crypto.createHmac('sha256', 'house-secret').update(got[0].raw).digest('hex')}`;
    assert.equal(got[0].sig, expect, 'the body is signed with the secret');

    assert.equal((await api('/api/limits', { method: 'PUT', body: JSON.stringify({ ticketCeiling: 1 }) })).status, 200);
    const w = await post('/api/missions', { goal: 'Webhook test: a brief for a Coorg homestay', deskId: 'brief', depth: 'fast' });
    assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 403);
    assert.equal((await api('/api/limits', { method: 'PUT', body: JSON.stringify({ ticketCeiling: null }) })).status, 200);
    const refused = got.find((g) => g.event === 'limit.refused');
    assert.ok(refused && refused.body.mission.serial === w.j.serial, JSON.stringify(got.map((g) => g.event)));
    assert.match(refused.body.reason, /no single ticket may reserve/);

    assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200);
    const started = Date.now(); let m;
    while (Date.now() - started < 120000) {
      m = (await api(`/api/missions/${w.j.id}`)).j;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${m.id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(m.status, 'FILLED');
    const delivered = got.find((g) => g.event === 'run.delivered' && g.body.mission.serial === w.j.serial);
    assert.ok(delivered, JSON.stringify(got.map((g) => g.event)));
    assert.ok(delivered.body.settled <= delivered.body.ceiling + 0.01);
    assert.ok(delivered.body.artifactId, 'the delivery names its artifact');

    const state = (await api('/api/hooks')).j.hooks;
    assert.ok(state.log.length >= 3 && state.log.every((l) => l.ok && l.signed), JSON.stringify(state.log.slice(0, 3)));
    assert.equal((await api('/api/hooks', { method: 'PUT', body: JSON.stringify({ url: '' }) })).status, 200);
    const quiet = got.length;
    await post('/api/hooks/test');
    assert.equal(got.length, quiet, 'with no address, nothing is sent');
  } finally { sink.close(); }
});

test('without a model, a brief is composed from the real sources, quoted and cited, never invented', async () => {
  if (!(await api('/api/bootstrap')).j.tools?.browser) await post('/api/tools/browser/toggle');
  const w = await post('/api/missions', { goal: `What do the house rules at ${BASE}/legal/terms and ${BASE}/legal/privacy say about data?`, deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200);
  assert.ok((w.j.sources || []).filter((s) => s.engine === 'page').length === 2, JSON.stringify((w.j.sources || []).map((s) => s.url)));
  assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200);
  const started = Date.now(); let m;
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${w.j.id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${m.id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
  assert.equal(m.authored?.composed, true, JSON.stringify(m.authored));
  assert.ok(m.authored.content.claims.length >= 2);
  const composedLog = (m.events || []).find((e) => e.label === 'compose');
  assert.ok(composedLog && /every claim is a quotation/.test(composedLog.detail), composedLog?.detail);

  const html = await (await fetch(`${BASE}/api/artifacts/${m.artifactId}/html`)).text();
  assert.match(html, /Composed run: no model was loaded/);
  assert.ok(!/Sector regulatory filing digest \(sample\)/.test(html), 'no scripted sample sources');
  assert.ok(!/The demand signal is real but younger than the headlines imply/.test(html), 'no scripted sample claims');
  // Every claim in the artifact must be text that actually appears in a source.
  for (const c of m.authored.content.claims) {
    const src = m.sources[c.src - 1];
    assert.ok(src, `claim points at a real source: ${JSON.stringify(c)}`);
    const quoted = c.text.replace(/…$/, '');
    assert.ok(src.extract.replace(/\s+/g, ' ').includes(quoted.slice(0, 60)), `the claim is quoted from ${src.title}: ${quoted.slice(0, 80)}`);
  }
  assert.match(m.authored.content.stand, /forms no judgement/);
});

test('without a model, an analysis reads the numbers you attached, not a sample series', async () => {
  const csv = 'quarter,subscribers,city\nQ1,410,Mysore\nQ2,455,Mysore\nQ3,520,Bengaluru\nQ4,610,Bengaluru\nQ5,640,Mysore\nQ6,700,Bengaluru';
  const c = await post('/api/chats', { title: 'Analysis test' });
  const r = await post(`/api/chats/${c.j.id}/messages`, { text: 'How are subscribers trending across the quarters?', mode: 'analysis', attachments: [{ name: 'subs.csv', text: csv }] });
  assert.equal(r.status, 200, JSON.stringify(r.j).slice(0, 200));
  const id = r.j.mission.id;
  const started = Date.now(); let m;
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
    await new Promise((x) => setTimeout(x, 400));
  }
  assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
  assert.equal(m.authored?.composed, true, JSON.stringify(m.authored));
  const read = m.authored.content.read;
  // Every figure must be arithmetic over the attached rows, not invented.
  assert.match(read, /subs\.csv holds 6 rows across 3 columns/);
  assert.match(read, /runs from 410 at Q1 to 700 at Q6, a change of \+70\.7%/);
  assert.match(read, /highest point is 700 at Q6 and the lowest 410 at Q1/);
  assert.match(read, /mean across 6 points is 555\.83 and they sum to 3,335/);
  assert.match(m.authored.content.segment, /Bengaluru is largest at 1,830, 54\.9%/);
  const html = await (await fetch(`${BASE}/api/artifacts/${m.artifactId}/html`)).text();
  assert.match(html, /Composed run: no model was loaded/);
  assert.ok(html.includes('subs.csv'), 'the artifact names the file it read');
  assert.ok(!/the trend is real, it is concentrated in a single segment/.test(html), 'no scripted sample read');
});

test('when the lead model refuses, the panel stands in and the artifact says so', async () => {
  // Two model endpoints of our own: the first refuses every call, the second
  // answers with a valid brief. The house must reach the second by itself.
  let asked = [];
  const seen = [];
  const good = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      asked.push('good');
      const prompt = JSON.parse(body).messages[0].content;
      seen.push(prompt);
      // The adviser critique and the revision that answers it, on the same endpoint.
      if (/CRITIQUE the draft/.test(prompt)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdict: 'revise', issues: ['The verdict hedges; state the recommendation outright.'] }) } }], usage: { prompt_tokens: 500, completion_tokens: 60 } }));
      }
      const brief = { stand: 'A stand-in model wrote this brief.', verdict: 'The recommendation is to proceed carefully, stated before the evidence, in two sentences. The panel stood in for the lead.',
        claims: [1, 2, 3].map((n) => ({ text: `Claim number ${n} written by the stand-in model.`, grade: 'B', detail: `Support for claim ${n}, one sentence long.`, src: 0, source: { title: `A source class described honestly for claim ${n}`, kind: 'analysis' } })),
        refuted: [], moves: [], tripwires: 'Commit further only if the first move clears.', dissent: { seat: 'an adviser', text: 'The adviser held that the pace is optimistic.' } };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 1200, completion_tokens: 340 } }));
    });
  });
  const bad = http.createServer((req, res) => { asked.push('bad'); res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"the provider is down"}'); });
  await new Promise((r) => good.listen(0, '127.0.0.1', r));
  await new Promise((r) => bad.listen(0, '127.0.0.1', r));
  try {
    assert.equal((await api('/api/keys/openai', { method: 'PUT', body: JSON.stringify({ key: 'sk-test-key', baseUrl: `http://127.0.0.1:${bad.address().port}/v1` }) })).status, 200);
    const leadModel = await post('/api/models', { name: 'Flaky Lead', provider: 'openai', modelId: 'flaky-1', baseUrl: `http://127.0.0.1:${bad.address().port}/v1` });
    const standIn = await post('/api/models', { name: 'Steady Adviser', provider: 'openai', modelId: 'steady-1', baseUrl: `http://127.0.0.1:${good.address().port}/v1` });
    assert.equal(leadModel.status, 200); assert.equal(standIn.status, 200);
    // Standing instructions must reach both the writer and the judge.
    assert.equal((await api('/api/housebrief', { method: 'PUT', body: JSON.stringify({ text: 'British English throughout. Name the customer before the product.' }) })).status, 200);
    const w = await post('/api/missions', { goal: 'Fallback test: should we open a second roastery in Mysore?', deskId: 'brief', depth: 'fast', lead: leadModel.j.id, advisers: [standIn.j.id] });
    assert.equal(w.status, 200, JSON.stringify(w.j));
    assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200);
    const started = Date.now(); let m;
    while (Date.now() - started < 120000) {
      m = (await api(`/api/missions/${w.j.id}`)).j;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${w.j.id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
    assert.equal(m.authored.live, true, JSON.stringify(m.authored).slice(0, 200));
    assert.equal(m.authored.model, 'Steady Adviser');
    assert.deepEqual(m.authored.steppedIn?.after, ['Flaky Lead']);
    assert.ok(asked.includes('bad') && asked.includes('good'), asked.join(','));
    const tape = (m.events || []).filter((e) => e.label === 'author').map((e) => e.detail);
    assert.ok(tape.some((d) => /Flaky Lead could not author/.test(d)), tape.join(' | '));
    assert.ok(tape.some((d) => /stepped in after Flaky Lead refused/.test(d)), tape.join(' | '));
    // The adviser asked for a revision, and the model that wrote the draft answered it.
    const authorPrompts = seen.filter((p) => !/CRITIQUE the draft/.test(p));
    const critiquePrompts = seen.filter((p) => /CRITIQUE the draft/.test(p));
    assert.ok(authorPrompts.every((p) => /Name the customer before the product/.test(p)), 'the writer was given the standing instructions');
    assert.ok(critiquePrompts.length && critiquePrompts.every((p) => /judge the draft against them too/.test(p)), 'the adviser judges against them too');
    assert.equal(m.houseBrief?.chars, 65, JSON.stringify(m.houseBrief));
    assert.equal((await api('/api/housebrief', { method: 'PUT', body: JSON.stringify({ text: '' }) })).status, 200);
    const critique = (m.critiques || []).find((c) => c.verdict === 'revise');
    assert.ok(critique, JSON.stringify(m.critiques));
    const revised = (m.events || []).find((e) => e.label === 'revise');
    assert.ok(revised && /Steady Adviser revised the draft on adviser critique/.test(revised.detail), revised?.detail);
    assert.ok(seen.some((p) => /REVISION REQUIRED/.test(p) && /The verdict hedges/.test(p)), 'the revision call carried the adviser\'s issue');
    assert.ok(m.keyUse.calls >= 3, `write, critique and revise are all counted: ${JSON.stringify(m.keyUse)}`);
    assert.ok(m.keyUse.models['Steady Adviser'].calls >= 2, JSON.stringify(m.keyUse.models));
    const html = await (await fetch(`${BASE}/api/artifacts/${m.artifactId}/html`)).text();
    assert.match(html, /standing in after Flaky Lead refused/);
    assert.match(html, /A stand-in model wrote this brief/);
    // What your own key was actually used for, counted from the provider's own numbers.
    // Exactly the three calls that happened: write (1200/340), critique
    // (500/60), revise (1200/340). Nothing double counted, nothing missed.
    assert.deepEqual({ calls: m.keyUse.calls, reported: m.keyUse.reported, prompt: m.keyUse.prompt, completion: m.keyUse.completion }, { calls: 3, reported: 3, prompt: 2900, completion: 740 }, JSON.stringify(m.keyUse));
    assert.match(html, /Your own key was called \d+ times? for this run, using [\d,]+ prompt and [\d,]+ completion tokens as reported by the provider itself/);
    assert.match(html, /the house does not guess a price/);
  } finally {
    await api('/api/keys/openai', { method: 'DELETE' });
    good.close(); bad.close();
  }
});

test('a delivery can leave as Word, and the house can read back what it wrote', async () => {
  const { extractText } = await import('../server/docs.js');
  const b = (await api('/api/bootstrap')).j;
  const a = b.artifacts.find((x) => x.missionId) || b.artifacts[0];
  const r = await fetch(`${BASE}/api/artifacts/${a.id}/docx`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /wordprocessingml\.document/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename=".*\.docx"/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'a real zip');
  const names = buf.toString('latin1');
  for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/numbering.xml', 'docProps/core.xml']) assert.ok(names.includes(part), part);
  // The Documents plugin reads .docx; the house reads back its own file.
  const text = extractText('delivery.docx', buf);
  assert.ok(text.includes(a.title.slice(0, 40)), `the title survives: ${text.slice(0, 120)}`);
  assert.ok(text.includes(a.serial), 'the serial is in the document');
  assert.match(text, /Provenance/);
  assert.match(text, /Written by Prajñā as mission/);
  assert.ok(text.length > 400, `real content, not an empty shell: ${text.length} chars`);
  assert.ok(!/<w:p>|<\/w:t>/.test(text), 'markup did not leak into the text');
  assert.equal((await fetch(`${BASE}/api/artifacts/nosuchid/docx`)).status, 404);
});

test('a deck can leave as PowerPoint, with every slide and the dissent intact', async () => {
  const { extractText } = await import('../server/docs.js');
  const b = (await api('/api/bootstrap')).j;
  const deck = b.artifacts.find((x) => /deck/i.test(x.kind) || /deck/i.test(x.title));
  assert.ok(deck, 'a delivered deck to export');
  const r = await fetch(`${BASE}/api/artifacts/${deck.id}/pptx`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /presentationml\.presentation/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'a real zip');
  const names = buf.toString('latin1');
  for (const part of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml']) assert.ok(names.includes(part), part);
  const text = extractText('deck.pptx', buf);
  const slides = text.split(/\nSlide \d+: /).filter(Boolean);
  assert.ok(slides.length >= 7, `every slide travels: ${slides.length}`);
  assert.ok(text.includes(deck.serial), 'the serial is on the deck');
  assert.match(text, /Provenance/);
  assert.ok(!/<a:t>|<\/p:sp>/.test(text), 'markup did not leak into the text');
  // A brief has no slides, so the house refuses rather than shipping an empty deck.
  const brief = b.artifacts.find((x) => /brief/i.test(x.kind) || /brief/i.test(x.title));
  if (brief) { const bad = await fetch(`${BASE}/api/artifacts/${brief.id}/pptx`); assert.equal(bad.status, 400); assert.match((await bad.json()).error, /no slides/); }
});

test('an analysis can leave as a workbook: the series, the segments and the arithmetic', async () => {
  const { extractText } = await import('../server/docs.js');
  const csv = 'quarter,subscribers,city\nQ1,410,Mysore\nQ2,455,Mysore\nQ3,520,Bengaluru\nQ4,610,Bengaluru\nQ5,640,Mysore\nQ6,700,Bengaluru';
  const c = await post('/api/chats', { title: 'Workbook test' });
  const r = await post(`/api/chats/${c.j.id}/messages`, { text: 'Where are subscribers heading?', mode: 'analysis', attachments: [{ name: 'subs.csv', text: csv }] });
  const id = r.j.mission.id;
  const started = Date.now(); let m;
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0]; await post(`/api/missions/${id}/attention/${a.id}`, { decision: pick, justification: `test run, ${pick}` }); } }
    await new Promise((x) => setTimeout(x, 400));
  }
  assert.equal(m.status, 'FILLED');
  const w = await fetch(`${BASE}/api/artifacts/${m.artifactId}/xlsx`);
  assert.equal(w.status, 200);
  assert.match(w.headers.get('content-type'), /spreadsheetml\.sheet/);
  const buf = Buffer.from(await w.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'a real zip');
  const names = buf.toString('latin1');
  for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml']) assert.ok(names.includes(part), part);
  assert.ok(names.includes('name="Series"') && names.includes('name="Segments"') && names.includes('name="Provenance"'), 'three sheets');
  const text = extractText('book.xlsx', buf);
  for (const label of ['quarter', 'subscribers', 'Q6', 'Count', 'Sum', 'Mean', 'city', 'Bengaluru', 'Provenance', 'Mission']) assert.ok(text.includes(label), `${label} is in the workbook`);
  // Numbers are numbers, not text: no figure is stored as a shared string,
  // though the read's prose may of course mention one.
  const shared = names.slice(names.indexOf('<sst'), names.indexOf('</sst>'));
  assert.ok(!/<t[^>]*>\s*555\.83\s*<\/t>/.test(shared), 'the mean is a number cell, not a string');
  assert.ok(!/<t[^>]*>\s*3335\s*<\/t>/.test(shared), 'the sum is a number cell, not a string');
  assert.match(names, /<v>555.83<\/v>/);
  assert.match(names, /<v>3335<\/v>/);
  const b = (await api('/api/bootstrap')).j;
  const noData = b.artifacts.find((x) => !x.hasData);
  if (noData) { const bad = await fetch(`${BASE}/api/artifacts/${noData.id}/xlsx`); assert.equal(bad.status, 400); assert.match((await bad.json()).error, /no data table/); }
  assert.equal(b.artifacts.find((x) => x.id === m.artifactId)?.hasData, true, 'the delivery is flagged as having data');
});

test('a shared delivery can be taken away, in the same formats, with no account', async () => {
  const b = (await api('/api/bootstrap')).j;
  const deck = b.artifacts.find((x) => /deck/i.test(x.kind) || /deck/i.test(x.title));
  const share = await post(`/api/artifacts/${deck.id}/share`); assert.equal(share.status, 200);
  const token = share.j.path.split('/').pop();
  // The shared page offers the formats it actually has.
  const page = await fetch(`${BASE}/s/${token}`); assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Shared delivery/);
  assert.ok(html.includes(`/s/${token}.docx`), 'Word offered');
  assert.ok(html.includes(`/s/${token}.pptx`), 'PowerPoint offered for a deck');
  assert.ok(!html.includes(`/s/${token}.xlsx`), 'no workbook offered without data');
  assert.ok(html.indexOf('Shared delivery') < html.indexOf('prajna.provenance'), 'the bar sits above the delivery, which is untouched');
  // Anyone with the link can take the file; no session, no key.
  for (const [kind, type] of [['docx', /wordprocessingml/], ['pptx', /presentationml/]]) {
    const r = await fetch(`${BASE}/s/${token}.${kind}`);
    assert.equal(r.status, 200, kind);
    assert.match(r.headers.get('content-type'), type);
    assert.match(r.headers.get('content-disposition'), /attachment; filename=".*\.(docx|pptx)"/);
    assert.equal(Buffer.from(await r.arrayBuffer()).readUInt32LE(0), 0x04034b50, `${kind} is a real file`);
  }
  assert.equal((await fetch(`${BASE}/s/${token}.xlsx`)).status, 404, 'a deck has no workbook');
  // Revoking the link takes the files with it.
  assert.equal((await api(`/api/artifacts/${deck.id}/share`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${BASE}/s/${token}.docx`)).status, 404);
  assert.equal((await fetch(`${BASE}/s/${token}`)).status, 404);
});

test('when the sweep finds nothing, the house offers a smaller ticket instead of charging for empty steps', async () => {
  // An encyclopedia of our own that knows nothing, so the sweep succeeds and
  // still returns no sources: the case the house must notice.
  const empty = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ query: { search: [] } })); });
  await new Promise((r) => empty.listen(0, '127.0.0.1', r));
  const port = empty.address().port;
  const child2 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT + 1), PRAJNA_DATA_DIR: DIR, PRAJNA_WIKI_BASE: `http://127.0.0.1:${port}/api.php` }, stdio: ['ignore', 'pipe', 'pipe'] });
  const B2 = `http://localhost:${PORT + 1}`;
  const j2 = async (p, o) => { const r = await fetch(B2 + p, { headers: { 'content-type': 'application/json' }, ...o }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B2}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const w = await j2('/api/missions', { method: 'POST', body: JSON.stringify({ goal: 'Ground test: should we enter the market for a thing nobody has written about?', deskId: 'brief' }) });
    assert.equal(w.status, 200);
    const dead = w.j.contract.plan.filter((p) => ['cite-guard', 'steelman'].includes(p.tool));
    assert.ok(dead.length >= 1, 'the deep plan has source-dependent steps');
    assert.equal((await j2(`/api/missions/${w.j.id}/launch`, { method: 'POST' })).status, 200);
    let m; const started = Date.now();
    while (Date.now() - started < 60000) {
      m = (await j2(`/api/missions/${w.j.id}`)).j;
      if ((m.attention || []).some((a) => a.kind === 'ground' && !a.decision)) break;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const ask = (m.attention || []).find((a) => a.kind === 'ground');
    assert.ok(ask, `the house asked about the empty ground: ${m.status}, ${JSON.stringify((m.events || []).slice(-2).map((e) => e.detail))}`);
    assert.match(ask.prompt, /The sweep found no sources/);
    assert.deepEqual(ask.options, ['amend-ticket', 'continue-as-stamped']);
    assert.equal(m.status, 'PAUSED_ATTENTION');
    const d = await j2(`/api/missions/${w.j.id}/attention/${ask.id}`, { method: 'POST', body: JSON.stringify({ decision: 'amend-ticket', justification: 'nothing to grade, so do not pay to grade it' }) });
    assert.equal(d.status, 200);
    const after = (await j2(`/api/missions/${w.j.id}`)).j;
    assert.equal(after.status, 'KILLED');
    assert.ok(after.amendedTo?.serial, 'the amended ticket is named on the record');
    const next = (await j2(`/api/missions/${after.amendedTo.id}`)).j;
    assert.equal(next.status, 'OPEN', 'the amended ticket waits to be stamped');
    assert.equal(next.contract.plan.filter((p) => ['cite-guard', 'steelman'].includes(p.tool)).length, 0, 'the empty steps are gone');
    assert.ok(next.contract.ceiling < w.j.contract.ceiling, `a smaller ceiling: ${next.contract.ceiling} vs ${w.j.contract.ceiling}`);
    assert.equal(next.lineage.parentId, w.j.id);
  } finally { child2.kill(); empty.close(); }
});

test('the house records who came through the door and says when the door is open', async () => {
  const legal = (await api('/api/legal')).j;
  const before = (await api('/api/bootstrap')).j.consentLog || [];
  assert.equal((await post('/api/consent', { accept: true, version: legal.version, name: 'A Second Person' })).status, 200);
  const b = (await api('/api/bootstrap')).j;
  assert.equal(b.openHouse, true, 'this test house has no access code');
  assert.ok(b.consentLog.length > before.length, 'the acceptance was appended, not overwritten');
  assert.equal(b.consentLog[0].name, 'A Second Person');
  assert.ok(b.consentLog[0].acceptedAt > 0 && b.consentLog[0].version === legal.version);
  // Acceptances accumulate: a second one does not erase the first.
  assert.equal((await post('/api/consent', { accept: true, version: legal.version, name: 'A Third Person' })).status, 200);
  const b2 = (await api('/api/bootstrap')).j;
  assert.equal(b2.consentLog[0].name, 'A Third Person');
  assert.equal(b2.consentLog[1].name, 'A Second Person');
  assert.equal(b2.consentLog.length, b.consentLog.length + 1);
  const c = await post('/api/housecheck');
  const door = c.j.rows.find((r) => r.id === 'door');
  assert.ok(door, 'the check has a door row');
  assert.equal(door.ok, false, 'an open door with more than one person is not ok');
  assert.match(door.detail, /different people have accepted|anyone with the address can enter/);
  assert.match(door.detail, /PRAJNA_ACCESS_CODE/);
});

test('a house that was already occupied does not claim nobody has entered', async () => {
  const { ws } = await import('../server/workspace.js');
  // Simulate the state a house upgraded from an older version is in: an
  // acceptance on file, and no log at all.
  const w = ws();
  const kept = w.consentLog;
  delete w.consentLog;
  w.consent = { version: '2026-09-04.2', acceptedAt: Date.now() - 3600000, name: 'The Earlier Occupant', ip: '203.0.113.7', agent: 'a browser' };
  const rebuilt = ws().consentLog;
  assert.equal(rebuilt.length, 1, 'the acceptance on file becomes the first line');
  assert.equal(rebuilt[0].name, 'The Earlier Occupant');
  w.consentLog = kept;
});

test('a claim citing a source that does not speak to it is caught at the gate', async () => {
  // A model that cites source [1] for something the page never mentions.
  const liar = http.createServer((req, res) => {
    const brief = { stand: 'A brief with a citation attached to the wrong evidence.', verdict: 'Proceed carefully. The recommendation is stated before the evidence, in two sentences.',
      claims: [1, 2, 3].map((n) => ({ text: `Photosynthesis in mangrove seedlings governs quarterly retention, finding ${n}.`, grade: 'B', detail: `Support ${n}.`, src: 1 })),
      refuted: [], moves: [], tripwires: 'Stop if the first move fails.', dissent: { seat: 'an adviser', text: 'The adviser doubted the pace.' } };
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })); });
  });
  await new Promise((r) => liar.listen(0, '127.0.0.1', r));
  try {
    assert.equal((await api('/api/keys/openai', { method: 'PUT', body: JSON.stringify({ key: 'sk-test-key', baseUrl: `http://127.0.0.1:${liar.address().port}/v1` }) })).status, 200);
    const model = await post('/api/models', { name: 'Confident Fabricator', provider: 'openai', modelId: 'fab-1', baseUrl: `http://127.0.0.1:${liar.address().port}/v1` });
    if (!(await api('/api/bootstrap')).j.tools?.browser) await post('/api/tools/browser/toggle');
    const w = await post('/api/missions', { goal: `Citation test: what do the rules at ${BASE}/legal/terms say?`, deskId: 'brief', depth: 'fast', lead: model.j.id, advisers: [] });
    assert.ok((w.j.sources || []).some((s) => s.engine === 'page'), 'a real page is on the table to cite');
    assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200);
    let m; const started = Date.now();
    while (Date.now() - started < 90000) {
      m = (await api(`/api/missions/${w.j.id}`)).j;
      if ((m.attention || []).some((a) => a.kind === 'gate' && !a.decision)) break;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const rows = (m.validations || []).flatMap((v) => v.rows);
    const caught = rows.find((r) => r.id === 'VAL-CLAIMS-SOURCE-SPEAKS' && r.lane === 'scrutiny' && !r.passed);
    assert.ok(caught, `the gate caught it: ${JSON.stringify(rows.map((r) => `${r.id}:${r.lane}:${r.passed}`))}`);
    assert.match(caught.detail, /rest on a source that does not speak to them/);
    assert.match(caught.detail, /photosynthesis|mangrove|seedlings/);
    const gate = (m.attention || []).find((a) => a.kind === 'gate');
    assert.ok(gate && /VAL-CLAIMS-SOURCE-SPEAKS/.test(gate.prompt), gate?.prompt);
    assert.equal(m.status, 'PAUSED_ATTENTION', 'the house stops rather than delivering it');
  } finally { await api('/api/keys/openai', { method: 'DELETE' }); liar.close(); }
});
