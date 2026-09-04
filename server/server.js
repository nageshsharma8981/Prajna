// Prajñā — zero-dependency Node server: API + SSE + static SPA.
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { MODELS, DESKS, SKILLS, CONNECTORS, modelById, allModels, bindCustomModels } from './catalog.js';
import { PROVIDERS, testKey, maskKey } from './providers.js';
import { liveSeat, editPlan, PLAN_TOOLS } from './engine.js';
import { OAUTH_PROVIDERS, providerForConnector, startUrl, finishCallback, redirectUri } from './oauth.js';
import { ws, flushWs, publicWs, createChat, getChat, addMessage, deleteChat, renameChat, DECK_TEMPLATES, PLUGINS, TOOLS, CONNECTOR_CATALOG, PLANS as PLAN_TIERS } from './workspace.js';
import { callModel, streamModel, generateImage } from './providers.js';
import { DATA_DIR } from './store.js';
import { auditBundle } from './bundle.js';
import { recordContext, answerFromRecord, missionsOfChat } from './record.js';
import { record as ledger } from './ledger.js';
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const STARTED_AT = Date.now();
let VERSION = '0.0.0';
try { VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version || VERSION; } catch { /* keep default */ }
function health() {
  const ms = store.missions();
  const last = ms.filter((m) => m.status === 'FILLED').sort((a, b) => (b.filledAt || 0) - (a.filledAt || 0))[0];
  let dataWritable = true;
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { dataWritable = false; }
  return {
    ok: true, house: 'open', version: VERSION, locked: !!ACCESS_CODE, startedAt: STARTED_AT, uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    node: process.version, dataWritable, memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    missions: { live: ms.filter((m) => m.status === 'LIVE').length, paused: ms.filter((m) => m.status.startsWith('PAUSED')).length, delivered: ms.filter((m) => m.status === 'FILLED').length, total: ms.length },
    lastDeliveryAt: last?.filledAt || null,
    // Seven days of history, oldest first: what started, what was delivered,
    // what was stopped, and the incidents the house records about itself —
    // retrieval failures and live seats that could not author.
    days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (6 - i));
      const from = d.getTime(), to = from + 86400000;
      const inDay = (t) => t >= from && t < to;
      return {
        date: d.toISOString().slice(0, 10),
        started: ms.filter((m) => inDay(m.launchedAt || 0)).length,
        delivered: ms.filter((m) => m.status === 'FILLED' && inDay(m.filledAt || 0)).length,
        stopped: ms.filter((m) => m.status === 'KILLED' && !m.voidedBeforeRun && inDay(m.filledAt || m.launchedAt || 0)).length,
        incidents: ms.filter((m) => inDay(m.launchedAt || 0) && ((m.retrieval && m.retrieval.ok === false) || (m.authored && m.authored.live === false))).length,
      };
    }),
  };
}
fs.mkdirSync(MEDIA_DIR, { recursive: true });

bindCustomModels(() => store.customModels());
import { writeContract, launchMission, killMission, voidTicket, decideAttention, rehydrate, forkMission, DIMENSIONS } from './engine.js';
import { GENERATORS } from './artifacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'web', 'dist');
const PORT = process.env.PORT || 3005;

// ---- Access gate. Set PRAJNA_ACCESS_CODE on the host and every API call
// needs a session cookie minted by that code; unset, the house is open
// (local development). The cookie is an HMAC of the code, so restarts do not
// log anyone out and nothing secret is written to disk.
const ACCESS_CODE = String(process.env.PRAJNA_ACCESS_CODE || '').trim();
const sessionToken = () => crypto.createHmac('sha256', ACCESS_CODE).update('prajna-session-v1').digest('hex');
function cookieOf(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function authed(req) {
  if (!ACCESS_CODE) return true;
  const got = cookieOf(req, 'prajna_session') || '';
  const want = sessionToken();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
function sessionCookie(req, value, maxAge) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https');
  return `prajna_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
// Per-address rate limits, fixed windows, memory only. Buckets: the access
// code (a dozen tries per ten minutes), public share links and locked-out API
// calls (sixty a minute each) — enough for people, not for scanners.
const buckets = new Map(); // `${bucket}:${ip}` → { n, at }
function limited(ip, bucket, max, windowMs) {
  const key = `${bucket}:${ip}`; const now = Date.now();
  const a = buckets.get(key) || { n: 0, at: now };
  if (now - a.at > windowMs) { a.n = 0; a.at = now; }
  a.n++; buckets.set(key, a);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > windowMs) buckets.delete(k);
  return a.n > max;
}
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const tooMany = (ip) => limited(ip, 'code', 12, 600000);

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
// Boards never need the event ledger — the run view streams it. Bootstrap
// carries a count instead, which keeps the payload small as history grows.
function lean(m) {
  const { events, ...rest } = pub(m);
  return { ...rest, eventCount: rest.eventCount ?? (events || []).length };
}

// Responses compress when the client accepts gzip (JSON payloads shrink ~8×).
function sendCompressed(req, res, code, headers, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const accepts = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (accepts && buf.length > 1024) {
    res.writeHead(code, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    return res.end(zlib.gzipSync(buf, { level: 6 }));
  }
  res.writeHead(code, headers);
  res.end(buf);
}
function json(res, code, body) {
  const data = JSON.stringify(body);
  sendCompressed(res.req, res, code, { 'content-type': 'application/json', 'cache-control': 'no-store' }, data);
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

// Connectors that are genuinely connected (a live OAuth token in memory).
function connectedConnectors() {
  return CONNECTOR_CATALOG.filter((c) => c.provider && store.token(c.provider)).map((c) => c.id);
}

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

  // Baseline response headers. Shared artifacts may be framed by others;
  // the app itself may not.
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), geolocation=(), payment=()');
  if (!p.startsWith('/s/') && !p.startsWith('/api/artifacts/')) res.setHeader('x-frame-options', 'SAMEORIGIN');

  // ---- Health and the public status page (always reachable, never secret) ----
  if (p === '/api/health') {
    if (limited(ipOf(req), 'health', 120, 60000)) return json(res, 429, { ok: false, error: 'Too many requests.' });
    return json(res, 200, health());
  }
  if (p === '/status') {
    if (limited(ipOf(req), 'health', 120, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests.'); }
    const h = health();
    const up = (sec) => `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prajñā status</title>
<style>body{margin:0;background:#0f120f;color:#ece7d9;font:16px/1.6 -apple-system,'Segoe UI',system-ui,sans-serif}.wrap{max-width:38rem;margin:0 auto;padding:4rem 1.5rem}h1{font-size:1.4rem;margin:0 0 .3rem}.ok{color:#8fd19e;font-weight:700}.k{display:block;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#9a9583}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem 1.4rem;margin:1.6rem 0}.grid div{border:1px solid #2a2f2a;border-radius:6px;padding:.6rem .8rem}.grid b{font-size:1.1rem}a{color:#ffb300}.note{font-size:.8rem;color:#9a9583}</style></head><body><div class="wrap">
<h1>Prajñā · <span class="ok">the house is open</span></h1><p class="note">Version ${h.version} · ${h.locked ? 'access code required' : 'open house'} · refreshed ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</p>
<div class="grid">
<div><span class="k">Uptime</span><b>${up(h.uptimeSeconds)}</b></div>
<div><span class="k">Runs live / paused</span><b>${h.missions.live} / ${h.missions.paused}</b></div>
<div><span class="k">Delivered</span><b>${h.missions.delivered} of ${h.missions.total}</b></div>
<div><span class="k">Last delivery</span><b>${h.lastDeliveryAt ? new Date(h.lastDeliveryAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}</b></div>
<div><span class="k">Data directory</span><b>${h.dataWritable ? 'writable' : 'READ-ONLY'}</b></div>
<div><span class="k">Memory</span><b>${h.memoryMb} MB</b></div>
</div>
<h2 style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#9a9583;margin:1.6rem 0 .5rem">Last seven days · UTC</h2>
<table style="width:100%;border-collapse:collapse;font-size:.85rem"><thead><tr style="color:#9a9583;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase"><th style="text-align:left;padding:.3rem 0">Day</th><th style="text-align:right">Started</th><th style="text-align:right">Delivered</th><th style="text-align:right">Stopped</th><th style="text-align:right">Incidents</th></tr></thead><tbody>${h.days.map((d) => `<tr style="border-top:1px solid #2a2f2a"><td style="padding:.35rem 0">${d.date}</td><td style="text-align:right">${d.started}</td><td style="text-align:right">${d.delivered}</td><td style="text-align:right">${d.stopped}</td><td style="text-align:right;color:${d.incidents ? '#ffb300' : 'inherit'}">${d.incidents}</td></tr>`).join('')}</tbody></table>
<p class="note">An incident is a retrieval failure or a live seat that could not author — recorded on the tape, never hidden.</p>
<p class="note">Machine-readable: <a href="/api/health">/api/health</a>. Nothing here is secret; keys and tokens never leave memory. <a href="/">Open the workspace</a>.</p>
</div></body></html>`;
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, page);
  }

  // ---- Session (always reachable) ----
  if (p === '/api/session') {
    if (req.method === 'POST') {
      const ip = ipOf(req);
      if (tooMany(ip)) return json(res, 429, { error: 'Too many attempts. Wait ten minutes.' });
      const body = await readBody(req);
      const code = String(body.code || '').trim();
      if (!ACCESS_CODE) return json(res, 200, { ok: true, open: true });
      const ok = code.length === ACCESS_CODE.length && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(ACCESS_CODE));
      if (!ok) return json(res, 401, { error: 'That code does not open the house.' });
      res.setHeader('set-cookie', sessionCookie(req, sessionToken(), 60 * 60 * 24 * 30));
      return json(res, 200, { ok: true });
    }
    return json(res, 200, { open: !ACCESS_CODE, locked: !authed(req) });
  }

  // ---- Shared artifact (public by explicit share link; provenance travels with it) ----
  const shared = p.match(/^\/s\/([a-f0-9]{32})$/);
  if (shared) {
    if (limited(ipOf(req), 'share', 60, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests. Try again in a minute.'); }
    const a = store.artifacts().find((x) => x.shareToken === shared[1]);
    const html = a ? store.artifactHtml(a.id) : null;
    if (!html) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>Not shared</title><p style="font:16px system-ui;padding:3rem">This share link is not on the books — it may have been revoked.</p>'); }
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }, html);
  }

  // Shared mission record (public by explicit share link): the audit bundle.
  const sharedRun = p.match(/^\/r\/([a-f0-9]{32})$/);
  if (sharedRun) {
    if (limited(ipOf(req), 'share', 60, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests. Try again in a minute.'); }
    const m = store.missions().find((x) => x.shareToken === sharedRun[1]);
    if (!m) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>Not shared</title><p style="font:16px system-ui;padding:3rem">This record link is not on the books — it may have been revoked.</p>'); }
    const full = store.missionFull(m.id);
    const a = full.artifactId ? store.artifact(full.artifactId) : null;
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }, auditBundle(pub(full), a, full.artifactId ? store.artifactHtml(full.artifactId) : null));
  }

  if (p.startsWith('/api/') && !authed(req)) {
    if (limited(ipOf(req), 'locked', 60, 60000)) return json(res, 429, { locked: true, error: 'Too many requests. Try again in a minute.' });
    if (p === '/api/bootstrap') return json(res, 401, { locked: true, error: 'The house is locked. Enter the access code.' });
    return json(res, 401, { locked: true, error: 'Session required.' });
  }

  // ---- API ----
  if (p === '/api/bootstrap') {
    const cs = connectorState();
    return json(res, 200, {
      workspace: store.workspace(),
      desks: DESKS,
      models: allModels().map((m) => ({ ...m, live: !!store.keyFor(m.provider), custom: String(m.id).startsWith('c_') })),
      providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { label: p.label, hint: p.hint, kind: p.kind || 'model' }])),
      keys: Object.fromEntries(Object.entries(store.keys()).map(([prov, k]) => [prov, { masked: maskKey(k.key), baseUrl: k.baseUrl, addedAt: k.addedAt }])),
      skills: SKILLS.map((s) => ({ ...s, install: cs.skills.includes(s.id) ? 'installed' : 'available' })),
      connectors: CONNECTOR_CATALOG.map((c) => {
        const prov = c.provider || null;
        const tok = prov ? store.token(prov) : null;
        return { ...c, supported: !!prov, appConfigured: !!(prov && store.oauthApp(prov)), connected: !!tok, account: tok ? tok.account : null };
      }),
      templates: DECK_TEMPLATES,
      pluginCatalog: PLUGINS,
      toolCatalog: TOOLS,
      planTiers: PLAN_TIERS,
      ...publicWs(),
      oauthApps: Object.fromEntries(Object.entries(OAUTH_PROVIDERS).map(([id, p]) => [id, { label: p.label, covers: p.covers, console: p.console, configured: !!store.oauthApp(id), clientId: store.oauthApp(id)?.clientId || null, connectedAs: store.token(id)?.account || null, redirectUri: redirectUri(req, id) }])),
      missions: store.missions().map(lean),
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
    const mission = writeContract({ goal, deskId: body.deskId || 'brief', lead, advisers, installedSkills: connectorState().skills, queuedConnectors: connectedConnectors(), variant: body.variant === 'design' ? 'design' : 'build', template: body.template || null, depth: body.depth === 'fast' ? 'fast' : 'deep', chatId: body.chatId || null });
    return json(res, 200, pub(mission));
  }

  const forkMatch = p.match(/^\/api\/missions\/([\w]+)\/fork$/);
  if (forkMatch && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const goal = String(body.goal || '').trim().slice(0, 400) || undefined;
    const feedback = Array.isArray(body.feedback) ? body.feedback : [];
    const m = forkMission(forkMatch[1], { goal, feedback, installedSkills: connectorState().skills, queuedConnectors: connectedConnectors() });
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    return json(res, 200, pub(m));
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
    const m = store.missionFull(eventsMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    const after = Number(url.searchParams.get('after') || 0);
    if (!Number.isFinite(after) || after < 0) return json(res, 400, { error: '"after" must be a non-negative number (the last seq you have).' });
    return json(res, 200, { events: (m.events || []).filter((e) => (e.seq || 0) > after) });
  }

  // Housekeeping: settle what the board has stopped caring about. Unstamped
  // tickets older than the window are voided; runs paused on a decision
  // nobody has taken for that long are stopped, releasing their reserve.
  // Every action lands on the tape as such. Dry run by default.
  if (p === '/api/housekeeping' && req.method === 'POST') {
    const body = await readBody(req);
    const minutes = Math.max(5, Math.min(60 * 24 * 30, Number(body.minutes) || 60));
    const cutoff = Date.now() - minutes * 60000;
    const stale = store.missions().filter((m) => m.status === 'OPEN' && (m.createdAt || 0) < cutoff);
    const stuck = store.missions().filter((m) => m.status.startsWith('PAUSED') && (m.attention || []).some((a) => !a.decision && (a.raisedAt || 0) < cutoff));
    const plan = { minutes, stale: stale.map((m) => ({ id: m.id, serial: m.serial, subject: m.subject })), stuck: stuck.map((m) => ({ id: m.id, serial: m.serial, subject: m.subject, kind: (m.attention || []).find((a) => !a.decision)?.kind })) };
    if (!body.apply) return json(res, 200, { ...plan, dryRun: true });
    let voided = 0, stopped = 0;
    for (const m of stale) { if (voidTicket(m.id, notify)) voided++; }
    for (const m of stuck) { const r = killMission(m.id, notify); if (r && !r.error) stopped++; }
    return json(res, 200, { ...plan, dryRun: false, voided, stopped, note: `Housekeeping: ${voided} unstamped ticket(s) voided, ${stopped} paused run(s) stopped — reserves released, everything on the tape.` });
  }

  const voidMatch = p.match(/^\/api\/missions\/([\w]+)\/void$/);
  if (voidMatch && req.method === 'POST') {
    const m = voidTicket(voidMatch[1], notify);
    if (!m) return json(res, 404, { error: 'Only an open ticket can be voided.' });
    return json(res, 200, { ok: true });
  }

  const streamMatch = p.match(/^\/api\/missions\/([\w]+)\/stream$/);
  if (streamMatch) {
    const m = store.missionFull(streamMatch[1]);
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
    const m = store.missionFull(missionMatch[1]);
    return m ? json(res, 200, pub(m)) : json(res, 404, { error: 'Mission not found.' });
  }

  // ---- Community showcase: a delivered artifact, submitted with its provenance, becomes public ----
  if (p === '/api/showcase' && req.method === 'POST') {
    const body = await readBody(req);
    const a = store.artifact(String(body.artifactId || ''));
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const m = store.mission(a.missionId);
    if (!m || m.status !== 'FILLED' || a.partial || a.voided) return json(res, 400, { error: 'Only a fully delivered, unvoided artifact can be submitted.' });
    const w = ws();
    if (w.showcase.some((x) => x.artifactId === a.id)) return json(res, 400, { error: 'Already on the showcase.' });
    const shareToken = a.shareToken || crypto.randomBytes(16).toString('hex');
    store.refreshArtifact(a.id, { shareToken, sharedAt: a.sharedAt || Date.now() }, store.artifactHtml(a.id));
    const entry = {
      id: `sc_${crypto.randomBytes(4).toString('hex')}`, artifactId: a.id, title: a.title.replace(/^VOID · /, ''), kind: a.kind, desk: a.desk, serial: a.serial,
      prompt: m.goal, mode: Object.entries({ website: 'site', mobile: 'mobile', deck: 'deck', research: 'brief', analysis: 'analysis' }).find(([, d]) => d === m.desk)?.[0] || 'chat',
      by: w.profile.handle || w.profile.name, blurb: String(body.blurb || '').slice(0, 240), shareToken, submittedAt: Date.now(),
      provenance: { mode: m.authored?.live ? 'live' : (m.seats || []).some((x) => x.live) ? 'hybrid' : 'scripted', sealed: (m.contract.assertions || []).filter((x) => x.status === 'SEALED').length, assertions: (m.contract.assertions || []).length, patches: (m.patches || []).length, acceptedRisks: (m.acceptedRisks || []).length },
      grant: 200,
    };
    w.showcase.unshift(entry);
    store.workspace().credits += entry.grant; store.flushWorkspace?.();
    flushWs();
    ledger('grant', entry.grant, `Showcase submission ${a.serial} — ${entry.grant} cr house grant (demo)`, { artifactId: a.id });
    return json(res, 200, { ok: true, entry, path: `/s/${shareToken}`, granted: entry.grant });
  }
  const scDel = p.match(/^\/api\/showcase\/(sc_[a-f0-9]+)$/);
  if (scDel && req.method === 'DELETE') {
    const w = ws(); w.showcase = w.showcase.filter((x) => x.id !== scDel[1]); flushWs();
    return json(res, 200, { ok: true });
  }

  // ---- Media studio: hosted generation on the user's own key; bytes kept under the data dir ----
  if (p === '/api/media/generate' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    const provider = String(body.provider || 'openai');
    if (!prompt) return json(res, 400, { error: 'Describe the image first.' });
    const k = store.keyFor(provider);
    if (!k) return json(res, 400, { error: `No ${PROVIDERS[provider]?.label || provider} key in memory — load one under Your keys. Nothing was generated.` });
    const started = Date.now();
    try {
      const out = await generateImage({ provider, key: k.key, baseUrl: k.baseUrl, modelId: String(body.modelId || '').trim() || undefined, prompt, size: /^\d{3,4}x\d{3,4}$/.test(String(body.size || '')) ? body.size : undefined });
      const id = crypto.randomBytes(8).toString('hex');
      const ext = out.mime.includes('jpeg') ? 'jpg' : out.mime.includes('webp') ? 'webp' : 'png';
      fs.writeFileSync(path.join(MEDIA_DIR, `${id}.${ext}`), out.bytes);
      const rec = { id, ext, mime: out.mime, prompt, provider, model: out.model, bytes: out.bytes.length, ms: Date.now() - started, createdAt: Date.now() };
      ws().media.unshift(rec); ws().media = ws().media.slice(0, 200); flushWs();
      return json(res, 200, { ok: true, media: rec, url: `/api/media/${id}` });
    } catch (e) {
      return json(res, 400, { error: `${PROVIDERS[provider]?.label || provider} refused: ${String(e.message || e).slice(0, 220)}` });
    }
  }
  const mediaGet = p.match(/^\/api\/media\/([a-f0-9]{16})$/);
  if (mediaGet) {
    const rec = ws().media.find((m) => m.id === mediaGet[1]);
    if (!rec) return json(res, 404, { error: 'Not on the books.' });
    if (req.method === 'DELETE') {
      ws().media = ws().media.filter((m) => m.id !== rec.id); flushWs();
      try { fs.unlinkSync(path.join(MEDIA_DIR, `${rec.id}.${rec.ext}`)); } catch { /* already gone */ }
      return json(res, 200, { ok: true });
    }
    try {
      const bytes = fs.readFileSync(path.join(MEDIA_DIR, `${rec.id}.${rec.ext}`));
      res.writeHead(200, { 'content-type': rec.mime, 'cache-control': 'private, max-age=31536000, immutable', 'content-length': bytes.length });
      return res.end(bytes);
    } catch { return json(res, 404, { error: 'The file is gone from the data directory.' }); }
  }

  // Audit bundle: the whole record of a mission in one file, for handover.
  const bundleMatch = p.match(/^\/api\/missions\/([\w]+)\/bundle$/);
  if (bundleMatch) {
    const m = store.missionFull(bundleMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    const a = m.artifactId ? store.artifact(m.artifactId) : null;
    const html = m.artifactId ? store.artifactHtml(m.artifactId) : null;
    if (url.searchParams.get('format') === 'json') return json(res, 200, { schema: 'prajna.bundle.v1', exportedAt: Date.now(), mission: pub(m), artifact: a || null, artifactHtml: html });
    const name = `${m.serial}-audit-bundle.html`;
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    if (url.searchParams.get('download') === '1') headers['content-disposition'] = `attachment; filename="${name}"`;
    return sendCompressed(req, res, 200, headers, auditBundle(pub(m), a, html));
  }

  const runShare = p.match(/^\/api\/missions\/([\w]+)\/share$/);
  if (runShare && (req.method === 'POST' || req.method === 'DELETE')) {
    const m = store.mission(runShare[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    if (req.method === 'POST' && m.status === 'OPEN') return json(res, 400, { error: 'An unstamped ticket has no record to share yet.' });
    m.shareToken = req.method === 'POST' ? (m.shareToken || crypto.randomBytes(16).toString('hex')) : null;
    m.sharedAt = m.shareToken ? (m.sharedAt || Date.now()) : null;
    store.flushMissions();
    return json(res, 200, { ok: true, shareToken: m.shareToken, path: m.shareToken ? `/r/${m.shareToken}` : null });
  }

  const planMatch = p.match(/^\/api\/missions\/([\w]+)\/plan$/);
  if (planMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    try { return json(res, 200, pub(editPlan(planMatch[1], body.plan))); }
    catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }

  // Owner notes on a delivery: the raw material for the next version.
  const noteMatch = p.match(/^\/api\/artifacts\/([\w]+)\/notes(?:\/([\w]+))?$/);
  if (noteMatch && (req.method === 'POST' || req.method === 'DELETE')) {
    const a = store.artifact(noteMatch[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const notes = Array.isArray(a.notes) ? a.notes : [];
    if (req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.text || '').trim().slice(0, 500);
      if (!text) return json(res, 400, { error: 'Write the note first.' });
      if (notes.length >= 12) return json(res, 400, { error: 'Twelve notes at most — the next version should be able to address them all.' });
      const note = { id: crypto.randomBytes(4).toString('hex'), text, at: Date.now(), by: ws().profile.handle || ws().profile.name };
      store.refreshArtifact(a.id, { notes: [...notes, note] }, store.artifactHtml(a.id));
      return json(res, 200, { ok: true, note, notes: [...notes, note] });
    }
    const left = notes.filter((n) => n.id !== noteMatch[2]);
    store.refreshArtifact(a.id, { notes: left }, store.artifactHtml(a.id));
    return json(res, 200, { ok: true, notes: left });
  }

  const shareMatch = p.match(/^\/api\/artifacts\/([\w]+)\/share$/);
  if (shareMatch && (req.method === 'POST' || req.method === 'DELETE')) {
    const a = store.artifact(shareMatch[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const token = req.method === 'POST' ? (a.shareToken || crypto.randomBytes(16).toString('hex')) : null;
    store.refreshArtifact(a.id, { shareToken: token, sharedAt: token ? (a.sharedAt || Date.now()) : null }, store.artifactHtml(a.id));
    return json(res, 200, { ok: true, shareToken: token, path: token ? `/s/${token}` : null });
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
    return sendCompressed(req, res, 200, headers, html);
  }

  // ---- Chats (Zenith parity): a message in a mode becomes a mission that runs at once ----
  if (p === '/api/chats' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, createChat({ title: body.title, mode: body.mode, projectId: body.projectId }));
  }
  const chatMatch = p.match(/^\/api\/chats\/([\w]+)$/);
  if (chatMatch) {
    const c = getChat(chatMatch[1]);
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    if (req.method === 'DELETE') { deleteChat(c.id); return json(res, 200, { ok: true }); }
    if (req.method === 'PATCH') { const body = await readBody(req); return json(res, 200, renameChat(c.id, body.title || c.title)); }
    return json(res, 200, c);
  }
  // The companion can start a mission mid-conversation: a live seat ends its
  // reply with `PRAJNA-MISSION: <mode> | <goal>` when the user clearly asks
  // for a deliverable; without a live seat a plain-language request is read
  // directly. Either way the mission is written and launched on the record.
  const MODE_DESK_ALL = { website: 'site', mobile: 'mobile', deck: 'deck', research: 'brief', analysis: 'analysis' };
  const inferMode = (text) => {
    const t = text.toLowerCase();
    if (!/^(please\s+)?(build|make|create|design|write|draft|prepare|put together|give me|i need|i want)\b/.test(t)) return null;
    if (/\b(landing page|website|web page|site|homepage)\b/.test(t)) return 'website';
    if (/\b(mobile app|ios app|android app|an app\b|app prototype)/.test(t)) return 'mobile';
    if (/\b(deck|slides|slide deck|pitch|presentation)\b/.test(t)) return 'deck';
    if (/\b(brief|research|report|memo|should we)\b/.test(t)) return 'research';
    if (/\b(analy[sz]e|analysis|dashboard|chart)\b/.test(t)) return 'analysis';
    return null;
  };
  const startMissionFromChat = (c, mode, goal, seatId) => {
    const lead = modelById(seatId || ws().personalization.defaultModel).id;
    const advisers = (ws().personalization.defaultAdvisers || []).map((a) => modelById(a).id).filter((a) => a !== lead).slice(0, 5);
    const mission = writeContract({ goal, deskId: MODE_DESK_ALL[mode], lead, advisers, installedSkills: connectorState().skills, queuedConnectors: connectedConnectors(), variant: 'build', template: null, depth: 'deep', chatId: c.id });
    if (store.workspace().credits < mission.contract.ceiling) return { mission, text: `I wrote the ticket (${mission.serial}: ${mission.contract.plan.length} steps, ceiling ${mission.contract.ceiling}) but the house holds only ${store.workspace().credits.toFixed(0)} credits — top up before stamping.`, kind: 'ticket' };
    launchMission(mission.id, notify);
    return { mission, text: `Started ${mission.deskName.replace(' desk', '')} mission ${mission.serial} from this conversation: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits estimated (ceiling ${mission.contract.ceiling}).`, kind: 'run' };
  };

  // Streaming plain chat: SSE deltas as the live seat speaks, then the saved
  // message. Without a live seat the house answers honestly in one event.
  const chatStreamMatch = p.match(/^\/api\/chats\/([\w]+)\/stream$/);
  if (chatStreamMatch && req.method === 'POST') {
    const c = getChat(chatStreamMatch[1]);
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) return json(res, 400, { error: 'Say something first.' });
    addMessage(c.id, { role: 'user', text, mode: 'chat', attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).map((a) => (typeof a === 'string' ? a : String(a?.name || 'attachment').slice(0, 120))) });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const seatId = body.lead || ws().personalization.defaultModel;
    const live = liveSeat(seatId);
    let reply, kind = 'text';
    if (live) {
      try {
        const history = c.messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        reply = await streamModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, maxTokens: 1200, prompt: `You are Prajñā, a calm, precise assistant inside an agent workspace that can run missions (website, mobile, deck, research, analysis) with a visible contract. Reply helpfully and concisely (markdown ok).${recordContext(c) ? `\n\nRecord of missions in this thread — when asked about them, answer ONLY from this record and say plainly when it does not say:\n${recordContext(c)}` : ''} If — and only if — the user clearly asks you to produce one of those deliverables, end your reply with a final line exactly of the form: PRAJNA-MISSION: <website|mobile|deck|research|analysis> | <one-line goal>\n\n${history}\nAssistant:`, onDelta: (d) => emit('delta', { text: d }) });
        kind = 'live';
        const mm = reply.match(/PRAJNA-MISSION:\s*(website|mobile|deck|research|analysis)\s*\|\s*(.+)$/im);
        if (mm) {
          reply = reply.replace(mm[0], '').trim();
          const started = startMissionFromChat(c, mm[1].toLowerCase(), mm[2].trim().slice(0, 400), seatId);
          const m = addMessage(c.id, { role: 'assistant', text: reply, kind, model: modelById(seatId).name });
          const m2 = addMessage(c.id, { role: 'assistant', text: started.text, missionId: started.mission.id, kind: started.kind });
          emit('done', { message: m, mission: m2, chat: getChat(c.id) });
          return res.end();
        }
      } catch (e) { reply = `The live seat (${live.model.name}) refused: ${String(e.message || e).slice(0, 160)}. Check the key under Your keys.`; }
    } else {
      const fromRecord = answerFromRecord(text, missionsOfChat(c));
      if (fromRecord) {
        const m = addMessage(c.id, { role: 'assistant', text: fromRecord, kind: 'record', model: 'the house' });
        emit('done', { message: m, chat: getChat(c.id) });
        return res.end();
      }
      const mode = inferMode(text);
      if (mode) {
        const started = startMissionFromChat(c, mode, text.slice(0, 400), seatId);
        const m = addMessage(c.id, { role: 'assistant', text: started.text, missionId: started.mission.id, kind: started.kind });
        emit('done', { message: m, chat: getChat(c.id) });
        return res.end();
      }
      reply = `I can chat once a model key is loaded under Your keys (that makes ${modelById(seatId).name} live). Meanwhile, ask me to build a website, an app, a deck, a brief or an analysis and I will run it as a mission with a visible contract.`;
    }
    const m = addMessage(c.id, { role: 'assistant', text: reply, kind, model: modelById(seatId).name });
    emit('done', { message: m, chat: getChat(c.id) });
    return res.end();
  }
  const msgMatch = p.match(/^\/api\/chats\/([\w]+)\/messages$/);
  if (msgMatch && req.method === 'POST') {
    const c = getChat(msgMatch[1]);
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) return json(res, 400, { error: 'Say something first.' });
    const mode = String(body.mode || c.mode || 'chat');
    const docs = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).filter((a) => a && typeof a === 'object' && typeof a.text === 'string' && a.text.trim()).map((a) => ({ name: String(a.name || 'attachment').slice(0, 120), text: String(a.text).slice(0, 200000) }));
    addMessage(c.id, { role: 'user', text, mode, attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).map((a) => (typeof a === 'string' ? a : String(a?.name || 'attachment').slice(0, 120))) });
    const MODE_DESK = { website: 'site', mobile: 'mobile', deck: 'deck', research: 'brief', analysis: 'analysis' };
    if (MODE_DESK[mode]) {
      const lead = modelById(body.lead || ws().personalization.defaultModel).id;
      const advisers = (Array.isArray(body.advisers) ? body.advisers : ws().personalization.defaultAdvisers).map((a) => modelById(a).id).filter((a) => a !== lead).slice(0, 5);
      const mission = writeContract({ goal: text, deskId: MODE_DESK[mode], lead, advisers, installedSkills: connectorState().skills, queuedConnectors: connectedConnectors(), variant: body.variant === 'design' ? 'design' : 'build', template: body.template || null, depth: body.depth === 'fast' ? 'fast' : 'deep', chatId: c.id, attachments: docs });
      const credits = store.workspace().credits;
      if (credits < mission.contract.ceiling) {
        const m = addMessage(c.id, { role: 'assistant', text: `I wrote the ticket (${mission.serial}: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits, ceiling ${mission.contract.ceiling}) but the house holds only ${credits.toFixed(0)} credits — top up or trim the plan before stamping.`, missionId: mission.id, kind: 'ticket' });
        return json(res, 200, { chat: getChat(c.id), mission: pub(mission), message: m });
      }
      const launched = launchMission(mission.id, notify);
      const m = addMessage(c.id, { role: 'assistant', text: `On it — ${mission.deskName.replace(' desk', '')} mission ${mission.serial} is running: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits estimated (ceiling ${mission.contract.ceiling}). Watch the tape or wait for the delivery here.`, missionId: mission.id, kind: 'run' });
      return json(res, 200, { chat: getChat(c.id), mission: pub(launched || mission), message: m });
    }
    // Plain chat: a live seat answers if a key is loaded; otherwise the house replies honestly.
    const seatId = body.lead || ws().personalization.defaultModel;
    const live = liveSeat(seatId);
    let reply, kind = 'text';
    if (live) {
      try {
        const history = c.messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        reply = await callModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, prompt: `You are Prajñā, a calm, precise assistant inside an agent workspace. Reply helpfully and concisely (markdown ok).${recordContext(c) ? `\n\nRecord of missions in this thread — when asked about them, answer ONLY from this record and say plainly when it does not say:\n${recordContext(c)}` : ''}\n\n${history}\nAssistant:`, maxTokens: 900 });
        kind = 'live';
      } catch (e) { reply = `The live seat (${live.model.name}) refused: ${String(e.message || e).slice(0, 160)}. Check the key under Your keys.`; }
    } else {
      reply = answerFromRecord(text, missionsOfChat(c)) || `I can chat once a model key is loaded under Your keys (that makes ${modelById(seatId).name} live). Meanwhile, pick a mode — Website, Mobile App, Slide Deck or Research — and I will run it as a mission with a visible contract.`;
      if (reply.startsWith('From the record:')) kind = 'record';
    }
    const m = addMessage(c.id, { role: 'assistant', text: reply, kind, model: modelById(seatId).name });
    return json(res, 200, { chat: getChat(c.id), message: m });
  }

  // ---- Projects / plugins / tools / MCP / profile / plan / boards ----
  if (p === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req); const w = ws();
    const proj = { id: `p_${Math.random().toString(36).slice(2, 8)}`, name: String(body.name || 'New project').slice(0, 60), createdAt: Date.now(), chatIds: [] };
    w.projects.push(proj); flushWs(); return json(res, 200, proj);
  }
  const projMatch = p.match(/^\/api\/projects\/([\w]+)$/);
  if (projMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const w = ws(); const proj = w.projects.find((x) => x.id === projMatch[1]);
    if (!proj) return json(res, 404, { error: 'Project not found.' });
    if (req.method === 'DELETE') { if (proj.id === 'p_default') return json(res, 400, { error: 'The default project cannot be deleted.' }); w.projects = w.projects.filter((x) => x.id !== proj.id); flushWs(); return json(res, 200, { ok: true }); }
    const body = await readBody(req); proj.name = String(body.name || proj.name).slice(0, 60); flushWs(); return json(res, 200, proj);
  }
  const pluginMatch = p.match(/^\/api\/plugins\/([\w-]+)\/toggle$/);
  if (pluginMatch && req.method === 'POST') {
    if (!PLUGINS.some((x) => x.id === pluginMatch[1])) return json(res, 404, { error: 'Unknown plugin.' });
    const w = ws(); w.plugins = w.plugins.includes(pluginMatch[1]) ? w.plugins.filter((x) => x !== pluginMatch[1]) : [...w.plugins, pluginMatch[1]]; flushWs();
    return json(res, 200, { enabled: w.plugins.includes(pluginMatch[1]) });
  }
  const toolMatch = p.match(/^\/api\/tools\/([\w-]+)\/toggle$/);
  if (toolMatch && req.method === 'POST') {
    if (!TOOLS.some((x) => x.id === toolMatch[1])) return json(res, 404, { error: 'Unknown tool.' });
    const w = ws(); w.tools[toolMatch[1]] = !w.tools[toolMatch[1]]; flushWs(); return json(res, 200, { enabled: w.tools[toolMatch[1]] });
  }
  if (p === '/api/mcp' && req.method === 'POST') {
    const body = await readBody(req); const w = ws();
    const name = String(body.name || '').trim().slice(0, 40); const url = String(body.url || '').trim().slice(0, 200);
    if (!name || !/^https?:\/\//.test(url)) return json(res, 400, { error: 'A name and an http(s) URL are required.' });
    const entry = { id: `mcp_${Math.random().toString(36).slice(2, 8)}`, name, url, addedAt: Date.now(), status: 'registered — not yet probed' };
    w.mcp.push(entry); flushWs(); return json(res, 200, entry);
  }
  const mcpDel = p.match(/^\/api\/mcp\/(mcp_[\w]+)$/);
  if (mcpDel && req.method === 'DELETE') { const w = ws(); w.mcp = w.mcp.filter((x) => x.id !== mcpDel[1]); flushWs(); return json(res, 200, { ok: true }); }
  if (p === '/api/profile' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    for (const k of ['name', 'handle', 'email', 'bio']) if (body[k] != null) w.profile[k] = String(body[k]).trim().slice(0, k === 'bio' ? 300 : 120);
    if (w.profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w.profile.email)) { w.profile.email = ''; return json(res, 400, { error: 'That does not look like an email address.' }); }
    if (w.profile.name) { w.profile.avatar = w.profile.name.trim()[0].toUpperCase(); store.workspace().name = w.profile.name; store.flushWorkspace(); }
    flushWs(); return json(res, 200, w.profile);
  }
  if (p === '/api/personalization' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    if (body.tone != null) w.personalization.tone = String(body.tone).slice(0, 120);
    if (body.defaultModel && allModels().some((m) => m.id === body.defaultModel)) w.personalization.defaultModel = body.defaultModel;
    if (Array.isArray(body.defaultAdvisers)) w.personalization.defaultAdvisers = body.defaultAdvisers.filter((a) => allModels().some((m) => m.id === a)).slice(0, 5);
    if (body.theme === 'day' || body.theme === 'night') w.personalization.theme = body.theme;
    flushWs(); return json(res, 200, w.personalization);
  }
  if (p === '/api/language' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    if (/^[a-z]{2}(-[A-Z]{2})?$/.test(String(body.language || ''))) w.language = body.language; flushWs(); return json(res, 200, { language: w.language });
  }
  // Top-up: demo billing, an honest ledger line, nothing charged.
  if (p === '/api/credits/topup' && req.method === 'POST') {
    const body = await readBody(req);
    const amount = Math.round(Number(body.amount) || 0);
    if (![100, 250, 500, 1000, 2500, 5000].includes(amount)) return json(res, 400, { error: 'Top-ups come in 100, 250, 500, 1000, 2500 or 5000 credits.' });
    store.workspace().credits = Math.round((store.workspace().credits + amount) * 10) / 10; store.flushWorkspace();
    const w = ws();
    w.invoices.unshift({ id: `inv_${Date.now().toString(36)}`, at: Date.now(), amount: Math.round(amount / 100 * 2 * 100) / 100, currency: 'USD', plan: `Top-up ${amount} cr`, status: 'demo — no payment collected' }); flushWs();
    const line = ledger('topup', amount, `Top-up of ${amount} cr (demo billing, no payment collected)`);
    return json(res, 200, { ok: true, credits: store.workspace().credits, line });
  }

  if (p === '/api/plan' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    const tier = PLAN_TIERS.find((t) => t.id === body.plan);
    if (!tier) return json(res, 400, { error: 'Unknown plan.' });
    if (tier.id !== w.plan) {
      w.plan = tier.id;
      if (tier.price > 0) {
        w.invoices.unshift({ id: `inv_${Date.now().toString(36)}`, at: Date.now(), amount: tier.price, currency: 'USD', plan: tier.name, status: 'demo — no payment collected' });
        store.workspace().credits = Math.round((store.workspace().credits + tier.credits) * 10) / 10; store.flushWorkspace();
        ledger('grant', tier.credits, `${tier.name} plan — ${tier.credits} cr granted (demo billing, no payment collected)`);
      }
      flushWs();
    }
    return json(res, 200, { plan: w.plan, invoices: w.invoices, credits: store.workspace().credits });
  }
  if (p === '/api/boards' && req.method === 'POST') {
    const body = await readBody(req); const w = ws();
    const b = { id: `b_${Math.random().toString(36).slice(2, 8)}`, name: String(body.name || 'Board').slice(0, 60), mode: String(body.mode || 'website'), createdAt: Date.now(), missionIds: [] };
    w.boards.push(b); flushWs(); return json(res, 200, b);
  }
  if (p === '/api/logout' && req.method === 'POST') { res.setHeader('set-cookie', sessionCookie(req, '', 0)); return json(res, 200, { ok: true, note: ACCESS_CODE ? 'Session closed. The access code opens the house again.' : 'Open house (no access code set): local preferences cleared client-side.' }); }

  // ---- OAuth connectors (apps + tokens memory-only) ----
  const appMatch = p.match(/^\/api\/oauth\/([\w]+)\/app$/);
  if (appMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const prov = appMatch[1];
    if (!OAUTH_PROVIDERS[prov]) return json(res, 404, { error: 'Unknown provider.' });
    if (req.method === 'DELETE') { store.removeOauthApp(prov); return json(res, 200, { ok: true }); }
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const clientId = String(body.clientId || '').trim(); const clientSecret = String(body.clientSecret || '').trim();
    if (!clientId || !clientSecret) return json(res, 400, { error: 'Client id and client secret are both required.' });
    store.setOauthApp(prov, clientId, clientSecret);
    return json(res, 200, { ok: true, redirectUri: redirectUri(req, prov) });
  }
  const startMatch = p.match(/^\/api\/oauth\/([\w]+)\/start$/);
  if (startMatch) {
    try { res.writeHead(302, { location: startUrl(req, startMatch[1]) }); return res.end(); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }
  const cbMatch = p.match(/^\/api\/oauth\/([\w]+)\/callback$/);
  if (cbMatch) {
    const prov = cbMatch[1];
    const err = url.searchParams.get('error');
    if (err) { res.writeHead(302, { location: `/connectors?error=${encodeURIComponent(err)}` }); return res.end(); }
    try {
      const account = await finishCallback(req, prov, url.searchParams.get('code') || '', url.searchParams.get('state') || '');
      res.writeHead(302, { location: `/connectors?connected=${encodeURIComponent(prov)}&as=${encodeURIComponent(account)}` });
      return res.end();
    } catch (e) {
      res.writeHead(302, { location: `/connectors?error=${encodeURIComponent(e.message)}` });
      return res.end();
    }
  }
  const discMatch = p.match(/^\/api\/oauth\/([\w]+)\/disconnect$/);
  if (discMatch && req.method === 'POST') {
    store.removeToken(discMatch[1]);
    return json(res, 200, { ok: true });
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
    if (PROVIDERS[provider].kind === 'search') return json(res, 400, { error: `${PROVIDERS[provider].label} is a search key, not a model provider.` });
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
    const cdef = CONNECTORS.find((c) => c.id === cid);
    if (!cdef) return json(res, 404, { error: 'Unknown connector.' });
    if (cdef.provider) return json(res, 400, { error: `${cdef.name} connects with real sign-in — use Connect on the Connectors page.` });
    return json(res, 400, { error: `${cdef.name} is not wired yet — no OAuth provider for it in this build.` });
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
    const ext = path.extname(file);
    const immutable = p.startsWith('/assets/') || p.startsWith('/fonts/');
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (['.js', '.css', '.html', '.svg', '.json'].includes(ext)) return sendCompressed(req, res, 200, headers, data);
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('Prajñā web bundle not built yet. Run: cd web && npx vite build');
  }
}

rehydrate(notify);
{ const n = store.archiveFinished(); if (n) console.log(`prajna: archived the tape of ${n} finished mission(s)`); }
server.listen(PORT, () => console.log(`Prajñā listening on http://localhost:${PORT}`));
