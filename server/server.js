// Praxis — zero-dependency Node server: API + SSE + static SPA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { MODELS, DESKS, SKILLS, CONNECTORS, modelById } from './catalog.js';
import { writeContract, launchMission } from './engine.js';
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
    const { title, kind, html } = GENERATORS[m.desk](m);
    const artifactId = Math.random().toString(36).slice(2, 10);
    store.addArtifact({
      id: artifactId, title, kind, missionId: m.id, serial: m.serial,
      desk: m.deskName, tint: m.tint, createdAt: m.filledAt, version: 1,
      cost: m.spent, council: m.councilNames,
    }, html);
    m.artifactId = artifactId;
  }
  store.flushMissions();
}
seed();

/* ----------------------------------- SSE ---------------------------------- */

const subscribers = new Map(); // missionId → Set<res>
function notify(missionId, event) {
  const subs = subscribers.get(missionId);
  if (!subs) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subs) res.write(line);
}

/* --------------------------------- helpers -------------------------------- */

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // ---- API ----
  if (p === '/api/bootstrap') {
    const cs = connectorState();
    return json(res, 200, {
      workspace: store.workspace(),
      desks: DESKS,
      models: MODELS,
      skills: SKILLS.map((s) => ({ ...s, install: cs.skills.includes(s.id) ? 'installed' : 'available' })),
      connectors: CONNECTORS.map((c) => ({ ...c, connected: cs.connected.includes(c.id) })),
      missions: store.missions(),
      artifacts: store.artifacts(),
    });
  }

  if (p === '/api/missions' && req.method === 'POST') {
    const body = await readBody(req);
    const goal = String(body.goal || '').trim().slice(0, 400);
    if (!goal) return json(res, 400, { error: 'A goal is required to write a ticket.' });
    const lead = modelById(body.lead).id;
    const advisers = (Array.isArray(body.advisers) ? body.advisers : []).map((a) => modelById(a).id).slice(0, 4);
    const mission = writeContract({ goal, deskId: body.deskId, lead, advisers });
    return json(res, 200, mission);
  }

  const launchMatch = p.match(/^\/api\/missions\/([\w]+)\/launch$/);
  if (launchMatch && req.method === 'POST') {
    const m = launchMission(launchMatch[1], notify);
    if (!m) return json(res, 404, { error: 'Mission not found or not open.' });
    return json(res, 200, { ok: true });
  }

  const voidMatch = p.match(/^\/api\/missions\/([\w]+)\/void$/);
  if (voidMatch && req.method === 'POST') {
    const m = store.mission(voidMatch[1]);
    if (!m || m.status !== 'OPEN') return json(res, 404, { error: 'Only an open ticket can be voided.' });
    m.status = 'KILLED';
    store.flushMissions();
    return json(res, 200, { ok: true });
  }

  const streamMatch = p.match(/^\/api\/missions\/([\w]+)\/stream$/);
  if (streamMatch) {
    const m = store.mission(streamMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'snapshot', mission: m })}\n\n`);
    if (!subscribers.has(m.id)) subscribers.set(m.id, new Set());
    subscribers.get(m.id).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      subscribers.get(m.id)?.delete(res);
    });
    return;
  }

  const missionMatch = p.match(/^\/api\/missions\/([\w]+)$/);
  if (missionMatch) {
    const m = store.mission(missionMatch[1]);
    return m ? json(res, 200, m) : json(res, 404, { error: 'Mission not found.' });
  }

  const artifactHtml = p.match(/^\/api\/artifacts\/([\w]+)\/html$/);
  if (artifactHtml) {
    const html = store.artifactHtml(artifactHtml[1]);
    if (!html) return json(res, 404, { error: 'Artifact not found.' });
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(html);
  }

  const connectMatch = p.match(/^\/api\/connectors\/([\w-]+)\/toggle$/);
  if (connectMatch && req.method === 'POST') {
    const cs = connectorState();
    const cid = connectMatch[1];
    cs.connected = cs.connected.includes(cid) ? cs.connected.filter((c) => c !== cid) : [...cs.connected, cid];
    store.flushConnectors();
    return json(res, 200, { connected: cs.connected.includes(cid) });
  }

  const skillMatch = p.match(/^\/api\/skills\/([\w-]+)\/toggle$/);
  if (skillMatch && req.method === 'POST') {
    const cs = connectorState();
    const sid = skillMatch[1];
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
    res.end('Praxis web bundle not built yet. Run: cd web && npx vite build');
  }
});

server.listen(PORT, () => console.log(`Praxis listening on http://localhost:${PORT}`));
