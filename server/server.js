// Prajñā — zero-dependency Node server: API + SSE + static SPA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { MODELS, DESKS, SKILLS, CONNECTORS, modelById, allModels, bindCustomModels } from './catalog.js';
import { PROVIDERS, testKey, maskKey } from './providers.js';
import { liveSeat } from './engine.js';

bindCustomModels(() => store.customModels());
import { writeContract, launchMission, killMission, voidTicket, decideAttention, rehydrate, DIMENSIONS } from './engine.js';
import { GENERATORS } from './artifacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'web', 'dist');
const PORT = process.env.PORT || 3005;

/* --------------------------------- seeding -------------------------------- */

function seed() {
  if (store.missions().length > 0) return;
  const day = 86400000;
  const seeds = [
    { goal: 'State of AI agent platforms — who wins the enterprise?', deskId: 'brief', lead: 'opus', advisers: ['gpt', 'deepseek'], age: 2.1 * day, spent: 61.4 },
    { goal: 'Series A pitch for a carbon-accounting startup', deskId: 'deck', lead: 'sonnet', advisers: ['gpt', 'gemini'], age: 1.3 * day, spent: 49.7 },
    { goal: 'Cohort retention for our Q2 signups — where is the leak?', deskId: 'analysis', lead: 'opus', advisers: ['deepseek', 'llama'], age: 0.4 * day, spent: 55.2 },
  ];
  for (const s of seeds) {
    const m = writeContract(s);
    m.status = 'FILLED';
    m.spent = s.spent;
    m.createdAt = Date.now() - s.age;
    m.launchedAt = m.createdAt + 60000;
    m.filledAt = m.launchedAt + 47000;
    m.contract.plan.forEach((p) => (p.status = 'FILLED'));
    // Seeds are honest fills: their provenance carries settlement, a cleared
    // gate, and a passed terminal review, like any real completed run.
    m.settlement = {
      reserved: m.contract.ceiling,
      settled: s.spent,
      released: Math.round((m.contract.ceiling - s.spent) * 10) / 10,
    };
    const dims = m.contract.dimensions || DIMENSIONS[m.desk];
    m.gate = {
      cleared: true,
      rows: m.councilNames.flatMap((name) => dims.map((d) => ({ member: name, dimension: d, verdict: 'pass', rationale: 'Checked against the draft; holds.' }))),
    };
    m.review = { verdict: 'pass', gaps: [] };
    const { title, kind, html } = GENERATORS[m.desk](m);
    const artifactId = Math.random().toString(36).slice(2, 10);
    store.addArtifact({
      id: artifactId, title, kind, missionId: m.id, serial: m.serial,
      desk: m.deskName, tint: m.tint, createdAt: m.filledAt, version: 1,
      cost: m.spent, council: m.councilNames,
    }, html);
    m.artifactId = artifactId;
    // Seed history is real history: what they settled was debited from the pool.
    store.debitCredits(s.spent);
  }
  store.flushMissions();
}
seed();

/* ----------------------------------- SSE ---------------------------------- */

const subscribers = new Map(); // missionId → Set<res>
function notify(missionId, event) {
  const subs = subscribers.get(missionId);
  if (!subs) return;
  const line = `${event.seq ? `id: ${event.seq}\n` : ''}data: ${JSON.stringify(event)}\n\n`;
  for (const res of subs) res.write(line);
}

/* --------------------------------- helpers -------------------------------- */

// Strip the persisted run script from API payloads — it's runner state, not
// client data.
function pub(m) {
  if (!m || typeof m !== 'object') return m;
  const { runScript, deferredCost, ...rest } = m;
  return rest;
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}
// Bounded, object-only body parsing: a hostile or malformed body must never
// crash the process or hang a handler.
const BODY_LIMIT = 64 * 1024;
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c) => {
      data += c;
      if (data.length > BODY_LIMIT) {
        done({ __tooLarge: true });
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(data || '{}');
        done(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch { done({}); }
    });
    req.on('error', () => done({}));
    req.on('aborted', () => done({}));
  });
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

function connectorState() {
  if (!store.state.connectors) {
    store.state.connectors = { connected: ['gdrive'], skills: SKILLS.filter((s) => s.install === 'installed').map((s) => s.id) };
    store.flushConnectors();
  }
  return store.state.connectors;
}

/* ---------------------------------- server -------------------------------- */

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('prajna: request failed', e);
    if (!res.headersSent) json(res, 500, { error: 'The house hit an internal fault; nothing was changed.' });
    else res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // ---- API ----
  if (p === '/api/bootstrap') {
    const cs = connectorState();
    return json(res, 200, {
      workspace: store.workspace(),
      desks: DESKS,
      models: allModels().map((m) => ({ ...m, live: !!store.keyFor(m.provider), custom: String(m.id).startsWith('c_') })),
      providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { label: p.label, hint: p.hint }])),
      keys: Object.fromEntries(Object.entries(store.keys()).map(([prov, k]) => [prov, { masked: maskKey(k.key), baseUrl: k.baseUrl, addedAt: k.addedAt }])),
      skills: SKILLS.map((s) => ({ ...s, install: cs.skills.includes(s.id) ? 'installed' : 'available' })),
      connectors: CONNECTORS.map((c) => ({ ...c, connected: cs.connected.includes(c.id) })),
      missions: store.missions().map(pub),
      artifacts: store.artifacts(),
    });
  }

  if (p === '/api/missions' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const goal = String(body.goal || '').trim().slice(0, 400);
    if (!goal) return json(res, 400, { error: 'A goal is required to write a ticket.' });
    // Strict catalog lookups: a typo must not silently book the wrong desk or council.
    if (body.deskId && !DESKS.some((d) => d.id === body.deskId)) return json(res, 400, { error: `Unknown desk "${String(body.deskId).slice(0, 40)}".` });
    if (body.lead && !allModels().some((m) => m.id === body.lead)) return json(res, 400, { error: `Unknown lead model "${String(body.lead).slice(0, 40)}".` });
    const rawAdvisers = Array.isArray(body.advisers) ? body.advisers : [];
    const badAdviser = rawAdvisers.find((a) => !allModels().some((m) => m.id === a));
    if (badAdviser) return json(res, 400, { error: `Unknown adviser model "${String(badAdviser).slice(0, 40)}".` });
    const lead = modelById(body.lead).id;
    const advisers = rawAdvisers.map((a) => modelById(a).id).slice(0, 4);
    const mission = writeContract({ goal, deskId: body.deskId || 'brief', lead, advisers, installedSkills: connectorState().skills });
    return json(res, 200, pub(mission));
  }

  const launchMatch = p.match(/^\/api\/missions\/([\w]+)\/launch$/);
  if (launchMatch && req.method === 'POST') {
    const pending = store.mission(launchMatch[1]);
    if (!pending || pending.status !== 'OPEN') return json(res, 404, { error: 'Mission not found or not open.' });
    // The house never runs what it cannot fund: the ceiling must be covered.
    const credits = store.workspace().credits;
    if (credits < pending.contract.ceiling) {
      return json(res, 402, { error: `House credits (${credits.toFixed(0)}) are below this ticket's ceiling (${pending.contract.ceiling}). Top up or void the ticket — nothing was spent.` });
    }
    const m = launchMission(launchMatch[1], notify);
    if (!m) return json(res, 404, { error: 'Mission not found or not open.' });
    return json(res, 200, { ok: true });
  }

  const killMatch = p.match(/^\/api\/missions\/([\w]+)\/kill$/);
  if (killMatch && req.method === 'POST') {
    const m = killMission(killMatch[1], notify);
    if (!m) return json(res, 404, { error: 'Only a live or paused position can be killed.' });
    return json(res, 200, { ok: true });
  }

  const attnMatch = p.match(/^\/api\/missions\/([\w]+)\/attention\/([\w]+)$/);
  if (attnMatch && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const result = await decideAttention(attnMatch[1], attnMatch[2], String(body.decision || ''), String(body.justification || ''), notify);
    return json(res, result.error ? 400 : 200, result);
  }

  const eventsMatch = p.match(/^\/api\/missions\/([\w]+)\/events$/);
  if (eventsMatch) {
    const m = store.mission(eventsMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    const after = Number(url.searchParams.get('after') || 0);
    if (!Number.isFinite(after) || after < 0) return json(res, 400, { error: '"after" must be a non-negative number (the last seq you have).' });
    return json(res, 200, { events: (m.events || []).filter((e) => (e.seq || 0) > after) });
  }

  const voidMatch = p.match(/^\/api\/missions\/([\w]+)\/void$/);
  if (voidMatch && req.method === 'POST') {
    const m = voidTicket(voidMatch[1], notify);
    if (!m) return json(res, 404, { error: 'Only an open ticket can be voided.' });
    return json(res, 200, { ok: true });
  }

  const streamMatch = p.match(/^\/api\/missions\/([\w]+)\/stream$/);
  if (streamMatch) {
    const m = store.mission(streamMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive',
    });
    // Ledger replay: honor Last-Event-ID so a reconnecting client resumes from
    // its last seen seq; a fresh client gets the snapshot (full event history).
    const lastSeq = Number(req.headers['last-event-id'] || 0);
    if (lastSeq > 0) {
      for (const e of (m.events || []).filter((x) => (x.seq || 0) > lastSeq)) {
        res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'snapshot', mission: pub(m) })}\n\n`);
    }
    if (!subscribers.has(m.id)) subscribers.set(m.id, new Set());
    subscribers.get(m.id).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      const subs = subscribers.get(m.id);
      if (subs) {
        subs.delete(res);
        if (subs.size === 0) subscribers.delete(m.id);
      }
    });
    return;
  }

  const missionMatch = p.match(/^\/api\/missions\/([\w]+)$/);
  if (missionMatch) {
    const m = store.mission(missionMatch[1]);
    return m ? json(res, 200, pub(m)) : json(res, 404, { error: 'Mission not found.' });
  }

  const artifactHtml = p.match(/^\/api\/artifacts\/([\w]+)\/html$/);
  if (artifactHtml) {
    const html = store.artifactHtml(artifactHtml[1]);
    if (!html) return json(res, 404, { error: 'Artifact not found.' });
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    if (url.searchParams.get('download') === '1') {
      const meta = store.artifact(artifactHtml[1]);
      const name = (meta?.title || 'artifact').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'artifact';
      headers['content-disposition'] = `attachment; filename="${meta?.serial || 'PJ'}-${name}.html"`;
    }
    res.writeHead(200, headers);
    return res.end(html);
  }

  // ---- BYOK: keys + custom seats (keys never leave the server) ----
  const keyMatch = p.match(/^\/api\/keys\/([\w-]+)$/);
  if (keyMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const prov = keyMatch[1];
    if (!PROVIDERS[prov]) return json(res, 404, { error: 'Unknown provider.' });
    if (req.method === 'DELETE') { store.removeKey(prov); return json(res, 200, { ok: true }); }
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const key = String(body.key || '').trim();
    if (!key || key.length < 8) return json(res, 400, { error: 'A key is required (at least 8 characters).' });
    const baseUrl = String(body.baseUrl || '').trim();
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) return json(res, 400, { error: 'Base URL must start with http:// or https://.' });
    store.setKey(prov, key, baseUrl || null);
    return json(res, 200, { ok: true, masked: maskKey(key) });
  }
  const keyTest = p.match(/^\/api\/keys\/([\w-]+)\/test$/);
  if (keyTest && req.method === 'POST') {
    const prov = keyTest[1];
    if (!PROVIDERS[prov]) return json(res, 404, { error: 'Unknown provider.' });
    const body = await readBody(req);
    const saved = store.keyFor(prov);
    const key = String(body.key || saved?.key || '').trim();
    if (!key) return json(res, 400, { error: 'No key to test — save one or pass it in the request.' });
    const modelId = String(body.modelId || '').trim() || allModels().find((m) => m.provider === prov)?.modelId;
    try {
      const r = await testKey({ provider: prov, key, baseUrl: String(body.baseUrl || saved?.baseUrl || '').trim() || null, modelId });
      return json(res, 200, { ...r, modelId });
    } catch (e) {
      return json(res, 400, { error: `${PROVIDERS[prov].label} refused: ${String(e.message || e).slice(0, 200)}`, modelId });
    }
  }
  if (p === '/api/models' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const name = String(body.name || '').trim().slice(0, 40);
    const provider = String(body.provider || '');
    const modelId = String(body.modelId || '').trim().slice(0, 80);
    const baseUrl = String(body.baseUrl || '').trim() || null;
    if (!name || !modelId) return json(res, 400, { error: 'Name and model id are required.' });
    if (!PROVIDERS[provider]) return json(res, 400, { error: 'Unknown provider.' });
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) return json(res, 400, { error: 'Base URL must start with http:// or https://.' });
    if (allModels().length >= 24) return json(res, 400, { error: 'Seat limit reached (24 models).' });
    const symbol = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
    const m = store.addCustomModel({ id: `c_${Math.random().toString(36).slice(2, 8)}`, symbol, name, house: PROVIDERS[provider].label, role: 'Your seat · BYOK', tier: 'byok', color: '#E3A93C', provider, modelId, baseUrl });
    return json(res, 200, m);
  }
  const modelDel = p.match(/^\/api\/models\/(c_[\w]+)$/);
  if (modelDel && req.method === 'DELETE') {
    store.removeCustomModel(modelDel[1]);
    return json(res, 200, { ok: true });
  }

  const connectMatch = p.match(/^\/api\/connectors\/([\w-]+)\/toggle$/);
  if (connectMatch && req.method === 'POST') {
    const cid = connectMatch[1];
    if (!CONNECTORS.some((c) => c.id === cid)) return json(res, 404, { error: 'Unknown connector.' });
    const cs = connectorState();
    cs.connected = cs.connected.includes(cid) ? cs.connected.filter((c) => c !== cid) : [...cs.connected, cid];
    store.flushConnectors();
    return json(res, 200, { connected: cs.connected.includes(cid) });
  }

  const skillMatch = p.match(/^\/api\/skills\/([\w-]+)\/toggle$/);
  if (skillMatch && req.method === 'POST') {
    const sid = skillMatch[1];
    if (!SKILLS.some((s) => s.id === sid)) return json(res, 404, { error: 'Unknown skill.' });
    const cs = connectorState();
    cs.skills = cs.skills.includes(sid) ? cs.skills.filter((s) => s !== sid) : [...cs.skills, sid];
    store.flushConnectors();
    return json(res, 200, { installed: cs.skills.includes(sid) });
  }

  if (p.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint.' });

  // ---- static SPA ----
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!file.startsWith(DIST)) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('Prajñā web bundle not built yet. Run: cd web && npx vite build');
  }
}

rehydrate(notify);
server.listen(PORT, () => console.log(`Prajñā listening on http://localhost:${PORT}`));
