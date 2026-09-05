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
  // Its own data directory: two servers writing one directory would race, and
  // a suite that races is worth less than no suite at all.
  const DIR2 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-ground-'));
  const child2 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT + 1), PRAJNA_DATA_DIR: DIR2, PRAJNA_WIKI_BASE: `http://127.0.0.1:${port}/api.php` }, stdio: ['ignore', 'pipe', 'pipe'] });
  const B2 = `http://localhost:${PORT + 1}`;
  const j2 = async (p, o) => { const r = await fetch(B2 + p, { headers: { 'content-type': 'application/json' }, ...o }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B2}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = await (await fetch(`${B2}/api/legal`)).json();
    await j2('/api/consent', { method: 'POST', body: JSON.stringify({ accept: true, version: legal.version, name: 'Ground Test' }) });
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
  } finally { child2.kill(); empty.close(); fs.rmSync(DIR2, { recursive: true, force: true }); }
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
  // Everything this needs is local and deterministic: an encyclopedia that
  // returns one known article, and a model that cites it for something the
  // article never mentions. No live page read, no network, no timing luck.
  const wiki = http.createServer((req, res) => {
    const url = String(req.url || '');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (url.includes('list=search')) return res.end(JSON.stringify({ query: { search: [{ title: 'Kerala ferry subsidy', pageid: 4242 }] } }));
    res.end(JSON.stringify({ query: { pages: { 4242: { pageid: 4242, title: 'Kerala ferry subsidy', fullurl: 'https://example.org/ferry', extract: 'The Kerala ferry subsidy programme lowered fares on coastal routes and raised passenger numbers across the district.' } } } }));
  });
  const liar = http.createServer((req, res) => {
    const brief = { stand: 'A brief with a citation attached to the wrong evidence.', verdict: 'Proceed carefully. The recommendation is stated before the evidence, in two sentences.',
      claims: [1, 2, 3].map((n) => ({ text: `Photosynthesis in mangrove seedlings governs quarterly retention, finding ${n}.`, grade: 'B', detail: `Support ${n}.`, src: 1 })),
      refuted: [], moves: [], tripwires: 'Stop if the first move fails.', dissent: { seat: 'an adviser', text: 'The adviser doubted the pace.' } };
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })); });
  });
  await new Promise((r) => wiki.listen(0, '127.0.0.1', r));
  await new Promise((r) => liar.listen(0, '127.0.0.1', r));
  const DIR3 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-cite-'));
  const P3 = PORT + 2;
  const B3 = `http://localhost:${P3}`;
  const child3 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P3), PRAJNA_DATA_DIR: DIR3, PRAJNA_WIKI_BASE: `http://127.0.0.1:${wiki.address().port}/api.php` }, stdio: ['ignore', 'pipe', 'pipe'] });
  const j3 = async (p, o) => { const r = await fetch(B3 + p, { headers: { 'content-type': 'application/json' }, ...o }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B3}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await j3('/api/legal')).j;
    await j3('/api/consent', { method: 'POST', body: JSON.stringify({ accept: true, version: legal.version, name: 'Citation Test' }) });
    assert.equal((await j3('/api/keys/openai', { method: 'PUT', body: JSON.stringify({ key: 'sk-test-key', baseUrl: `http://127.0.0.1:${liar.address().port}/v1` }) })).status, 200);
    const model = await j3('/api/models', { method: 'POST', body: JSON.stringify({ name: 'Confident Fabricator', provider: 'openai', modelId: 'fab-1', baseUrl: `http://127.0.0.1:${liar.address().port}/v1` }) });
    const w = await j3('/api/missions', { method: 'POST', body: JSON.stringify({ goal: 'Citation test: did the ferry subsidy raise passenger numbers?', deskId: 'brief', depth: 'fast', lead: model.j.id, advisers: [] }) });
    assert.equal((await j3(`/api/missions/${w.j.id}/launch`, { method: 'POST' })).status, 200);
    let m; const started = Date.now();
    while (Date.now() - started < 120000) {
      m = (await j3(`/api/missions/${w.j.id}`)).j;
      if ((m.attention || []).some((a) => a.kind === 'gate' && !a.decision)) break;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      // Some serials are given a deliberate overrun, so answer anything that is
      // not the gate and let the run reach the gate, which is what is on trial.
      const other = (m.attention || []).find((a) => !a.decision && a.kind !== 'gate');
      if (other) {
        const pick = ['raise-ceiling', 'approve-step', 'approve', 'continue'].find((o) => other.options.includes(o)) || other.options[0];
        await j3(`/api/missions/${w.j.id}/attention/${other.id}`, { method: 'POST', body: JSON.stringify({ decision: pick, justification: `let the run reach the gate, ${pick}` }) });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok((m.sources || []).some((s) => s.engine === 'wikipedia'), `the article is on the table: ${JSON.stringify((m.sources || []).map((s) => s.engine))}`);
    const rows = (m.validations || []).flatMap((v) => v.rows);
    const caught = rows.find((r) => r.id === 'VAL-CLAIMS-SOURCE-SPEAKS' && r.lane === 'scrutiny' && !r.passed);
    assert.ok(caught, `the gate caught it: status ${m.status}, rows ${JSON.stringify(rows.map((r) => `${r.id}:${r.lane}:${r.passed}`))}`);
    assert.match(caught.detail, /rest on a source that does not speak to them/);
    assert.match(caught.detail, /photosynthesis|mangrove|seedlings/);
    const gate = (m.attention || []).find((a) => a.kind === 'gate');
    assert.ok(gate && /VAL-CLAIMS-SOURCE-SPEAKS/.test(gate.prompt), gate?.prompt);
    assert.equal(m.status, 'PAUSED_ATTENTION', 'the house stops rather than delivering it');
  } finally { child3.kill(); liar.close(); wiki.close(); fs.rmSync(DIR3, { recursive: true, force: true }); }
});

test('the pulse is cheap and moves only when the house does', async () => {
  const p1 = await api('/api/pulse');
  assert.equal(p1.status, 200);
  assert.equal(typeof p1.j.rev, 'number');
  assert.ok(JSON.stringify(p1.j).length < 120, `a pulse is small: ${JSON.stringify(p1.j)}`);
  const boot = await api('/api/bootstrap');
  assert.ok(JSON.stringify(boot.j).length > JSON.stringify(p1.j).length * 50, 'the workspace is far larger than a pulse');
  // Reading does not move the house on.
  const p2 = await api('/api/pulse');
  assert.equal(p2.j.rev, p1.j.rev, 'a read changes nothing');
  // Writing does.
  assert.equal((await api('/api/housebrief', { method: 'PUT', body: JSON.stringify({ text: 'A change that moves the house on.' }) })).status, 200);
  const p3 = await api('/api/pulse');
  assert.ok(p3.j.rev > p2.j.rev, `the revision moved: ${p2.j.rev} → ${p3.j.rev}`);
  assert.equal((await api('/api/housebrief', { method: 'PUT', body: JSON.stringify({ text: '' }) })).status, 200);
  // It also carries what a waiting tab needs to know without a full pull.
  assert.equal(typeof p3.j.pending, 'number');
  assert.equal(typeof p3.j.live, 'number');
});

test('the bootstrap carries what the lists read, not the whole memory of the house', async () => {
  const b = (await api('/api/bootstrap')).j;
  const m = b.missions.find((x) => x.status === 'FILLED' && x.artifactId);
  assert.ok(m, 'a delivered mission to inspect');
  // What the lists, boards, dashboard and compare view actually read.
  assert.ok(m.serial && m.status && m.deskName && typeof m.spent === 'number');
  assert.ok(m.contract?.plan?.length && m.contract.ceiling > 0, 'the plan and its ceiling travel');
  assert.ok(Array.isArray(m.contract.assertions), 'assertions travel for the compare view');
  assert.ok(Array.isArray(m.validations), 'validation rounds are countable');
  if (m.validations.length) assert.ok('cleared' in (m.validations[0].gate || {}), 'each round says whether the gate cleared');
  // What it must not carry: the tape, the rows, the substance, the extracts.
  assert.equal(m.events, undefined, 'no event tape in a list payload');
  assert.ok(!m.validations.some((v) => v.rows), 'no validator rows');
  assert.ok(!m.authored || !m.authored.content, 'no authored substance');
  assert.ok((m.sources || []).every((s) => !s.extract && !s.text), 'no source extracts');
  assert.ok(!m.contract.plan.some((p) => p.rationale), 'no per-step rationale');
  // The run page still gets everything when it asks for one mission.
  const full = (await api(`/api/missions/${m.id}`)).j;
  assert.ok(full.contract.plan.some((p) => p.rationale) || full.contract.why, 'the full mission carries the reasoning');
  if ((full.sources || []).length) assert.ok(full.sources.some((s) => s.extract), 'the full mission carries source extracts');
  assert.ok(JSON.stringify(m).length * 2 < JSON.stringify(full).length + 4000, `the list form is materially smaller: ${JSON.stringify(m).length} vs ${JSON.stringify(full).length}`);
});

test('nobody is greeted by name until they sign in, and signing out forgets them', async () => {
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const get = async (p, cookie) => { const r = await fetch(BASE + p, { headers: cookie ? { cookie } : {} }); return { r, j: await r.json().catch(() => ({})) }; };
  // A browser that has never been here is greeted by no name at all.
  const fresh = await get('/api/bootstrap');
  assert.equal(fresh.j.me, null, 'a stranger has no identity');
  // Signing in names this browser, and nobody else's.
  const signIn = await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }) });
  assert.equal(signIn.status, 200);
  const cookie = jar(signIn);
  assert.match(cookie, /prajna_who=/, 'an identity cookie was set');
  const mine = await get('/api/bootstrap', cookie);
  assert.equal(mine.j.me.name, 'Ada');
  assert.equal(mine.j.me.email, 'ada@example.com');
  const stranger = await get('/api/bootstrap');
  assert.equal(stranger.j.me, null, 'another browser still sees no name');
  // A forged or damaged cookie carries no identity.
  const forged = await get('/api/bootstrap', 'prajna_who=deadbeef.0000000000000000000000');
  assert.equal(forged.j.me, null, 'an unsigned identity is refused');
  // Signing out forgets this browser.
  const out = await fetch(`${BASE}/api/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(out.status, 200);
  const cleared = (out.headers.get('set-cookie') || '');
  assert.match(cleared, /prajna_who=;/, 'the identity cookie is cleared');
  assert.match(cleared, /prajna_session=;/, 'the access session is cleared too');
  // A name is required to sign in; nothing else is.
  assert.equal((await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '' }) })).status, 400);
  assert.equal((await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bo', email: 'not-an-email' }) })).status, 400);
});

test('the record says whose request it was and who decided', async () => {
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const signIn = async (name) => jar(await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
  const asker = await signIn('Rakhi');
  const decider = await signIn('Tomas');
  const call = async (p, cookie, body, method = 'POST') => { const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const w = await call('/api/missions', asker, { goal: 'Attribution test: a brief for a Coorg homestay', deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200);
  assert.equal(w.j.writtenBy?.name, 'Rakhi', 'the ticket names who asked for it');
  assert.equal((await call(`/api/missions/${w.j.id}/launch`, asker)).status, 200);
  let m; let decided = null; const started = Date.now();
  while (Date.now() - started < 120000) {
    m = (await api(`/api/missions/${w.j.id}`)).j;
    if (m.status === 'FILLED' || m.status === 'KILLED') break;
    if (m.status.startsWith('PAUSED')) {
      const a = (m.attention || []).find((x) => !x.decision);
      if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'continue', 'accept'].find((o) => a.options.includes(o)) || a.options[0];
        // A different person answers the question, from their own browser.
        await call(`/api/missions/${w.j.id}/attention/${a.id}`, decider, { decision: pick, justification: `answered by the second person, ${pick}` });
        decided = a.id; }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
  assert.equal(m.writtenBy.name, 'Rakhi');
  if (decided) {
    const answered = (m.attention || []).find((a) => a.id === decided);
    assert.equal(answered.decidedBy, 'Tomas', 'the decision names who made it, not who asked');
    const html = await (await fetch(`${BASE}/api/artifacts/${m.artifactId}/html`)).text();
    assert.match(html, /decided by Tomas/);
  }
  // Signed out, a ticket is simply unattributed rather than attributed to someone else.
  const anon = await post('/api/missions', { goal: 'Attribution test: an unsigned ticket', deskId: 'brief', depth: 'fast' });
  assert.equal(anon.j.writtenBy, null);
});

test('a conversation belongs to whoever started it', async () => {
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const signIn = async (name) => jar(await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
  const call = async (p, cookie, body, method = 'POST') => { const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const get = async (p, cookie) => call(p, cookie, null, 'GET');
  const mine = await signIn('Priya');
  const theirs = await signIn('Wes');
  // A chat nobody owns, started before anyone signed in, stays visible to all.
  const open = await call('/api/chats', null, { title: 'An open conversation' });
  const a = await call('/api/chats', mine, { title: 'Priya thinking aloud' });
  const b = await call('/api/chats', theirs, { title: 'Wes thinking aloud' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const titles = async (cookie) => (await get('/api/bootstrap', cookie)).j.chats.map((c) => c.title);
  const mineList = await titles(mine);
  assert.ok(mineList.includes('Priya thinking aloud'), 'I see my own');
  assert.ok(!mineList.includes('Wes thinking aloud'), 'I do not see theirs');
  assert.ok(mineList.includes('An open conversation'), 'an unowned conversation is visible');
  const theirList = await titles(theirs);
  assert.ok(theirList.includes('Wes thinking aloud') && !theirList.includes('Priya thinking aloud'));
  const anonList = await titles(null);
  assert.ok(anonList.includes('An open conversation') && !anonList.includes('Priya thinking aloud'), 'a signed-out visitor sees only what nobody owns');
  // Nor can they open it by its address, or write into it.
  assert.equal((await get(`/api/chats/${a.j.id}`, theirs)).status, 404);
  assert.equal((await get(`/api/chats/${a.j.id}`, mine)).status, 200);
  assert.equal((await call(`/api/chats/${a.j.id}/messages`, theirs, { text: 'reading over a shoulder' })).status, 404);
  const streamed = await fetch(`${BASE}/api/chats/${a.j.id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: theirs }, body: JSON.stringify({ text: 'and listening in' }) });
  assert.equal(streamed.status, 404, 'nor stream from it');
  // The missions and their artifacts stay shared: that is the house record.
  assert.ok((await get('/api/bootstrap', theirs)).j.missions.length > 0);
});

test('the house itself belongs to its own: a visitor can work, not dismantle', async () => {
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const signIn = async (name) => jar(await fetch(`${BASE}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
  const call = async (p, cookie, body, method = 'POST') => { const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const guest = await signIn('A Passing Guest');
  const boot = (await call('/api/bootstrap', guest, null, 'GET')).j;
  assert.ok(boot.owner?.name, 'the house names its own');
  assert.equal(boot.owner.mine, false, 'a guest is not the house');
  // Everything that changes the house itself is refused, in plain words.
  for (const [p, body, method] of [
    ['/api/erase', { confirm: 'ERASE' }, 'POST'],
    ['/api/limits', { ticketCeiling: 1 }, 'PUT'],
    ['/api/housebrief', { text: 'a guest rewriting the house style' }, 'PUT'],
    ['/api/hooks', { url: 'https://example.org/steal' }, 'PUT'],
    ['/api/backup', null, 'POST'],
    ['/api/keys/openai', { key: 'sk-a-guests-key' }, 'PUT'],
    ['/api/housecheck/repair', null, 'POST'],
  ]) {
    const r = await call(p, guest, body, method);
    assert.equal(r.status, 403, `${method} ${p} is refused`);
    assert.equal(r.j.owner, true);
    assert.match(r.j.error, /can do that: it changes the house itself/);
  }
  // Nothing the guest tried took effect.
  const after = (await call('/api/bootstrap', guest, null, 'GET')).j;
  assert.equal(after.limits.ticketCeiling, null, 'the limits are untouched');
  assert.equal(after.houseBrief, '', 'the house instructions are untouched');
  assert.equal(after.hooks.url, null, 'no address was set');
  assert.ok(after.missions.length > 3, 'the workspace was not erased');
  // But the work of the house is open to them.
  const w = await call('/api/missions', guest, { goal: 'A guest may still ask for a brief', deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200);
  assert.equal(w.j.writtenBy.name, 'A Passing Guest');
  assert.equal((await call('/api/housecheck', guest)).status, 200, 'and may still look at the house');
});

test('an owner can say what a guest may do, without locking the door', async () => {
  // Its own house, with the owner named by the environment, so both parts can
  // be played: the one who sets the policy and the one it binds.
  const DIR4 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-guests-'));
  const P4 = PORT + 3;
  const B4 = `http://localhost:${P4}`;
  const child4 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P4), PRAJNA_DATA_DIR: DIR4, PRAJNA_OWNER: 'Boss' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const call = async (p, cookie, body, method = 'POST') => { const r = await fetch(B4 + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})), r }; };
  const signIn = async (name) => jar((await call('/api/me', null, { name })).r);
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B4}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, null, 'GET')).j;
    await call('/api/consent', null, { accept: true, version: legal.version, name: 'Boss' });
    const boss = await signIn('Boss');
    const guest = await signIn('Sam');
    assert.equal((await call('/api/bootstrap', boss, null, 'GET')).j.owner.mine, true, 'the environment names the owner');
    assert.equal((await call('/api/bootstrap', guest, null, 'GET')).j.owner.mine, false);
    const refusedPolicy = await call('/api/guests', guest, { mode: 'read' }, 'PUT');
    assert.equal(refusedPolicy.status, 403, 'a guest cannot set the policy');
    assert.match(refusedPolicy.j.error, /held for “Boss” by its environment/, 'and is told exactly how the house is claimed');
    assert.match(refusedPolicy.j.error, /signed in as “Sam”/);

    // Work freely, the default.
    const free = await call('/api/missions', guest, { goal: 'Guests test: a brief', deskId: 'brief', depth: 'fast' });
    assert.equal(free.status, 200);
    assert.equal((await call(`/api/missions/${free.j.id}/launch`, guest)).status, 200, 'a guest may stamp while the house works freely');

    // Ask only: the guest may write and talk, but not spend.
    assert.equal((await call('/api/guests', boss, { mode: 'ask' }, 'PUT')).status, 200);
    const asked = await call('/api/missions', guest, { goal: 'Guests test: a ticket that waits', deskId: 'brief', depth: 'fast' });
    assert.equal(asked.status, 200, 'still allowed to ask');
    const refused = await call(`/api/missions/${asked.j.id}/launch`, guest);
    assert.equal(refused.status, 403);
    assert.match(refused.j.error, /Only Boss can stamp a ticket and spend/);
    assert.equal((await call(`/api/missions/${asked.j.id}`, guest, null, 'GET')).j.status, 'OPEN', 'the ticket waits, unstamped');
    assert.equal((await call(`/api/missions/${asked.j.id}/launch`, boss)).status, 200, 'and the owner can stamp it');
    assert.equal((await call('/api/chats', guest, { title: 'A guest may still talk' })).status, 200);

    // Read only: the record is open, nothing else.
    assert.equal((await call('/api/guests', boss, { mode: 'read' }, 'PUT')).status, 200);
    const shut = await call('/api/missions', guest, { goal: 'Guests test: refused', deskId: 'brief' });
    assert.equal(shut.status, 403);
    assert.match(shut.j.error, /open to read/);
    assert.equal((await call('/api/chats', guest, { title: 'nor talk' })).status, 403);
    // Nor anything else that spends the house's key or credits, or puts its
    // work in front of the world.
    const art = (await call('/api/bootstrap', guest, null, 'GET')).j.artifacts[0];
    for (const [p2, body, method] of [
      ['/api/media/generate', { prompt: 'a picture on someone else\'s key' }, 'POST'],
      [`/api/artifacts/${art.id}/share`, null, 'POST'],
      [`/api/artifacts/${art.id}/notes`, { text: 'a note on the record' }, 'POST'],
      ['/api/showcase', { artifactId: art.id }, 'POST'],
    ]) {
      const r = await call(p2, guest, body, method);
      assert.equal(r.status, 403, `${method} ${p2} is refused to a read-only guest`);
    }
    // The owner's money and mailbox are the owner's, whatever the guest policy.
    assert.equal((await call('/api/guests', boss, { mode: 'work' }, 'PUT')).status, 200);
    for (const p3 of ['/api/credits/topup', '/api/digest/send']) {
      const r = await call(p3, guest, { amount: 100 });
      assert.equal(r.status, 403, `${p3} is the owner's even when guests work freely`);
      assert.equal(r.j.owner, true);
    }
    assert.equal((await call('/api/guests', boss, { mode: 'read' }, 'PUT')).status, 200);
    assert.equal((await call('/api/bootstrap', guest, null, 'GET')).status, 200, 'but the record is still readable');
    assert.equal((await call('/api/missions', boss, { goal: 'Guests test: the owner is unbound', deskId: 'brief', depth: 'fast' })).status, 200);
    assert.equal((await call('/api/guests', boss, { mode: 'nonsense' }, 'PUT')).status, 400);
  } finally { child4.kill(); fs.rmSync(DIR4, { recursive: true, force: true }); }
});

test('every desk delivers with a live model, not just the research desk', async () => {
  // One house, one model endpoint that answers in each desk's own shape. If a
  // desk's generator cannot take what its author returns, this finds it.
  const DRAFTS = {
    brief: { stand: 'A live stance for the lede.', verdict: 'Proceed with a narrow first move. The recommendation is stated before the evidence.',
      claims: [1, 2, 3].map((n) => ({ text: `Live claim ${n} about the coastal ferry programme.`, grade: 'B', detail: `Support ${n}.`, src: 0, source: { title: `Source class ${n}`, kind: 'analysis' } })),
      refuted: [], moves: [{ move: 'A first move', commitment: 'small', signal: 'weekly numbers' }], tripwires: 'Stop if the signal does not appear.', dissent: { seat: 'an adviser', text: 'The pace is optimistic.' } },
    deck: { sub: 'The argument in six beats.', one: 'The whole case in one sentence.', close: 'End on the claim.',
      slides: ['The problem', 'The shift', 'The mechanism', 'The proof', 'The economics', 'The ask'].map((n, i) => ({ n, h: `Headline ${i + 1}`, s: `One supporting line for ${n.toLowerCase()}.` })) },
    site: { brand: 'Ferry Works', headline: 'Get across the water faster', sub: 'A landing page written live for the test.', primary: 'Book a crossing', secondary: 'See timetables', strip: 'Serving four districts',
      why: [1, 2, 3].map((n) => ({ k: `Kicker ${n}`, h: `Heading ${n}`, p: `Thirty words or fewer about reason ${n}.` })), closing: { h: 'Ready when you are', cta: 'Start' } },
    mobile: { short: 'Ferry', screens: [1, 2, 3, 4].map((n) => ({ tab: `Tab${n}`, title: `Screen ${n}`, body: `What screen ${n} is for.`, items: [1, 2, 3].map((i) => ({ b: `Item ${i}`, s: `Context for item ${i}.` })), cta: `Action ${n}` })) },
    analysis: { read: 'A live read of what the numbers would need to show.', trend: 'Twelve periods of the series', segment: 'The segment breakdown', caveat: 'The series is sample data until a connector supplies real numbers.' },
  };
  const DIR5 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-desks-'));
  const P5 = PORT + 4;
  const B5 = `http://localhost:${P5}`;
  let desk = 'brief';
  const model = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const prompt = JSON.parse(body).messages[0].content;
      const payload = /CRITIQUE the draft/.test(prompt) ? { verdict: 'pass', issues: [] } : DRAFTS[desk];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  const child5 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P5), PRAJNA_DATA_DIR: DIR5, PRAJNA_OWNER: 'Desk Test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cookie = '';
  const call = async (p, body, method = 'POST') => { const r = await fetch(B5 + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); if (!cookie) { const set = r.headers.get('set-cookie') || ''; if (set.includes('prajna_who=')) cookie = set.split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; '); } return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B5}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, 'GET')).j;
    await call('/api/consent', { accept: true, version: legal.version, name: 'Desk Test' });
    // The environment names the owner, so the test must be that person.
    assert.equal((await call('/api/me', { name: 'Desk Test' })).status, 200);
    assert.equal((await call('/api/bootstrap', null, 'GET')).j.owner.mine, true, 'signed in as the house');
    assert.equal((await call('/api/keys/openai', { key: 'sk-test-key', baseUrl: `http://127.0.0.1:${model.address().port}/v1` }, 'PUT')).status, 200);
    const lead = (await call('/api/models', { name: 'Desk Model', provider: 'openai', modelId: 'desk-1', baseUrl: `http://127.0.0.1:${model.address().port}/v1` })).j;
    for (const [id, deskId] of [['brief', 'brief'], ['deck', 'deck'], ['site', 'site'], ['mobile', 'mobile'], ['analysis', 'analysis']]) {
      desk = id;
      const w = await call('/api/missions', { goal: `Live desk test: a ${id} for a Kochi ferry startup`, deskId, depth: 'fast', lead: lead.id, advisers: [] });
      assert.equal(w.status, 200, `${id} ticket: ${JSON.stringify(w.j)}`);
      assert.equal((await call(`/api/missions/${w.j.id}/launch`)).status, 200, `${id} launch`);
      let m; const started = Date.now();
      while (Date.now() - started < 120000) {
        m = (await call(`/api/missions/${w.j.id}`, null, 'GET')).j;
        if (m.status === 'FILLED' || m.status === 'KILLED') break;
        if (m.status.startsWith('PAUSED')) {
          const a = (m.attention || []).find((x) => !x.decision);
          if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'accept-risk', 'continue'].find((o) => a.options.includes(o)) || a.options[0];
            await call(`/api/missions/${w.j.id}/attention/${a.id}`, { decision: pick, justification: `desk test, ${pick}` }); }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      assert.equal(m.status, 'FILLED', `${id} delivered (ended ${m.status})`);
      assert.equal(m.authored?.live, true, `${id} was written by the model: ${JSON.stringify(m.authored).slice(0, 160)}`);
      const html = await (await fetch(`${B5}/api/artifacts/${m.artifactId}/html`)).text();
      assert.match(html, /Live run: the substance of this deliverable was written by Desk Model/, `${id} provenance says live`);
      // The model's own words must actually be in the delivery.
      const marker = { brief: 'Live claim 1 about the coastal ferry programme', deck: 'The whole case in one sentence', site: 'Get across the water faster', mobile: 'What screen 1 is for', analysis: 'A live read of what the numbers would need to show' }[id];
      assert.ok(html.includes(marker), `${id} carries what the model wrote: looked for “${marker}”`);
    }
  } finally { child5.kill(); model.close(); fs.rmSync(DIR5, { recursive: true, force: true }); }
});

test('the substance is written in the open, and the count survives the streaming', async () => {
  // A model that streams its answer in pieces, the way a real one does.
  const draft = { stand: 'Written in the open.', verdict: 'Proceed narrowly. The recommendation is stated before the evidence, in two sentences.',
    claims: [1, 2, 3].map((n) => ({ text: `Streamed claim ${n} about the ferry programme.`, grade: 'B', detail: `Support ${n}.`, src: 0, source: { title: `Source class ${n}`, kind: 'analysis' } })),
    refuted: [], moves: [], tripwires: 'Stop if the signal does not appear.', dissent: { seat: 'an adviser', text: 'The pace is optimistic.' } };
  const model = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const text = JSON.stringify(draft);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (let i = 0; i < text.length; i += 40) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 40) } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 700, completion_tokens: 250 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  const DIR6 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-write-'));
  const P6 = PORT + 5;
  const B6 = `http://localhost:${P6}`;
  const child6 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P6), PRAJNA_DATA_DIR: DIR6 }, stdio: ['ignore', 'pipe', 'pipe'] });
  const call = async (p, body, method = 'POST') => { const r = await fetch(B6 + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B6}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, 'GET')).j;
    await call('/api/consent', { accept: true, version: legal.version, name: 'Writer Test' });
    assert.equal((await call('/api/keys/openai', { key: 'sk-test-key', baseUrl: `http://127.0.0.1:${model.address().port}/v1` }, 'PUT')).status, 200);
    const lead = (await call('/api/models', { name: 'Streaming Model', provider: 'openai', modelId: 'stream-1', baseUrl: `http://127.0.0.1:${model.address().port}/v1` })).j;
    const w = await call('/api/missions', { goal: 'Streaming test: a brief for a Kochi ferry startup', deskId: 'brief', depth: 'fast', lead: lead.id, advisers: [] });
    // Watch the tape while it runs: the writing must appear as it happens.
    const seen = [];
    const es = await fetch(`${B6}/api/missions/${w.j.id}/stream`);
    const reader = es.body.getReader();
    const readAll = (async () => {
      const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const block of buf.split('\n\n')) { const line = block.split('\n').find((l) => l.startsWith('data: ')); if (line) { try { seen.push(JSON.parse(line.slice(6))); } catch { /* partial */ } } }
        buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
      }
    })();
    assert.equal((await call(`/api/missions/${w.j.id}/launch`)).status, 200);
    let m; const started = Date.now();
    while (Date.now() - started < 120000) {
      m = (await call(`/api/missions/${w.j.id}`, null, 'GET')).j;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['patch', 'raise-ceiling', 'approve', 'accept-risk', 'continue'].find((o) => a.options.includes(o)) || a.options[0]; await call(`/api/missions/${w.j.id}/attention/${a.id}`, { decision: pick, justification: `streaming test, ${pick}` }); } }
      await new Promise((r) => setTimeout(r, 300));
    }
    reader.cancel().catch(() => {}); await readAll.catch(() => {});
    assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
    assert.equal(m.authored.live, true);
    const writing = seen.filter((e) => e.type === 'author.writing');
    assert.ok(writing.length >= 2, `the writing was watched: ${writing.length} print(s)`);
    assert.ok(writing.some((e) => e.tail && /Streamed claim/.test(e.tail)), 'the tail shows what is being written');
    assert.ok(writing.some((e) => e.done), 'and says when it is finished');
    assert.ok(writing.at(-1).chars > 200, 'the count grows to the length of the draft');
    // The tape is a record, not a transcript: none of it is persisted.
    assert.ok(!(m.events || []).some((e) => e.type === 'author.writing'), 'the writing is not kept on the ledger');
    // And the provider's own count survived the streaming path.
    assert.deepEqual({ prompt: m.keyUse.prompt, completion: m.keyUse.completion }, { prompt: 700, completion: 250 }, JSON.stringify(m.keyUse));
  } finally { child6.kill(); model.close(); fs.rmSync(DIR6, { recursive: true, force: true }); }
});

test('a ticket says what this kind of work has actually cost here', async () => {
  const b = (await api('/api/bootstrap')).j;
  const delivered = b.missions.filter((m) => m.status === 'FILLED' && (m.settlement?.settled ?? m.spent) > 0);
  const desk = 'brief';
  const w = await post('/api/missions', { goal: 'History test: a brief for a Coorg homestay', deskId: desk, depth: 'fast' });
  assert.equal(w.status, 200);
  const full = (await api(`/api/missions/${w.j.id}`)).j;
  assert.ok(full.history, 'the ticket carries the house\'s own past');
  const mine = delivered.filter((m) => m.desk === desk);
  if (mine.length < 3) {
    assert.equal(full.history.enough, false);
    assert.match(full.history.line, /too few to say what it usually costs/);
  } else {
    assert.equal(full.history.enough, true);
    // Every figure must be arithmetic over the record, not a guess.
    const pool = mine.filter((m) => (full.history.like ? m.depth === 'fast' : true));
    const costs = pool.map((m) => m.settlement?.settled ?? m.spent);
    assert.equal(full.history.n, pool.length);
    assert.equal(full.history.low, Math.round(Math.min(...costs) * 10) / 10);
    assert.equal(full.history.high, Math.round(Math.max(...costs) * 10) / 10);
    assert.ok(full.history.median >= full.history.low && full.history.median <= full.history.high);
    assert.match(full.history.line, /settled between [\d.]+ and [\d.]+ credits, median [\d.]+/);
    assert.match(full.history.line, /This ticket estimates \d+/);
    assert.ok(!full.history.line.includes('NaN'));
  }
  // A mission never counts itself.
  const again = (await api(`/api/missions/${w.j.id}`)).j;
  assert.equal(again.history.n, full.history.n);
  // And the same figures are available on their own.
  const route = await api(`/api/history?desk=${desk}&depth=fast&estimate=40`);
  assert.equal(route.status, 200);
  assert.equal(route.j.desk, desk);
  assert.equal(typeof route.j.line, 'string');
  const empty = await api('/api/history?desk=nosuchdesk');
  assert.equal(empty.j.enough, false, 'a desk with no history says so');
});

test('the ceiling is set by what this work has really cost, not by the table alone', async () => {
  const w = await post('/api/missions', { goal: 'Ceiling test: a fast brief for a Coorg homestay', deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200);
  const from = w.j.contract.ceilingFrom;
  assert.ok(from, 'a ticket says where its ceiling came from');
  const table = Math.ceil(w.j.contract.estimate * 1.25);
  if (from.from === 'history') {
    // The reservation must cover what this kind has actually reached.
    assert.ok(from.n >= 5, 'a ceiling is only moved on real evidence');
    assert.ok(w.j.contract.ceiling >= from.high, `the ceiling covers the highest that settled: ${w.j.contract.ceiling} vs ${from.high}`);
    assert.ok(w.j.contract.ceiling > table, 'and it is more room than the table gave');
    assert.equal(from.table, table);
    // Ask this house, not the one this test process happens to sit in.
    const narrow = (await api('/api/history?desk=brief&depth=fast')).j;
    const wide = (await api('/api/history?desk=brief')).j;
    assert.ok([narrow.high, wide.high].includes(from.high), `the figure is one this house's record holds: ${from.high} vs ${narrow.high}/${wide.high}`);
  } else {
    assert.equal(w.j.contract.ceiling, table, 'without evidence the table stands');
  }
  // The estimate is never touched: only the room around it.
  assert.equal(w.j.contract.estimate, Math.round(w.j.contract.plan.reduce((a, p) => a + p.cost, 0) * 10) / 10);
  // A run that stays inside its ceiling releases the rest, so a wider ceiling
  // costs nothing: that is why raising it on evidence is safe.
  const filled = (await api('/api/bootstrap')).j.missions.find((m) => m.status === 'FILLED' && m.settlement);
  if (filled) assert.equal(Math.round((filled.settlement.settled + filled.settlement.released) * 10) / 10, Math.round(filled.settlement.reserved * 10) / 10);
});

test('a delivery reaches a connected app, behind approval, with a link the house checks', async () => {
  // A Slack of our own: it lists a channel, accepts a post, and remembers it.
  const posted = [];
  const slack = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url.startsWith('/api/conversations.list')) return res.end(JSON.stringify({ ok: true, channels: [{ id: 'C-HOUSE', name: 'deliveries', is_member: true }] }));
      if (req.url.startsWith('/api/chat.postMessage')) { const j = JSON.parse(body || '{}'); posted.push(j); return res.end(JSON.stringify({ ok: true, ts: `ts-${posted.length}`, permalink: `https://slack.example/${posted.length}` })); }
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => slack.listen(0, '127.0.0.1', r));
  const DIR7 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-deliver-'));
  const P7 = PORT + 6;
  const B7 = `http://localhost:${P7}`;
  const child7 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P7), PRAJNA_DATA_DIR: DIR7, PRAJNA_PUBLIC_URL: B7,
    PRAJNA_API_BASE_SLACK: `http://127.0.0.1:${slack.address().port}`,
    PRAJNA_TEST_TOKENS: JSON.stringify({ slack: { token: 'xoxb-test', account: 'the test workspace' } }) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const call = async (p, body, method = 'POST') => { const r = await fetch(B7 + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B7}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, 'GET')).j;
    await call('/api/consent', { accept: true, version: legal.version, name: 'Delivery Test' });
    const boot = (await call('/api/bootstrap', null, 'GET')).j;
    assert.ok(boot.connectors.find((c) => c.id === 'slack')?.connected, 'the house holds a live Slack token');
    const w = await call('/api/missions', { goal: 'Delivery test: a brief for a Kochi ferry startup', deskId: 'brief', depth: 'fast' });
    assert.ok(w.j.contract.plan.some((p) => p.tool === 'connector-post'), 'the plan carries a delivery step');
    assert.equal((await call(`/api/missions/${w.j.id}/launch`)).status, 200);
    let m, approvals = 0; const started = Date.now();
    while (Date.now() - started < 120000) {
      m = (await call(`/api/missions/${w.j.id}`, null, 'GET')).j;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      if (m.status.startsWith('PAUSED')) {
        const a = (m.attention || []).find((x) => !x.decision);
        if (a) {
          if (a.kind === 'approval') { approvals += 1; assert.match(a.prompt, /Slack|deliver|public link/i); }
          const pick = ['approve-step', 'approve', 'patch', 'raise-ceiling', 'accept-risk', 'continue'].find((o) => a.options.includes(o)) || a.options[0];
          await call(`/api/missions/${w.j.id}/attention/${a.id}`, { decision: pick, justification: `delivery test, ${pick}` });
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(m.status, 'FILLED', `run ended ${m.status}`);
    assert.ok(approvals >= 1, 'nothing left the house without an approval');
    // It really posted, and what it posted carries a public link that works.
    assert.equal(posted.length, 1, `one post: ${JSON.stringify(posted)}`);
    assert.equal(posted[0].channel, 'C-HOUSE');
    const link = (posted[0].text.match(/https?:\/\/\S+\/s\/[a-f0-9]{32}/) || [])[0];
    assert.ok(link, `the post carries the public link: ${posted[0].text.slice(0, 200)}`);
    assert.equal((await fetch(link)).status, 200, 'and the link opens');
    const d = (m.deliveries || [])[0];
    assert.ok(d && d.ok, `the delivery is on the record: ${JSON.stringify(m.deliveries)}`);
    assert.equal(d.connector, 'slack');
    assert.equal(d.linkOk, true, 'the house checked its own link before calling it delivered');
    assert.match(d.where, /Slack C-HOUSE/);
    // Revoking the link is on the record too, and the link stops working.
    const token = link.split('/s/')[1];
    const art = (await call('/api/bootstrap', null, 'GET')).j.artifacts.find((a) => a.shareToken === token);
    assert.ok(art, 'the shared artifact is findable by its token');
    assert.equal((await call(`/api/artifacts/${art.id}/share`, null, 'DELETE')).status, 200);
    assert.equal((await fetch(link)).status, 404, 'a revoked link is gone');
  } finally { child7.kill(); slack.close(); fs.rmSync(DIR7, { recursive: true, force: true }); }
});

test('a delivery can be taken further, and the next ticket argues from it', async () => {
  const b = (await api('/api/bootstrap')).j;
  const from = b.missions.find((m) => m.status === 'FILLED' && m.artifactId && m.desk === 'brief');
  assert.ok(from, 'a delivered brief to build on');
  const next = await post(`/api/missions/${from.id}/next`, { deskId: 'deck', depth: 'fast' });
  assert.equal(next.status, 200, JSON.stringify(next.j).slice(0, 200));
  assert.equal(next.j.desk, 'deck');
  assert.equal(next.j.status, 'OPEN', 'it is a ticket, not a run: nothing spent until you stamp it');
  assert.equal(next.j.from.serial, from.serial, 'it says what it came from');
  // The earlier delivery is on the table as an owner source, not a retelling.
  const src = (next.j.sources || []).find((s) => s.engine === 'attachment');
  assert.ok(src, `the delivery is on the table: ${JSON.stringify((next.j.sources || []).map((s) => s.engine))}`);
  assert.match(src.title, new RegExp(from.serial));
  assert.ok(src.extract.length > 200, 'with its text, so the next desk can argue from it');
  const html = await (await fetch(`${BASE}/api/artifacts/${from.artifactId}/html`)).text();
  // A word from the delivery's own prose, not from the stylesheet inside it.
  const prose = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const word = (prose.match(/[A-Za-z]{9,}/g) || [])[3];
  assert.ok(word, 'the delivery has prose to carry');
  assert.ok(src.extract.includes(word), `the text is the delivery's own: looked for “${word}”`);
  assert.ok(next.j.attachments?.some((a) => a.name.includes(from.serial)), 'the ticket lists it');
  // Only a delivered mission can be taken further.
  const open = await post('/api/missions', { goal: 'Further test: an unstamped ticket', deskId: 'brief', depth: 'fast' });
  const refused = await post(`/api/missions/${open.j.id}/next`, { deskId: 'deck' });
  assert.equal(refused.status, 400);
  assert.match(refused.j.error, /Only a delivered mission/);
  assert.equal((await post(`/api/missions/${from.id}/next`, { deskId: 'nosuchdesk' })).status, 400);
});

test('the weekly review says how the house is doing, against the week before', async () => {
  const r = await api('/api/review');
  assert.equal(r.status, 200);
  assert.equal(r.j.weeks, 1);
  assert.ok(r.j.now && r.j.before, 'both periods are counted');
  assert.match(r.j.text, /^Prajñā weekly review: \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
  // Every figure must be arithmetic over the record for that window.
  const b = (await api('/api/bootstrap')).j;
  const since = Date.now() - 7 * 86400000;
  const inWindow = b.missions.filter((m) => (m.filledAt || m.launchedAt || m.createdAt || 0) >= since);
  assert.equal(r.j.now.started, inWindow.length);
  assert.equal(r.j.now.delivered, inWindow.filter((m) => m.status === 'FILLED').length);
  const costs = inWindow.filter((m) => m.status === 'FILLED').map((m) => m.settlement?.settled ?? m.spent);
  assert.equal(r.j.now.settled, Math.round(costs.reduce((a, c) => a + c, 0) * 10) / 10);
  if (r.j.now.gated) assert.equal(r.j.now.firstTimeRate, Math.round((r.j.now.firstTime / r.j.now.gated) * 100));
  assert.ok(!r.j.text.includes('NaN') && !r.j.text.includes('undefined'), r.j.text.slice(0, 200));
  // A week with nothing before it is not compared with silence.
  if (r.j.before.started === 0) assert.match(r.j.text, /nothing yet to compare against/);
  else assert.match(r.j.text, /set beside the week before it/);
  const four = await api('/api/review?weeks=4');
  assert.equal(four.j.weeks, 4);
  assert.ok(four.j.now.started >= r.j.now.started, 'a longer window holds at least as much');
  assert.equal((await api('/api/review?weeks=99')).j.weeks, 8, 'the window is bounded');
});

test('a reader can see what each claim rests on, in the delivery itself', async () => {
  // A model that cites well and a model that cites badly, against the same
  // known article, so the delivery has to show the difference.
  const article = 'The Kerala ferry subsidy programme lowered fares on coastal routes and raised passenger numbers across the district.';
  const wiki = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (String(req.url).includes('list=search')) return res.end(JSON.stringify({ query: { search: [{ title: 'Kerala ferry subsidy', pageid: 7 }] } }));
    res.end(JSON.stringify({ query: { pages: { 7: { pageid: 7, title: 'Kerala ferry subsidy', fullurl: 'https://example.org/ferry', extract: article } } } }));
  });
  let honest = true;
  const model = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const good = { text: 'The ferry subsidy raised passenger numbers on coastal routes.', grade: 'B', detail: 'Support.', src: 1 };
      const bad = { text: 'Photosynthesis in mangrove seedlings governs quarterly retention.', grade: 'B', detail: 'Support.', src: 1 };
      const claim = honest ? good : bad;
      const draft = { stand: 'A brief.', verdict: 'Proceed narrowly. Stated before the evidence, in two sentences.',
        claims: [1, 2, 3].map((n) => ({ ...claim, text: `${claim.text} (${n})` })), refuted: [], moves: [], tripwires: 'Stop if it fails.', dissent: { seat: 'an adviser', text: 'Doubted the pace.' } };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(/CRITIQUE the draft/.test(JSON.parse(body).messages[0].content) ? { verdict: 'pass', issues: [] } : draft) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise((r) => wiki.listen(0, '127.0.0.1', r));
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  const DIR8 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-cites-'));
  const P8 = PORT + 7;
  const B8 = `http://localhost:${P8}`;
  const child8 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P8), PRAJNA_DATA_DIR: DIR8, PRAJNA_WIKI_BASE: `http://127.0.0.1:${wiki.address().port}/api.php` }, stdio: ['ignore', 'pipe', 'pipe'] });
  const call = async (p, body, method = 'POST') => { const r = await fetch(B8 + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const runOne = async (lead) => {
    const w = await call('/api/missions', { goal: 'Citation view: did the ferry subsidy raise passenger numbers?', deskId: 'brief', depth: 'fast', lead, advisers: [] });
    await call(`/api/missions/${w.j.id}/launch`);
    let m; const started = Date.now();
    while (Date.now() - started < 120000) {
      m = (await call(`/api/missions/${w.j.id}`, null, 'GET')).j;
      if (m.status === 'FILLED' || m.status === 'KILLED') break;
      if (m.status.startsWith('PAUSED')) { const a = (m.attention || []).find((x) => !x.decision); if (a) { const pick = ['accept-risk', 'raise-ceiling', 'approve', 'continue'].find((o) => a.options.includes(o)) || a.options[0]; await call(`/api/missions/${w.j.id}/attention/${a.id}`, { decision: pick, justification: `citation view test, ${pick}` }); } }
      await new Promise((r) => setTimeout(r, 300));
    }
    return m;
  };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B8}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, 'GET')).j;
    await call('/api/consent', { accept: true, version: legal.version, name: 'Citations' });
    await call('/api/keys/openai', { key: 'sk-test-key', baseUrl: `http://127.0.0.1:${model.address().port}/v1` }, 'PUT');
    const lead = (await call('/api/models', { name: 'Citing Model', provider: 'openai', modelId: 'cite-1', baseUrl: `http://127.0.0.1:${model.address().port}/v1` })).j;

    const good = await runOne(lead.id);
    assert.equal(good.status, 'FILLED');
    assert.ok(good.citations?.length, 'the check is kept on the record');
    assert.ok(good.citations.every((c) => c.shared?.length), JSON.stringify(good.citations));
    const goodHtml = await (await fetch(`${B8}/api/artifacts/${good.artifactId}/html`)).text();
    assert.match(goodHtml, /rests on Kerala ferry subsidy, which uses/);
    assert.match(goodHtml, /<em>passenger<\/em>|<em>subsidy<\/em>|<em>coastal<\/em>/);
    assert.ok(!goodHtml.includes('does not mention'), 'a supported claim is not flagged');

    honest = false;
    const bad = await runOne(lead.id);
    assert.equal(bad.status, 'FILLED', 'accepted on the record after the gate was answered');
    const badHtml = await (await fetch(`${B8}/api/artifacts/${bad.artifactId}/html`)).text();
    assert.match(badHtml, /the source named here does not mention/, 'the delivery admits what the check found');
    assert.match(badHtml, /photosynthesis|mangrove|seedlings/);
  } finally { child8.kill(); model.close(); wiki.close(); fs.rmSync(DIR8, { recursive: true, force: true }); }
});

test('the house says when a restart has taken its keys', async () => {
  // Its own house: holding and dropping keys is the owner's business, and
  // dropping one is exactly what a restart does.
  const DIR9 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-keys-'));
  const P9 = PORT + 8;
  const B9 = `http://localhost:${P9}`;
  const child9 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P9), PRAJNA_DATA_DIR: DIR9 }, stdio: ['ignore', 'pipe', 'pipe'] });
  const call = async (p, body, method = 'POST') => { const r = await fetch(B9 + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const keysRow = async () => (await call('/api/housecheck')).j.rows.find((r) => r.id === 'keys');
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B9}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const legal = (await call('/api/legal', null, 'GET')).j;
    await call('/api/consent', { accept: true, version: legal.version, name: 'Keys Test' });
    // A fresh house that has never run live and holds nothing is not in trouble.
    let row = await keysRow();
    assert.ok(row, 'the check has a keys row');
    assert.equal(row.ok, true);
    assert.match(row.detail, /composed from sources or house-scripted/);
    // Holding one is reported, with the reason it will not survive a restart.
    assert.equal((await call('/api/keys/openai', { key: 'sk-test-key' }, 'PUT')).status, 200);
    row = await keysRow();
    assert.equal(row.ok, true);
    assert.match(row.detail, /provider key\(s\) held in memory: openai/);
    assert.match(row.detail, /never written to disk, so a restart clears them/);
    assert.equal((await call('/api/bootstrap', null, 'GET')).j.keysHeld, 1);
    // A search key is not a model key.
    assert.equal((await call('/api/keys/brave', { key: 'brave-test-key' }, 'PUT')).status, 200);
    assert.equal((await call('/api/bootstrap', null, 'GET')).j.keysHeld, 1, 'a search key is not counted as a model key');
    // Dropping the model key is exactly what a restart does. This house has
    // not run live, so it is told plainly rather than warned.
    assert.equal((await call('/api/keys/openai', null, 'DELETE')).status, 200);
    row = await keysRow();
    assert.equal(row.ok, true);
    assert.equal((await call('/api/bootstrap', null, 'GET')).j.ranLive, false);
    assert.match(row.detail, /no model key is held/);

    // Now the case that matters: a house that has written on a key, and then
    // lost it the way every restart loses it.
    const draft = { stand: 'Written on a key.', verdict: 'Proceed narrowly. Stated before the evidence, in two sentences.',
      claims: [1, 2, 3].map((n) => ({ text: `Claim ${n}.`, grade: 'B', detail: `Support ${n}.`, src: 0, source: { title: `Class ${n}`, kind: 'analysis' } })),
      refuted: [], moves: [], tripwires: 'Stop if it fails.', dissent: { seat: 'an adviser', text: 'Doubted the pace.' } };
    const model = http.createServer((req, res) => { let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(/CRITIQUE the draft/.test(JSON.parse(body).messages[0].content) ? { verdict: 'pass', issues: [] } : draft) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })); }); });
    await new Promise((r) => model.listen(0, '127.0.0.1', r));
    try {
      await call('/api/keys/openai', { key: 'sk-test-key', baseUrl: `http://127.0.0.1:${model.address().port}/v1` }, 'PUT');
      const lead = (await call('/api/models', { name: 'Key Model', provider: 'openai', modelId: 'k-1', baseUrl: `http://127.0.0.1:${model.address().port}/v1` })).j;
      const w = await call('/api/missions', { goal: 'Keys test: a brief written on a key', deskId: 'brief', depth: 'fast', lead: lead.id, advisers: [] });
      await call(`/api/missions/${w.j.id}/launch`);
      let m; const started = Date.now();
      while (Date.now() - started < 120000) {
        m = (await call(`/api/missions/${w.j.id}`, null, 'GET')).j;
        if (m.status === 'FILLED' || m.status === 'KILLED') break;
        if (m.status.startsWith('PAUSED')) { const a2 = (m.attention || []).find((x) => !x.decision); if (a2) { const pick = ['accept-risk', 'raise-ceiling', 'approve', 'patch', 'continue'].find((o) => a2.options.includes(o)) || a2.options[0]; await call(`/api/missions/${w.j.id}/attention/${a2.id}`, { decision: pick, justification: `keys test, ${pick}` }); } }
        await new Promise((r) => setTimeout(r, 300));
      }
      assert.equal(m.authored?.live, true, 'the house wrote on a key');
      assert.equal((await call('/api/bootstrap', null, 'GET')).j.ranLive, true);
      assert.equal((await call('/api/keys/openai', null, 'DELETE')).status, 200);
      row = await keysRow();
      assert.equal(row.ok, false, 'a house that ran live and now holds nothing is a finding');
      assert.match(row.detail, /a restart clears keys, so load yours again/);
    } finally { model.close(); }
  } finally { child9.kill(); fs.rmSync(DIR9, { recursive: true, force: true }); }
});

test('a goal too thin to price is questioned, never refused', async () => {
  // Asked before writing.
  const thin = await post('/api/clarify', { goal: 'help me with marketing', deskId: 'brief' });
  assert.equal(thin.status, 200);
  assert.equal(thin.j.thin, true);
  assert.equal(thin.j.questions.length, 3);
  assert.match(thin.j.why, /about as specific as the ask/);
  assert.match(thin.j.note, /a thin ticket is allowed/);
  const real = await post('/api/clarify', { goal: 'Should we open a second roastery in Mysore?', deskId: 'brief' });
  assert.equal(real.j.thin, false, 'a real question is not questioned');
  const deck = await post('/api/clarify', { goal: 'a deck', deskId: 'deck' });
  assert.match(deck.j.questions[0], /Who is in the room/, 'the questions suit the desk');

  // And recorded on the ticket, which is still written and still stampable.
  const w = await post('/api/missions', { goal: 'help me with marketing', deskId: 'brief', depth: 'fast' });
  assert.equal(w.status, 200, 'a thin ask still gets a ticket');
  assert.ok(w.j.thin, 'the ticket says the ask was thin');
  assert.equal(w.j.thin.questions.length, 3);
  assert.ok(w.j.contract.plan.length > 0 && w.j.contract.ceiling > 0, 'with a real plan and a real price');
  assert.equal((await post(`/api/missions/${w.j.id}/launch`)).status, 200, 'and it may be stamped anyway');
  const solid = await post('/api/missions', { goal: 'Should we open a second roastery in Mysore this year?', deskId: 'brief', depth: 'fast' });
  assert.equal(solid.j.thin, null, 'a specific ask carries no such note');
});

test('the door holds every write, not only the ones somebody remembered to gate', async () => {
  // Gates written route by route are only as good as the last route anyone
  // remembered. A dozen of them had been forgotten, so a stranger with no
  // session at all could delete this house's models, projects and servers.
  // The check now sits in one place, above every write in the building.
  const DIR6 = fs.mkdtempSync(path.join(os.tmpdir(), 'prajna-door-'));
  const P6 = PORT + 5;
  const B6 = `http://localhost:${P6}`;
  const child6 = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(P6), PRAJNA_DATA_DIR: DIR6, PRAJNA_ACCESS_CODE: 'open-sesame' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const jar = (r) => (r.headers.get('set-cookie') || '').split(/,(?=\s*prajna_)/).map((c) => c.split(';')[0].trim()).join('; ');
  const call = async (p, cookie, body, method = 'POST') => { const r = await fetch(B6 + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})), r }; };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { try { if ((await fetch(`${B6}/api/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }

    // The door is shut: even accepting the house rules waits behind the code.
    assert.equal((await call('/api/consent', null, { accept: true, version: '2026-09-04.2' })).status, 401);
    const opened = await call('/api/session', null, { code: 'open-sesame' });
    assert.equal(opened.status, 200);
    const key = jar(opened.r);
    const legal = (await call('/api/legal', key, null, 'GET')).j;
    assert.equal((await call('/api/consent', key, { accept: true, version: legal.version, name: 'Holder' })).status, 200);

    // With the house open and the rules accepted, a stranger holding no code
    // still cannot change anything. These are the routes that carried no gate
    // of their own before this check existed.
    for (const [method, p, body] of [
      ['DELETE', '/api/models/c_whatever', null],
      ['POST', '/api/projects', { name: 'a project that is not theirs' }],
      ['POST', '/api/mcp', { name: 'their server', url: 'https://example.invalid' }],
      ['POST', '/api/housekeeping', { apply: true }],
      ['POST', '/api/boards', { title: 'their board' }],
      ['PATCH', '/api/profile', { name: 'someone else' }],
      ['PATCH', '/api/plan', { plan: 'studio' }],
      ['POST', '/api/chats', { title: 'a chat in a house they cannot enter' }],
    ]) {
      const r = await call(p, null, body, method);
      assert.equal(r.status, 401, `${method} ${p} is refused without the code`);
      assert.equal(r.j.locked, true, `${method} ${p} says the door is shut, not something vaguer`);
    }

    // Reading is a separate question, and the same write with the code works.
    assert.equal((await call('/api/projects', key, { name: 'a project of their own' })).status, 200);
    assert.equal((await call('/api/mcp', key, { name: 'their server', url: 'https://example.invalid' })).status, 200);

    // Signing in and leaving stay open: a name against your own cookie is not
    // a change to the house, and nobody should be trapped inside it.
    assert.equal((await call('/api/me', key, { name: 'Holder' })).status, 200);
    assert.equal((await call('/api/logout', key, null)).status, 200);
  } finally { child6.kill(); fs.rmSync(DIR6, { recursive: true, force: true }); }
});
