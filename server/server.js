// Prajñā: zero-dependency Node server: API + SSE + static SPA.
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, houseRevision } from './store.js';
import { MODELS, DESKS, SKILLS, CONNECTORS, modelById, allModels, bindCustomModels } from './catalog.js';
import { PROVIDERS, testKey, maskKey, synthesizeSpeech } from './providers.js';
import { liveSeat, editPlan, PLAN_TOOLS, keyPlanFor } from './engine.js';
import { OAUTH_PROVIDERS, providerForConnector, startUrl, finishCallback, redirectUri } from './oauth.js';
import { ws, flushWs, publicWs, createChat, getChat, addMessage, deleteChat, renameChat, DECK_TEMPLATES, PLUGINS, TOOLS, CONNECTOR_CATALOG, PLANS as PLAN_TIERS, chatFor } from './workspace.js';
import { callModel, streamModel, generateImage } from './providers.js';
import { DATA_DIR } from './store.js';
import { auditBundle } from './bundle.js';
import { recordContext, answerFromRecord, missionsOfChat, missionsFor, houseAnswer } from './record.js';
import { record as ledger } from './ledger.js';
import { digestText, sendMail, scheduleDigest } from './digest.js';
import { LEGAL, legalPage } from './legal.js';
import { missionDelta } from './delta.js';
import { costHistory, historyLine } from './history.js';
import { weeklyReview } from './review.js';
import { clarify } from './clarify.js';
import { search } from './search.js';
import { docxFromArtifact, pptxFromArtifact, xlsxFromMission } from './office.js';
import { limits, setLimits, usage as limitUsage, refusal as limitRefusal, limitHealth } from './limits.js';
import { checkMission as checkEvidence, sweep as sweepEvidence, evidenceHealth } from './evidence.js';
import { hooks, hookState, setHooks, fire as fireHook, fromMissionEvent, HOOK_EVENTS } from './hooks.js';
import { urlsIn, readPages } from './retrieve.js';
import { exportWorkspace, eraseFiles, importWorkspace, writeBackup, listBackups, readBackup, backupHealth } from './export.js';
import { applyEdits, stampEdit } from './canvas.js';
import { standingOrders, standingFor, addStandingOrder, removeStandingOrder, pauseStandingOrder, runOrder, scheduleStandingOrders, standingHealth, spentThisMonth, CADENCES } from './standing.js';
import { seedTestTokens, targets as connectorTargets, DELIVERABLE_CONNECTORS, deliver as deliverTo } from './connect.js';
import { extractText } from './docs.js';
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const STARTED_AT = Date.now();
let VERSION = '0.0.0';
try { VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version || VERSION; } catch { /* keep default */ }
// Release notes: the README's version sections, parsed once per request so
// an edit shows without a restart. Newest first.
function releases() {
  let md = '';
  try { md = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'README.md'), 'utf8'); } catch { return []; }
  const out = [];
  // A heading is "## vX.Y: Title (date)". The date may be written as
  // 2026-09-05 or as 5 Sep 2026; both parse, and both leave here as ISO.
  const re = /^## (v\d+\.\d+(?:\.\d+)?)[:,] ([^\n]+?)\s*(?:\((\d{4}-\d{2}-\d{2}|\d{1,2} [A-Z][a-z]{2} \d{4})\))?\s*$/gm;
  const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const iso = (d) => { if (!d) return null; const w = d.match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/); return w ? `${w[3]}-${MON[w[2]] || '01'}-${w[1].padStart(2, '0')}` : d; };
  let m; const marks = [];
  while ((m = re.exec(md))) marks.push({ index: m.index, end: m.index + m[0].length, version: m[1], title: m[2].trim(), date: iso(m[3]) });
  for (let i = 0; i < marks.length; i++) {
    const body = md.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    out.push({ version: marks[i].version, title: marks[i].title, date: marks[i].date, body });
  }
  return out.reverse();
}
// The house check: what the owner can run to know the house is sound.
// Every row is a real test against disk, ledger, tokens and links.
// The media store: every file the house drew or spoke, against every file a
// mission or the media index still points at. What nothing points at is an
// orphan, and a store on a small disk should not keep orphans.
function mediaStoreAudit() {
  const dir = path.join(DATA_DIR, 'media');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^[a-f0-9]{16}\.[a-z0-9]{2,5}$/.test(f)); } catch { files = []; }
  const referenced = new Set((ws().media || []).map((r) => r.id));
  for (const m of store.missions()) { for (const v of m.visuals || []) if (v.id) referenced.add(v.id); for (const n of m.narration || []) if (n.id) referenced.add(n.id); }
  let bytes = 0; const orphans = [];
  for (const f of files) { try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* gone */ } if (!referenced.has(f.split('.')[0])) orphans.push(f); }
  return { dir, files, bytes, orphans };
}
async function houseCheck() {
  const rows = [];
  const add = (id, ok, detail) => rows.push({ id, ok: !!ok, detail });
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); add('data-dir', true, `${DATA_DIR} is writable`); } catch { add('data-dir', false, `${DATA_DIR} is not writable`); }
  const ms = store.missions();
  const archived = ms.filter((m) => m.eventsArchived);
  const missingTapes = archived.filter((m) => !store.tape(m.id));
  add('tapes', missingTapes.length === 0, `${archived.length} archived tape(s), ${missingTapes.length} missing${missingTapes.length ? `: ${missingTapes.slice(0, 5).map((m) => m.serial).join(', ')}` : ''}`);
  const arts = store.artifacts();
  const missingHtml = arts.filter((a) => !store.artifactHtml(a.id));
  add('artifacts', missingHtml.length === 0, `${arts.length} artifact(s), ${missingHtml.length} without a file${missingHtml.length ? `: ${missingHtml.slice(0, 5).map((a) => a.serial).join(', ')}` : ''}`);
  const inflight = ms.filter((m) => m.status === 'LIVE' || m.status.startsWith('PAUSED'));
  const expected = Math.round(inflight.reduce((a, m) => a + Math.max(0, (m.contract?.ceiling || 0) - (m.spent || 0)), 0) * 10) / 10;
  const reserved = Math.round((store.workspace().reserved || 0) * 10) / 10;
  add('reserve', Math.abs(expected - reserved) < 0.2, `${reserved} cr reserved; ${inflight.length} in-flight ticket(s) still hold ${expected} cr of unspent ceiling`);
  const keys = Object.keys(store.keys()).filter((prov) => PROVIDERS[prov]?.kind !== 'search');
  const ranLive = store.missions().some((m) => m.authored?.live);
  add('keys', keys.length > 0 || !ranLive, keys.length
    ? `${keys.length} provider key(s) held in memory: ${keys.join(', ')}. They are never written to disk, so a restart clears them.`
    : ranLive
      ? 'no model key is held, though this house has written deliveries with one before: a restart clears keys, so load yours again under Your keys or every delivery will be composed or house-scripted'
      : 'no model key is held; deliveries will be composed from sources or house-scripted, and labelled as such');
  const lh = limitHealth(); add('limits', lh.ok, lh.detail);
  const log = ws().consentLog || [];
  const people = new Set(log.map((e) => `${e.name || ''}@${e.ip || ''}`));
  // What a held key can do now, and what its absence leaves to the house.
  // Like the keys row: a missing key is a fault only once a run has needed one.
  { const mediaOn = !!ws().tools?.media; const held = ['openai', 'google'].find((id) => store.keyFor(id));
    // A run that reached the illustrate step and found no key leaves an empty list; a seeded or scripted run leaves none.
    const needed = ms.some((m) => Array.isArray(m.visuals) && m.visuals.length === 0);
    add('media', !mediaOn || !!held || !needed, !mediaOn ? 'Media Generation is off under Tools: nothing is drawn or spoken on any key, the house draws its own visuals and the film reads with the browser voice'
      : held ? `Media Generation is on and a ${PROVIDERS[held]?.label || held} key is held: decks are illustrated and narrated, pages get a hero, apps an icon`
      : 'Media Generation is on but no image or speech key is in memory: the house draws its own visuals and the film reads with the browser voice; load an OpenAI or Google key under Your keys'); }
  { const ms2 = mediaStoreAudit(); add('media-store', ms2.orphans.length === 0, `${ms2.files.length} file(s), ${(ms2.bytes / 1048576).toFixed(1)} MB, ${ms2.orphans.length} orphan(s)${ms2.orphans.length ? ' pointed at by nothing; repair removes them' : ''}`); }
  add('door', !!ACCESS_CODE || people.size <= 1, ACCESS_CODE
    ? `an access code is set; ${people.size} ${people.size === 1 ? 'person has' : 'people have'} accepted the house rules`
    : people.size <= 1
      ? 'no access code: anyone with the address can enter, spend credits and read everything here'
      : `no access code, and ${people.size} different people have accepted the house rules: ${[...people].slice(0, 4).map((k) => k.split('@')[0] || 'unnamed').join(', ')}. Set PRAJNA_ACCESS_CODE to close the door.`);
  const eh = evidenceHealth(); if (eh) add('evidence', eh.ok, eh.detail);
  if (process.uptime() > 600 || listBackups().length) { const bh = backupHealth(); add('backups', bh.ok, bh.detail); }
  const sh = standingHealth();
  if (sh.total) add('standing', !sh.orphaned.length && !sh.overdue.length, `${sh.total} standing order(s)${sh.orphaned.length ? `, ${sh.orphaned.length} orphaned (ticket gone): ${sh.orphaned.map((o) => o.serial).join(', ')}` : ''}${sh.overdue.length ? `, ${sh.overdue.length} overdue by more than one interval: ${sh.overdue.map((o) => o.serial).join(', ')}` : ''}`);
  const c = ws().consent;
  add('consent', !!c && c.version === LEGAL.version, c ? `house rules ${c.version} accepted ${new Date(c.acceptedAt).toISOString().slice(0, 16)} UTC` : 'house rules not yet accepted');
  for (const [prov, tok] of Object.entries(store.state.tokens)) {
    try { const who = await OAUTH_PROVIDERS[prov].identity(tok.token); add(`token-${prov}`, true, `${prov}: token answers as ${who}`); }
    catch (e) { add(`token-${prov}`, false, `${prov}: token refused (${String(e.message || e).slice(0, 80)}); only a person can reconnect it, on the Connectors page`); }
  }
  const last = ms.flatMap((m) => (m.deliveries || []).filter((d) => d.ok && d.link && !d.linkRevokedAt)).sort((a, b) => b.at - a.at)[0];
  if (last) { try { const r = await fetch(last.link); add('last-delivery-link', r.ok, `${last.link} → ${r.status}`); } catch (e) { add('last-delivery-link', false, `${last.link} unreachable (${e.message})`); } }
  const result = { at: Date.now(), version: VERSION, ok: rows.filter((r) => r.ok).length, total: rows.length, rows };
  ws().lastHouseCheck = { at: result.at, ok: result.ok, total: result.total, failed: rows.filter((r) => !r.ok).map((r) => ({ id: r.id, detail: r.detail })) }; flushWs();
  return result;
}
// The repair: what the house can put right by itself. Each action is
// named in the result and the check runs again afterwards so the owner
// sees the house as it now stands, not as it was.
async function houseRepair() {
  const actions = [];
  const ms = store.missions();
  for (const m of ms.filter((x) => x.eventsArchived && !store.tape(x.id))) {
    if ((m.events || []).length) { m.eventsArchived = false; store.archiveMission(m); actions.push({ id: 'tapes', ok: true, detail: `${m.serial}: tape re-archived from ${m.events.length} event(s) still in the ledger` }); }
    else actions.push({ id: 'tapes', ok: false, detail: `${m.serial}: tape lost and no events remain to rebuild it; the record stays, the play-by-play is gone` });
  }
  for (const a of store.artifacts().filter((x) => !store.artifactHtml(x.id))) {
    const m = store.mission(a.missionId);
    try {
      if (!m || !GENERATORS[m.desk]) throw new Error('mission or desk generator missing');
      store.refreshArtifact(a.id, {}, GENERATORS[m.desk](store.missionFull(m.id)).html);
      actions.push({ id: 'artifacts', ok: true, detail: `${a.serial}: file regenerated from the mission record` });
    } catch (e) { actions.push({ id: 'artifacts', ok: false, detail: `${a.serial}: could not regenerate (${e.message})` }); }
  }
  const inflight = ms.filter((m) => m.status === 'LIVE' || m.status.startsWith('PAUSED'));
  const expected = Math.round(inflight.reduce((a, m) => a + Math.max(0, (m.contract?.ceiling || 0) - (m.spent || 0)), 0) * 10) / 10;
  const w = store.workspace();
  const drift = Math.round(((w.reserved || 0) - expected) * 10) / 10;
  if (Math.abs(drift) >= 0.2) {
    w.reserved = expected; w.credits = Math.round((w.credits + drift) * 10) / 10; store.flushWorkspace();
    ledger('reconcile', drift, `Reserve reconciled to the in-flight tickets: ${drift > 0 ? `${drift} cr returned to balance` : `${-drift} cr moved back into reserve`}`);
    actions.push({ id: 'reserve', ok: true, detail: `reserve set to ${expected} cr, ${drift > 0 ? `${drift} cr returned to balance` : `${-drift} cr taken from balance`}, ledger line written` });
  }
  { const ms2 = mediaStoreAudit(); let removed = 0, freed = 0;
    for (const f of ms2.orphans) { try { freed += fs.statSync(path.join(ms2.dir, f)).size; fs.unlinkSync(path.join(ms2.dir, f)); removed += 1; } catch { /* already gone */ } }
    if (removed) actions.push({ id: 'media-store', ok: true, detail: `${removed} orphan media file(s) removed, ${(freed / 1048576).toFixed(1)} MB freed; every file a mission or the media index points at was kept` }); }
  for (const o of standingHealth().orphaned) { pauseStandingOrder(o.id, true); actions.push({ id: 'standing', ok: true, detail: `${o.serial}: order paused, its ticket is gone; stop it under Settings or repeat another ticket` }); }
  const c = ws().consent;
  if (!c || c.version !== LEGAL.version) actions.push({ id: 'consent', ok: false, detail: 'only a person can accept the house rules; the acceptance screen opens on the next load' });
  return { actions, check: await houseCheck() };
}
// The house backs itself up: five minutes after boot if the latest backup
// is older than twenty hours, then once a day. Seven are kept.
function scheduleBackups() {
  const run = (force) => { try { const latest = listBackups()[0]; if (!force && latest && Date.now() - latest.at < 20 * 3600000) return; const r = writeBackup({ version: VERSION }); console.log(`prajna: backup ${r.name}, ${(r.bytes / 1024).toFixed(0)} KB, ${r.kept} kept`); } catch (e) { console.error('prajna: backup failed,', e.message); } };
  setTimeout(() => run(false), 5 * 60 * 1000).unref();
  setInterval(() => run(false), 24 * 60 * 60 * 1000).unref();
}
// The house checks itself a minute after boot and once a day after that;
// failures go to the log, the digest and the Home page.
function scheduleHouseCheck() {
  const run = () => houseCheck().then((r) => { const bad = r.rows.filter((x) => !x.ok); if (bad.length) fireHook('housecheck.failed', { failed: bad.map((x) => ({ id: x.id, detail: x.detail })), ok: r.ok, total: r.total }); if (bad.length) console.error(`prajna: house check found ${bad.length} problem(s): ${bad.map((x) => `${x.id} (${x.detail})`).join('; ')}`); else console.log(`prajna: house check ${r.ok} of ${r.total} ok`); }).catch((e) => console.error('prajna: house check failed to run,', e.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
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
    lastHouseCheck: ws().lastHouseCheck || null,
    // Seven days of history, oldest first: what started, what was delivered,
    // what was stopped, and the incidents the house records about itself,
    // retrieval failures and live models that could not author.
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
// Who is looking. A workspace is one house, but the person at the door is
// not the house: their name lives against their own signed cookie, so an
// empty browser sees no name at all until someone signs in.
function whoCookie(req, value, maxAge) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https');
  return `prajna_who=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
// The house's own signing secret: given by the environment, or minted once
// and kept with the workspace so a restart does not sign everyone out.
function houseSecret() {
  if (process.env.PRAJNA_SECRET) return process.env.PRAJNA_SECRET;
  const w = ws();
  if (!w.secret) { w.secret = crypto.randomBytes(32).toString('hex'); flushWs(); }
  return w.secret;
}
function signWho(id) { return `${id}.${crypto.createHmac('sha256', houseSecret()).update(id).digest('hex').slice(0, 24)}`; }
function whoId(req) {
  const raw = (String(req.headers.cookie || '').match(/prajna_who=([^;]+)/) || [])[1];
  if (!raw) return null;
  const [id, sig] = decodeURIComponent(raw).split('.');
  if (!id || !sig) return null;
  return signWho(id).endsWith(sig) ? id : null;
}
// The house's own: the first person to sign in, or whoever the environment
// names. House-wide acts, erasing, restoring, keys, limits, the door itself,
// belong to them; everyone else can work in the house without being able to
// take it apart. An unclaimed house lets anyone act, so a fresh one is usable.
function ownerName() { return String(process.env.PRAJNA_OWNER || '').trim(); }
function isOwner(req) {
  const w = ws();
  const named = ownerName();
  const me = meOf(req);
  if (named) return !!me && me.name.toLowerCase() === named.toLowerCase();
  if (!w.ownerId) return true; // nobody has claimed this house yet
  return whoId(req) === w.ownerId;
}
// The house-level acts that can destroy or redirect a house: erasing it,
// restoring over it, pointing its webhook elsewhere, setting who may do
// what. An unclaimed house lets anyone work in it so that a fresh house is
// usable; it does not let anyone take it apart. Those wait for an owner.
// After the house is replaced wholesale (erase, import, restore): the
// running signing secret stays, because an export never carries one and a
// new one would sign everyone out, owner included; and the person who did
// it owns the result, because they proved they own the house by doing it.
function keepHouse(secret, actorId, actor) {
  if (secret) ws().secret = secret;
  if (actorId && actor && actor.name) { visitors()[actorId] = { ...(visitors()[actorId] || {}), ...actor, lastSeen: Date.now() }; ws().ownerId = actorId; }
  flushWs();
}
function houseGate(req, res) {
  if (!(ws().ownerId || ownerName())) {
    json(res, 403, { error: 'This house has no owner yet, so nobody may erase it, restore over it, point its webhook elsewhere, set its guest policy, its limits, its instructions or its voice, or add or remove a model. Sign in under My Profile to claim it; the first name signed becomes the house\'s own.', unclaimed: true, owner: true });
    return true;
  }
  return ownerGate(req, res);
}
function ownerGate(req, res) {
  if (isOwner(req)) return false;
  const w = ws();
  const named = ownerName();
  const who = named || (w.visitors || {})[w.ownerId]?.name || "the house's own";
  const me = meOf(req);
  json(res, 403, {
    error: named && (!me || me.name.toLowerCase() !== named.toLowerCase())
      // The environment names the owner, so say exactly what to do about it.
      ? `This house is held for “${named}” by its environment. Sign in under My Profile with that name, exactly, and this is yours.${me ? ` You are signed in as “${me.name}”.` : ' Nobody is signed in on this browser.'}`
      : `Only ${who} can do that: it changes the house itself, not the work in it.`,
    owner: true, named: named || null,
  });
  return true;
}
// What a guest may do. The default is the house as it has always been:
// anyone inside may work. An owner who runs an open house can narrow it to
// asking without stamping, or to reading, without locking the door itself.
const GUEST_MODES = { work: 'may write tickets, stamp them and talk to the companion', ask: 'may write tickets and talk, but only the house\'s own may stamp a ticket and spend', read: 'may read the record, and nothing else' };
function guestMode() { const m = ws().guests; return GUEST_MODES[m] ? m : 'work'; }
// Returns false when the act is allowed; otherwise answers and returns true.
function guestGate(req, res, act) {
  if (isOwner(req)) return false;
  const mode = guestMode();
  if (mode === 'work') return false;
  if (mode === 'ask' && act !== 'spend') return false;
  const w = ws();
  const who = (w.visitors || {})[w.ownerId]?.name || ownerName() || "the house's own";
  json(res, 403, { error: mode === 'read'
    ? `This house is open to read. Only ${who} can ${act === 'spend' ? 'stamp a ticket' : 'write or talk here'}.`
    : `Only ${who} can stamp a ticket and spend the house's credits. Write the ticket and it will wait for them.`, guests: mode });
  return true;
}
// Consent is a person's, not a building's. One visitor accepting the house
// rules used to open the door for every stranger who followed, which is
// exactly the wrong reading of a document that says "you agree". A browser
// carries its own identity, so it answers for its own acceptance; a client
// with no identity at all (a script at the API) falls back to the house's
// record, which is the acceptance somebody did make.
function myConsent(req) {
  const id = whoId(req);
  if (!id) return ws().consent || null;
  return visitors()[id]?.consent || null;
}
function consentOk(req) { const c = myConsent(req); return !!c && c.version === LEGAL.version; }
// The only writes that answer before the door and the guest policy: reading
// the door itself, accepting the house rules, signing in, and leaving.
const OPEN_TO_ALL = ['/api/session', '/api/consent', '/api/logout', '/api/me'];
function visitors() { const w = ws(); if (!w.visitors || typeof w.visitors !== 'object') w.visitors = {}; return w.visitors; }
// Every browser that accepts the house rules leaves a record, and a public
// address means that number only goes up. Signed names and the house's own
// are kept for good; anonymous acceptances are kept to the most recent five
// hundred, which is a long memory for a record nobody is named in.
function pruneVisitors() {
  const w = ws(); const v = visitors();
  const anon = Object.entries(v).filter(([id, x]) => id !== w.ownerId && !(x && x.name));
  if (anon.length <= 500) return 0;
  anon.sort((a, b2) => (b2[1]?.consent?.acceptedAt || b2[1]?.at || 0) - (a[1]?.consent?.acceptedAt || a[1]?.at || 0));
  for (const [id] of anon.slice(500)) delete v[id];
  return anon.length - 500;
}
function meOf(req) { const id = whoId(req); const v = id ? visitors()[id] : null; return v && v.name ? { name: v.name || '', email: v.email || '', handle: v.handle || '', bio: v.bio || '', avatar: (v.name || '?').trim()[0]?.toUpperCase() || '?', since: v.at } : null; }

function sessionCookie(req, value, maxAge) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https');
  return `prajna_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
// Per-address rate limits, fixed windows, memory only. Buckets: the access
// code (a dozen tries per ten minutes), public share links and locked-out API
// calls (sixty a minute each), enough for people, not for scanners.
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

// Attachments with text on the table: plain text as sent; Word, PowerPoint and
// Excel through the Documents plugin. Anything else is recorded by name only.
function docsFrom(body) {
  const docsPlugin = (ws().plugins || []).includes('documents');
  return (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).map((a) => {
    if (!a || typeof a !== 'object') return null;
    const name = String(a.name || 'attachment').slice(0, 120);
    if (typeof a.text === 'string' && a.text.trim()) return { name, text: String(a.text).slice(0, 200000) };
    if (typeof a.base64 === 'string' && /\.(docx|pptx|xlsx)$/i.test(name)) {
      if (!docsPlugin) return null;
      try { const text = extractText(name, Buffer.from(a.base64, 'base64')); return text ? { name, text } : null; } catch { return null; }
    }
    return null;
  }).filter(Boolean);
}
// Pages named in a goal are read when the ticket is written, so they are on
// the table before stamping; only with the Browser tool on.
async function pagesFor(goal) {
  if (!ws().tools?.browser) return [];
  const urls = urlsIn(goal);
  if (!urls.length) return [];
  return (await readPages(urls)).filter((r) => !r.error);
}
/* --------------------------------- seeding -------------------------------- */

function seed() {
  if (store.missions().length > 0) return;
  const day = 86400000;
  const seeds = [
    { goal: 'State of AI agent platforms, who wins the enterprise?', deskId: 'brief', lead: 'opus', advisers: ['gpt', 'deepseek'], age: 2.1 * day, spent: 61.4 },
    { goal: 'Series A pitch for a carbon-accounting startup', deskId: 'deck', lead: 'sonnet', advisers: ['gpt', 'gemini'], age: 1.3 * day, spent: 49.7 },
    { goal: 'Cohort retention for our Q2 signups: where is the leak?', deskId: 'analysis', lead: 'opus', advisers: ['deepseek', 'llama'], age: 0.4 * day, spent: 55.2 },
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
  try { fromMissionEvent(missionId, event); } catch (e) { console.error('prajna: webhook,', e.message); }
  const subs = subscribers.get(missionId);
  if (!subs) return;
  const line = `${event.seq ? `id: ${event.seq}\n` : ''}data: ${JSON.stringify(event)}\n\n`;
  for (const res of subs) res.write(line);
}

/* --------------------------------- helpers -------------------------------- */

// Strip the persisted run script from API payloads: it's runner state, not
// client data.
function pub(m) {
  if (!m || typeof m !== 'object') return m;
  const { runScript, deferredCost, ...rest } = m;
  const so = m.id ? standingFor(m.id) : null;
  return so ? { ...rest, standing: { id: so.id, cadence: so.cadence, nextAt: so.nextAt, paused: so.paused } } : rest;
}
// Boards never need the event ledger, the run view streams it, and no list
// needs the tape, the validator rows, the authored substance, the narrative
// or a source's full extract: the run page fetches the whole mission when it
// opens one. Bootstrap carries what the lists actually read, so the payload
// stops growing with the length of the house's memory.
function lean(m) {
  const { events, validations, narrative, authored, sources, critiques, evidence, gateResult, review, retrieval, dissent, keyUse, attention, contract, ...rest } = pub(m);
  return {
    ...rest,
    eventCount: rest.eventCount ?? (events || []).length,
    // Counts and verdicts the boards and the dashboard read, without the rows.
    validations: (validations || []).map((v) => ({ round: v.round, gate: v.gate ? { cleared: !!v.gate.cleared } : null })),
    gateResult: gateResult ? { cleared: !!gateResult.cleared } : null,
    authored: authored ? { live: !!authored.live, composed: !!authored.composed, model: authored.model || null } : null,
    // A source without its extract: the count, the title and the address stand.
    sources: (sources || []).map((x) => ({ id: x.id, title: x.title, url: x.url, engine: x.engine, kind: x.kind, retrieved: x.retrieved, words: x.words })),
    // Decisions still waiting travel whole; decided ones keep only their answer.
    attention: (attention || []).map((a) => (a.decision ? { id: a.id, kind: a.kind, decision: a.decision, decidedAt: a.decidedAt } : a)),
    contract: contract ? { ...contract, why: undefined, plan: (contract.plan || []).map(({ rationale, ...step }) => step) } : contract,
    narrative: narrative ? true : null,
  };
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
// A raw body for uploads (the export zip); bigger limit, a Buffer, no parsing.
function readRaw(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0; let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c) => { size += c.length; if (size > limit) { done({ __tooLarge: true }); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', () => done({ __error: true }));
  });
}
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

// The Claude Skills plugin is what puts skill steps on tickets.
function skillsInstalled() { return (ws().plugins || []).includes('claude-skills') ? connectorState().skills : []; }

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
  if (p === '/api/releases' && req.method === 'GET') return json(res, 200, { current: VERSION, releases: releases() });
  if (p === '/api/hooks' && req.method === 'GET') { if (!authed(req)) return json(res, 401, { locked: true }); return json(res, 200, { hooks: hookState(), events: HOOK_EVENTS }); }
  if (p === '/api/limits' && req.method === 'GET') { if (!authed(req)) return json(res, 401, { locked: true }); return json(res, 200, { limits: limits(), usage: limitUsage() }); }
  if (p === '/api/search' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (limited(ipOf(req), 'search', 120, 60000)) return json(res, 429, { error: 'Too many searches. Wait a minute.' });
    return json(res, 200, search(url.searchParams.get('q') || '', { limit: Math.min(50, Number(url.searchParams.get('limit')) || 24) }));
  }
  if (p === '/api/backups' && req.method === 'GET') { if (!authed(req)) return json(res, 401, { locked: true }); return json(res, 200, { backups: listBackups(), health: listBackups().length ? backupHealth() : null }); }
  const backupGet = p.match(/^\/api\/backups\/([\w.-]+)$/);
  if (backupGet && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const buf = readBackup(backupGet[1]); if (!buf) return json(res, 404, { error: 'No such backup.' });
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': buf.length, 'content-disposition': `attachment; filename="${backupGet[1]}"`, 'cache-control': 'no-store' });
    return res.end(buf);
  }
  if (p === '/api/export' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const { zip, count } = exportWorkspace({ version: VERSION });
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': zip.length, 'content-disposition': `attachment; filename="prajna-export-${new Date().toISOString().slice(0, 10)}.zip"`, 'cache-control': 'no-store', 'x-entries': String(count) });
    return res.end(zip);
  }
  // The cheap question: has anything changed? A tab asks this, not for the
  // whole workspace, and pulls the workspace only when the answer moves.
  if (p === '/api/clarify' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const body = await readBody(req);
    return json(res, 200, clarify(String(body.goal || ''), String(body.deskId || 'brief')));
  }
  if (p === '/api/review' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const weeks = Math.max(1, Math.min(8, Number(url.searchParams.get('weeks')) || 1));
    return json(res, 200, weeklyReview({ weeks }));
  }
  if (p === '/api/history' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const h = costHistory({ desk: url.searchParams.get('desk') || 'brief', depth: url.searchParams.get('depth') || null, variant: url.searchParams.get('variant') || null });
    return json(res, 200, { ...h, line: historyLine(h, Number(url.searchParams.get('estimate')) || null) });
  }
  if (p === '/api/pulse' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const pending = store.missions().reduce((a, m) => a + (m.attention || []).filter((x) => !x.decision).length, 0);
    return json(res, 200, { rev: houseRevision(), pending, live: store.missions().filter((m) => m.status === 'LIVE').length });
  }
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
<div><span class="k">Last delivery</span><b>${h.lastDeliveryAt ? new Date(h.lastDeliveryAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '–'}</b></div>
<div><span class="k">Data directory</span><b>${h.dataWritable ? 'writable' : 'READ-ONLY'}</b></div>
<div><span class="k">Memory</span><b>${h.memoryMb} MB</b></div>
<div><span class="k">Last house check</span><b>${h.lastHouseCheck ? `${h.lastHouseCheck.ok} of ${h.lastHouseCheck.total} ok, ${new Date(h.lastHouseCheck.at).toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'not run yet'}</b></div>
</div>
<h2 style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#9a9583;margin:1.6rem 0 .5rem">Last seven days · UTC</h2>
<table style="width:100%;border-collapse:collapse;font-size:.85rem"><thead><tr style="color:#9a9583;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase"><th style="text-align:left;padding:.3rem 0">Day</th><th style="text-align:right">Started</th><th style="text-align:right">Delivered</th><th style="text-align:right">Stopped</th><th style="text-align:right">Incidents</th></tr></thead><tbody>${h.days.map((d) => `<tr style="border-top:1px solid #2a2f2a"><td style="padding:.35rem 0">${d.date}</td><td style="text-align:right">${d.started}</td><td style="text-align:right">${d.delivered}</td><td style="text-align:right">${d.stopped}</td><td style="text-align:right;color:${d.incidents ? '#ffb300' : 'inherit'}">${d.incidents}</td></tr>`).join('')}</tbody></table>
<p class="note">An incident is a retrieval failure or a live model that could not author, recorded on the tape, never hidden.</p>
<p class="note">Machine-readable: <a href="/api/health">/api/health</a>. Nothing here is secret; keys and tokens never leave memory. <a href="/">Open the workspace</a>.</p>
</div></body></html>`;
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, page);
  }

  // ---- The house rules: public pages, the JSON the acceptance screen reads, and the acceptance itself ----
  const legalMatch = p.match(/^\/legal\/(terms|privacy|ai)$/);
  if (legalMatch) return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, legalPage(legalMatch[1]));
  if (p === '/legal') { res.writeHead(302, { location: '/legal/terms' }); return res.end(); }
  if (p === '/api/legal') return json(res, 200, LEGAL);
  if (p === '/api/consent') {
    if (req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { locked: true, error: 'Session required.' });
      const body = await readBody(req);
      if (body.accept !== true || body.version !== LEGAL.version) return json(res, 400, { error: 'Acceptance must name the current version and accept all three documents.' });
      const w = ws();
      const entry = { version: LEGAL.version, acceptedAt: Date.now(), name: String(body.name || w.profile?.name || '').trim().slice(0, 120) || null, ip: ipOf(req) || null, agent: String(req.headers['user-agent'] || '').slice(0, 200) };
      // Against this person first. A visitor with no identity yet is given
      // one here, so their acceptance has somewhere of their own to live.
      let wid = whoId(req);
      if (!wid) { wid = crypto.randomBytes(12).toString('hex'); res.setHeader('set-cookie', whoCookie(req, encodeURIComponent(signWho(wid)), 60 * 60 * 24 * 365)); }
      const v = visitors(); v[wid] = { ...(v[wid] || { at: Date.now() }), consent: entry };
      pruneVisitors();
      // And against the house, which is what the house check and the record
      // read: the acceptance that opened this workspace in the first place.
      if (!w.consent || w.consent.version !== LEGAL.version) w.consent = entry;
      if (!Array.isArray(w.consentLog)) w.consentLog = [];
      const known = w.consentLog.some((e) => e.ip === entry.ip && e.name === entry.name);
      w.consentLog.unshift(entry);
      if (w.consentLog.length > 50) w.consentLog.length = 50;
      flushWs();
      console.log(`prajna: house rules accepted by ${entry.name || 'someone unnamed'} from ${entry.ip || 'an unknown address'}${known ? ' (seen before)' : ' (new)'}`);
      if (!known) fireHook('house.entered', { who: { name: entry.name, ip: entry.ip, agent: entry.agent }, accepted: entry.version, open: !ACCESS_CODE, people: w.consentLog.length });
      return json(res, 200, { ok: true, consent: w.consent });
    }
    return json(res, 200, { version: LEGAL.version, accepted: consentOk(req), consent: myConsent(req), house: ws().consent || null });
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
  // A shared delivery can be taken away, not only read: the same formats the
  // owner has, at the same link, with no account and no key.
  const sharedFile = p.match(/^\/s\/([a-f0-9]{32})\.(docx|pptx|xlsx)$/);
  if (sharedFile) {
    if (limited(ipOf(req), 'share', 60, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests. Try again in a minute.'); }
    const a = store.artifacts().find((x) => x.shareToken === sharedFile[1]);
    const html = a ? store.artifactHtml(a.id) : null;
    if (!a || !html) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('This share link is not on the books, it may have been revoked.'); }
    const m = a.missionId ? store.mission(a.missionId) : null;
    const link = m?.shareToken ? `${(process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '')}/r/${m.shareToken}` : null;
    const kind = sharedFile[2];
    const buf = kind === 'docx' ? docxFromArtifact({ artifact: a, mission: m, html, publicUrl: link })
      : kind === 'pptx' ? pptxFromArtifact({ artifact: a, mission: m, html, mediaBytes: (name) => { try { return fs.readFileSync(path.join(MEDIA_DIR, path.basename(name))); } catch { return null; } }, publicUrl: link })
      : m && xlsxFromMission({ artifact: a, mission: m, publicUrl: link });
    if (!buf) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end(kind === 'pptx' ? 'This delivery has no slides.' : 'This delivery has no data table.'); }
    const type = kind === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : kind === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const file = `${a.serial || 'prajna'}-${String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'delivery'}.${kind}`;
    res.writeHead(200, { 'content-type': type, 'content-length': buf.length, 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    return res.end(buf);
  }

  const shared = p.match(/^\/s\/([a-f0-9]{32})$/);
  if (shared) {
    if (limited(ipOf(req), 'share', 60, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests. Try again in a minute.'); }
    const a = store.artifacts().find((x) => x.shareToken === shared[1]);
    const html = a ? store.artifactHtml(a.id) : null;
    if (!html) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>Not shared</title><p style="font:16px system-ui;padding:3rem">This share link is not on the books, it may have been revoked.</p>'); }
    const m = a.missionId ? store.mission(a.missionId) : null;
    const has = { docx: true, pptx: /<section class="slide/.test(html), xlsx: !!m?.data?.series };
    const bar = `<div style="position:sticky;top:0;z-index:99;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.55rem .9rem;background:#121614;color:#efe7d6;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;letter-spacing:.06em">
<span style="text-transform:uppercase;color:#a8ab9c">Shared delivery · ${String(a.serial || '').replace(/[<>&"]/g, '')}</span><span style="flex:1"></span>
<a href="/s/${a.shareToken}.docx" style="color:#ffb300;text-decoration:none;border:1px solid #3a3d36;border-radius:6px;padding:.25rem .6rem">Word</a>
${has.pptx ? `<a href="/s/${a.shareToken}.pptx" style="color:#ffb300;text-decoration:none;border:1px solid #3a3d36;border-radius:6px;padding:.25rem .6rem">PowerPoint</a>` : ''}
${has.xlsx ? `<a href="/s/${a.shareToken}.xlsx" style="color:#ffb300;text-decoration:none;border:1px solid #3a3d36;border-radius:6px;padding:.25rem .6rem">Excel</a>` : ''}
</div>`;
    const withBar = html.replace(/<body([^>]*)>/i, (mm, attrs) => `<body${attrs}>${bar}`);
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }, withBar);
  }

  // Shared mission record (public by explicit share link): the audit bundle.
  const sharedRun = p.match(/^\/r\/([a-f0-9]{32})$/);
  if (sharedRun) {
    if (limited(ipOf(req), 'share', 60, 60000)) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('Too many requests. Try again in a minute.'); }
    const m = store.missions().find((x) => x.shareToken === sharedRun[1]);
    if (!m) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>Not shared</title><p style="font:16px system-ui;padding:3rem">This record link is not on the books, it may have been revoked.</p>'); }
    const full = store.missionFull(m.id);
    const a = full.artifactId ? store.artifact(full.artifactId) : null;
    return sendCompressed(req, res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }, auditBundle(pub(full), a, full.artifactId ? store.artifactHtml(full.artifactId) : null, { publicUrl: (process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, ''), artifactPath: a?.shareToken ? `/s/${a.shareToken}` : null }));
  }

  // Nothing that changes the workspace runs before the house rules are accepted.
  if (p.startsWith('/api/') && req.method !== 'GET' && !OPEN_TO_ALL.includes(p)) {
    if (!consentOk(req)) return json(res, 403, { consentRequired: true, version: LEGAL.version, error: 'Accept the Terms, the Privacy and GDPR Policy and the AI Disclaimer before using the workspace.' });
    // Default deny, in one place. Gates written route by route are only as
    // good as the last route somebody remembered to gate, and a dozen of
    // them had been forgotten: a stranger with no cookie could delete this
    // house's models, projects, chats and MCP servers. The door and the
    // guest policy now apply to every write in the building, and a route
    // that wants to be looser has to say so on the list above.
    if (!authed(req)) return json(res, 401, { locked: true });
    if (guestGate(req, res, 'write')) return;
  }

  // ---- Backups: run now, list, download, restore ----
  if (p === '/api/guests' && req.method === 'PUT') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    const mode = String(body.mode || '');
    if (!GUEST_MODES[mode]) return json(res, 400, { error: `Choose one of: ${Object.keys(GUEST_MODES).join(', ')}.` });
    ws().guests = mode; flushWs();
    console.log(`prajna: guests ${mode} (${GUEST_MODES[mode]})`);
    return json(res, 200, { guests: mode, means: GUEST_MODES[mode] });
  }
  if (p === '/api/housebrief' && req.method === 'PUT') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    const text = String(body.text || '').trim().slice(0, 2000);
    ws().houseBrief = text; flushWs();
    return json(res, 200, { houseBrief: text, chars: text.length });
  }
  // The narration voice: a name the speech provider knows, kept on the house
  // and used by every film from then on. Preview speaks one line on the key
  // so the choice can be heard before a deck is run.
  if (p === '/api/voice' && req.method === 'PUT') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    const voice = String(body.voice || '').trim().slice(0, 40);
    if (voice && !/^[A-Za-z][A-Za-z0-9 _-]{1,39}$/.test(voice)) return json(res, 400, { error: 'A voice is a short name the provider knows, such as alloy or Kore.' });
    ws().voice = voice || null; flushWs();
    return json(res, 200, { voice: ws().voice });
  }
  if (p === '/api/voice/preview' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (ownerGate(req, res)) return;
    const body = await readBody(req);
    const prov = ['openai', 'google'].find((id) => store.keyFor(id));
    if (!prov) return json(res, 400, { error: 'No speech key in memory. Load an OpenAI or Google key under Your keys to hear a voice.' });
    const k = store.keyFor(prov);
    const voice = String(body.voice || ws().voice || '').trim().slice(0, 40) || null;
    try {
      const out = await synthesizeSpeech({ provider: prov, key: k.key, baseUrl: k.baseUrl, voice, text: String(body.text || '').trim().slice(0, 200) || 'This is how the film will sound. Every slide is read in this voice, from its own notes.' });
      res.writeHead(200, { 'content-type': out.mime, 'content-length': out.bytes.length, 'cache-control': 'no-store', 'x-voice': out.voice, 'x-model': out.model });
      return res.end(out.bytes);
    } catch (e) {
      return json(res, 400, { error: `${PROVIDERS[prov]?.label || prov} refused: ${String(e.message || e).slice(0, 200)}` });
    }
  }
  if (p === '/api/hooks' && req.method === 'PUT') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    const r = setHooks(body || {});
    if (r.error) return json(res, 400, { error: r.error });
    return json(res, 200, r);
  }
  if (p === '/api/hooks/test' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    if (!hooks().url) return json(res, 400, { error: 'Give the house an address first.' });
    const r = await fireHook('housecheck.failed', { test: true, note: 'A test from the house. Nothing is wrong.' }, { force: true });
    return json(res, 200, { sent: !!r, ...r, log: hookState().log });
  }
  if (p === '/api/limits' && req.method === 'PUT') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    const r = setLimits(body || {});
    if (r.error) return json(res, 400, { error: r.error });
    console.log(`prajna: house limits set to ${JSON.stringify(r.limits)}`);
    return json(res, 200, { limits: r.limits, usage: limitUsage() });
  }
  if (p === '/api/backup' && req.method === 'POST') { if (!authed(req)) return json(res, 401, { locked: true }); if (ownerGate(req, res)) return; try { return json(res, 200, writeBackup({ version: VERSION })); } catch (e) { return json(res, 500, { error: `Backup failed: ${e.message}` }); } }
  const backupOne = p.match(/^\/api\/backups\/([\w.-]+)\/restore$/);
  if (backupOne && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    if (body.confirm !== 'REPLACE') return json(res, 400, { error: 'Type REPLACE to confirm. Nothing was changed.' });
    const buf = readBackup(backupOne[1]);
    if (!buf) return json(res, 404, { error: 'No such backup.' });
    for (const m of store.missions()) if (m.status === 'LIVE' || m.status.startsWith('PAUSED')) { try { killMission(m.id, notify); } catch { /* best effort */ } }
    const secret = ws().secret || null; const actorId = whoId(req); const actor = actorId ? { ...(visitors()[actorId] || {}) } : null;
    const r = importWorkspace(buf);
    if (r.error) return json(res, 400, { error: r.error });
    keepHouse(secret, actorId, actor);
    store.flushMissions(); store.flushArtifacts(); store.flushWorkspace(); if (store.state.connectors) store.flushConnectors(); store.flushModels();
    console.log(`prajna: workspace restored from backup ${backupOne[1]}`);
    return json(res, 200, { ok: true, ...r, from: backupOne[1] });
  }

  // ---- Restore: a workspace export goes back in whole, by typed confirmation ----
  if (p === '/api/import' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    if (url.searchParams.get('confirm') !== 'REPLACE') return json(res, 400, { error: 'Add ?confirm=REPLACE: the restore replaces the whole workspace. Nothing was changed.' });
    const buf = await readRaw(req);
    if (buf.__tooLarge) return json(res, 413, { error: 'The export is larger than 64 MB.' });
    if (!Buffer.isBuffer(buf) || buf.length < 22) return json(res, 400, { error: 'Send the export zip as the request body.' });
    for (const m of store.missions()) if (m.status === 'LIVE' || m.status.startsWith('PAUSED')) { try { killMission(m.id, notify); } catch { /* best effort */ } }
    const secret = ws().secret || null; const actorId = whoId(req); const actor = actorId ? { ...(visitors()[actorId] || {}) } : null;
    const r = importWorkspace(buf);
    if (r.error) return json(res, 400, { error: r.error });
    keepHouse(secret, actorId, actor);
    store.flushMissions(); store.flushArtifacts(); store.flushWorkspace(); if (store.state.connectors) store.flushConnectors(); store.flushModels();
    console.log(`prajna: workspace restored from export (${r.missions} missions, ${r.artifacts} artifacts, ${r.files} files, ${r.tapes} tapes, ${r.interrupted} interrupted)`);
    return json(res, 200, { ok: true, ...r });
  }

  // ---- Erase: the owner's own workspace, by typed confirmation, then a fresh house ----
  if (p === '/api/erase' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    if (houseGate(req, res)) return;
    const body = await readBody(req);
    if (body.confirm !== 'ERASE') return json(res, 400, { error: 'Type ERASE to confirm. Nothing was removed.' });
    const before = { missions: store.missions().length, artifacts: store.artifacts().length, chats: (ws().chats || []).length, media: (ws().media || []).length };
    for (const m of store.missions()) if (m.status === 'LIVE' || m.status.startsWith('PAUSED')) { try { killMission(m.id, notify); } catch { /* best effort */ } }
    const kept = ws().consent ? { version: ws().consent.version, acceptedAt: ws().consent.acceptedAt } : null;
    // The person erasing proved they own the house. They own the fresh one
    // too: the signing secret survives so their cookie still names them,
    // their record and acceptance come across, and the house is not left
    // unclaimed for the next stranger through the door.
    const secret = ws().secret || null;
    const eraserId = whoId(req);
    const eraser = eraserId ? { ...(visitors()[eraserId] || {}) } : null;
    const removed = eraseFiles();
    store.state.missions = []; store.state.artifacts = []; store.state.workspace = null; store.state.connectors = null; store.state.customModels = [];
    store.state.keys = {}; store.state.oauthApps = {}; store.state.tokens = {};
    store.state.ws = null;
    if (kept) ws().consent = kept;
    keepHouse(secret, eraserId, eraser);
    seed();
    store.flushMissions(); store.flushArtifacts(); store.flushWorkspace();
    console.log(`prajna: workspace erased by the owner (${before.missions} missions, ${before.artifacts} artifacts, ${before.chats} chats, ${before.media} media); fresh house seeded`);
    return json(res, 200, { ok: true, removed: before, files: removed.files, consentKept: !!kept });
  }

  // ---- Evidence: the addresses a delivery cites, re-visited ----
  if (p === '/api/evidence' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const r = await sweepEvidence({ limit: 15 });
    console.log(`prajna: evidence sweep, ${r.checked} address(es) across ${r.missions} deliveries, ${r.dead} gone`);
    return json(res, 200, r);
  }
  const evidenceOne = p.match(/^\/api\/missions\/([\w]+)\/evidence$/);
  if (evidenceOne && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const e = await checkEvidence(evidenceOne[1]);
    if (!e) return json(res, 404, { error: 'Mission not found.' });
    return json(res, 200, e);
  }

  // ---- The house check and its repair (after the gate: both change the workspace) ----
  if (p === '/api/housecheck/repair' && req.method === 'POST') { if (!authed(req)) return json(res, 401, { locked: true }); if (ownerGate(req, res)) return; return json(res, 200, await houseRepair()); }
  if (p === '/api/housecheck' && req.method === 'POST') { if (!authed(req)) return json(res, 401, { locked: true }); return json(res, 200, await houseCheck()); }

  // A shared page is public by its link, and its pictures and narration
  // must be too, or the recipient sees a deck with holes in it. A media file
  // is public exactly while some artifact whose mission points at it is
  // shared, and by its unguessable id; revoke the share and it is private again.
  const publicMedia = req.method === 'GET' && p.match(/^\/api\/media\/([a-f0-9]{16})(?:\.[a-z0-9]{2,5})?$/);
  if (publicMedia && !authed(req)) {
    const id = publicMedia[1];
    const sharedMissions = new Set(store.artifacts().filter((a) => a.shareToken && a.missionId).map((a) => a.missionId));
    const open = store.missions().some((m) => sharedMissions.has(m.id) && ((m.visuals || []).some((v) => v.id === id) || (m.narration || []).some((n) => n.id === id)));
    const rec = open ? ws().media.find((m) => m.id === id) : null;
    if (rec) {
      try {
        const bytes = fs.readFileSync(path.join(MEDIA_DIR, `${rec.id}.${rec.ext}`));
        res.writeHead(200, { 'content-type': rec.mime, 'cache-control': 'public, max-age=3600', 'content-length': bytes.length });
        return res.end(bytes);
      } catch { return json(res, 404, { error: 'The file is gone from the data directory.' }); }
    }
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
      legalVersion: LEGAL.version,
      houseCheck: ws().lastHouseCheck || null,
      standing: standingOrders().map((o) => ({ ...o, spentThisMonth: spentThisMonth(o) })),
      backups: listBackups().slice(0, 5),
      limits: limits(),
      hooks: hookState(),
      houseBrief: ws().houseBrief || '',
      voice: ws().voice || null,
      keysHeld: Object.keys(store.keys()).filter((prov) => PROVIDERS[prov]?.kind !== 'search').length,
      ranLive: store.missions().some((m) => m.authored?.live),
      me: meOf(req),
      guests: guestMode(),
      owner: { name: (ws().visitors || {})[ws().ownerId]?.name || ownerName() || null, mine: isOwner(req) },
      people: Object.keys(ws().visitors || {}).length,
      // Who accepted the house rules, with their address and browser, is the
      // owner's record. Everyone else gets the count and nothing about anyone.
      // And only a real owner: an unclaimed house lets anyone act so that a
      // fresh house is usable, but other people's names and addresses are
      // not part of that bargain.
      consentLog: isOwner(req) && (ws().ownerId || ownerName()) ? (ws().consentLog || []).slice(0, 12) : [],
      openHouse: !ACCESS_CODE,
      evidenceSweep: ws().lastEvidenceSweep || null,
      limitUsage: limitUsage(),
      connectorTargets: connectorTargets(),
      deliverableConnectors: DELIVERABLE_CONNECTORS,
      // Four characters of a key at each end, the endpoint it calls and the
      // hour it arrived are the owner's business. A guest can see that the
      // house holds a key, which is what tells them their work will run
      // live, and nothing more about it.
      keys: isOwner(req) ? Object.fromEntries(Object.entries(store.keys()).map(([prov, k]) => [prov, { masked: maskKey(k.key), baseUrl: k.baseUrl, addedAt: k.addedAt }])) : {},
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
      ...publicWs(whoId(req)),
      consent: myConsent(req),
      oauthApps: Object.fromEntries(Object.entries(OAUTH_PROVIDERS).map(([id, p]) => [id, { label: p.label, covers: p.covers, console: p.console, configured: !!store.oauthApp(id), clientId: isOwner(req) ? (store.oauthApp(id)?.clientId || null) : null, connectedAs: store.token(id)?.account || null, redirectUri: redirectUri(req, id) }])),
      missions: store.missions().map(lean),
      // A delivery whose mission has a data table can leave as a workbook.
      artifacts: store.artifacts().map((a) => (a.missionId && store.mission(a.missionId)?.data?.series ? { ...a, hasData: true } : a)),
    });
  }

  if (p === '/api/missions' && req.method === 'POST') {
    if (guestGate(req, res, 'write')) return;
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
    const mission = writeContract({ by: meOf(req)?.name || null, goal, deskId: body.deskId || 'brief', lead, advisers, installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(), variant: body.variant === 'design' ? 'design' : 'build', template: body.template || null, depth: body.depth === 'fast' ? 'fast' : 'deep', chatId: body.chatId || null, pages: await pagesFor(goal) });
    return json(res, 200, pub(mission));
  }

  // Take a delivery further: a new ticket at another desk with this
  // delivery already on its table, so the second piece of work argues from
  // the first rather than starting from the goal again.
  const NEXT_DESK = { brief: 'deck', analysis: 'brief', deck: 'site', site: 'mobile', mobile: 'site' };
  const nextMatch = p.match(/^\/api\/missions\/([\w]+)\/next$/);
  if (nextMatch && req.method === 'POST') {
    if (guestGate(req, res, 'write')) return;
    const from = store.mission(nextMatch[1]);
    if (!from) return json(res, 404, { error: 'Mission not found.' });
    if (from.status !== 'FILLED' || !from.artifactId) return json(res, 400, { error: 'Only a delivered mission can be taken further.' });
    const body = await readBody(req);
    const deskId = String(body.deskId || NEXT_DESK[from.desk] || 'brief');
    if (!DESKS.some((d) => d.id === deskId)) return json(res, 400, { error: `Unknown desk "${deskId.slice(0, 40)}".` });
    const art = store.artifact(from.artifactId);
    const html = store.artifactHtml(from.artifactId) || '';
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 20000);
    if (!text) return json(res, 400, { error: 'That delivery has no text to carry forward.' });
    const goal = String(body.goal || '').trim().slice(0, 400) || `${DESKS.find((d) => d.id === deskId).name.replace(' desk', '')} from ${from.serial}: ${from.subject || from.goal}`;
    const mission = writeContract({
      by: meOf(req)?.name || null, goal, deskId,
      lead: modelById(body.lead || ws().personalization.defaultModel).id,
      advisers: (ws().personalization.defaultAdvisers || []).map((a) => modelById(a).id).slice(0, 4),
      installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(),
      variant: 'build', template: null, depth: body.depth === 'fast' ? 'fast' : 'deep', chatId: from.chatId || null,
      attachments: [{ name: `${from.serial} · ${art?.title || 'the earlier delivery'}`, text }],
    });
    mission.from = { id: from.id, serial: from.serial, artifactId: from.artifactId, title: art?.title || null, desk: from.deskName };
    store.flushMissions();
    return json(res, 200, pub(mission));
  }

  const forkMatch = p.match(/^\/api\/missions\/([\w]+)\/fork$/);
  if (forkMatch && req.method === 'POST') {
    if (guestGate(req, res, 'write')) return;
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const goal = String(body.goal || '').trim().slice(0, 400) || undefined;
    const feedback = Array.isArray(body.feedback) ? body.feedback : [];
    // An amendment goes back to the apps the parent delivered to (those still
    // connected); a parent that delivered nowhere queues every connected app.
    const parent = store.mission(forkMatch[1]);
    const delivered = [...new Set((parent?.deliveries || []).filter((d) => d.ok).map((d) => d.connector))];
    const queued = delivered.length ? connectedConnectors().filter((c) => delivered.includes(c)) : connectedConnectors();
    const m = forkMission(forkMatch[1], { goal, feedback, installedSkills: skillsInstalled(), queuedConnectors: queued, redeliverTo: delivered.length ? queued : [] });
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    return json(res, 200, pub(m));
  }

  // ---- Standing orders: a delivered ticket that re-runs itself ----
  const standingDeps = () => ({ installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(), notify });
  if (p === '/api/standing' && req.method === 'GET') return json(res, 200, { orders: standingOrders().map((o) => ({ ...o, spentThisMonth: spentThisMonth(o) })), cadences: Object.keys(CADENCES) });
  const standingNew = p.match(/^\/api\/missions\/([\w]+)\/standing$/);
  if (standingNew && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
    const body = await readBody(req);
    const r = addStandingOrder(standingNew[1], String(body.cadence || 'weekly'), body.cap);
    if (r.error) return json(res, 400, { error: r.error });
    return json(res, 200, r.order);
  }
  const standingOne = p.match(/^\/api\/standing\/([\w]+)(?:\/(pause|run))?$/);
  if (standingOne && req.method === 'DELETE') return json(res, removeStandingOrder(standingOne[1]) ? 200 : 404, { ok: true });
  if (standingOne && req.method === 'POST' && standingOne[2] === 'pause') { if (guestGate(req, res, 'write')) return; const body = await readBody(req); const o = pauseStandingOrder(standingOne[1], !!body.paused); return o ? json(res, 200, o) : json(res, 404, { error: 'Standing order not found.' }); }
  if (standingOne && req.method === 'POST' && standingOne[2] === 'run') { if (guestGate(req, res, 'spend')) return; const o = standingOrders().find((x) => x.id === standingOne[1]); if (!o) return json(res, 404, { error: 'Standing order not found.' }); return json(res, 200, { order: o, run: runOrder(o, standingDeps()) }); }

  const deltaMatch = p.match(/^\/api\/missions\/([\w]+)\/delta$/);
  if (deltaMatch && req.method === 'GET') { const m = store.mission(deltaMatch[1]); if (!m) return json(res, 404, { error: 'Mission not found.' }); return json(res, 200, { delta: missionDelta(m) }); }

  const launchMatch = p.match(/^\/api\/missions\/([\w]+)\/launch$/);
  if (launchMatch && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
    const pending = store.mission(launchMatch[1]);
    if (!pending || pending.status !== 'OPEN') return json(res, 404, { error: 'Mission not found or not open.' });
    // The house never runs what it cannot fund: the ceiling must be covered.
    const credits = store.workspace().credits;
    if (credits < pending.contract.ceiling) {
      return json(res, 402, { error: `House credits (${credits.toFixed(0)}) are below this ticket's ceiling (${pending.contract.ceiling}). Top up or void the ticket, nothing was spent.` });
    }
    const refused = limitRefusal(pending);
    if (refused) {
      fireHook('limit.refused', { mission: { id: pending.id, serial: pending.serial, subject: pending.subject || pending.goal, ceiling: pending.contract?.ceiling }, reason: refused });
      return json(res, 403, { error: refused, limit: true });
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
    const result = await decideAttention(attnMatch[1], attnMatch[2], String(body.decision || ''), String(body.justification || ''), notify, meOf(req)?.name || null);
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
    return json(res, 200, { ...plan, dryRun: false, voided, stopped, note: `Housekeeping: ${voided} unstamped ticket(s) voided, ${stopped} paused run(s) stopped, reserves released, everything on the tape.` });
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
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    // What this kind of work has actually cost here, counted at read time so
    // it is never stale: most useful on a ticket nobody has stamped yet.
    const h = costHistory({ desk: m.desk, depth: m.depth, variant: m.variant, exclude: m.id });
    // And what it will ask of the owner's key, for a ticket not yet stamped.
    return json(res, 200, { ...pub(m), history: { ...h, line: historyLine(h, m.contract?.estimate) }, ...(m.status === 'OPEN' ? { keyPlan: keyPlanFor(m) } : {}) });
  }

  // ---- Community showcase: a delivered artifact, submitted with its provenance, becomes public ----
  if (p === '/api/showcase' && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
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
    ledger('grant', entry.grant, `Showcase submission ${a.serial}, ${entry.grant} cr house grant (demo)`, { artifactId: a.id });
    return json(res, 200, { ok: true, entry, path: `/s/${shareToken}`, granted: entry.grant });
  }
  const scDel = p.match(/^\/api\/showcase\/(sc_[a-f0-9]+)$/);
  if (scDel && req.method === 'DELETE') {
    const w = ws(); w.showcase = w.showcase.filter((x) => x.id !== scDel[1]); flushWs();
    return json(res, 200, { ok: true });
  }

  // ---- Media studio: hosted generation on the user's own key; bytes kept under the data dir ----
  if (p === '/api/media/generate' && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    const provider = String(body.provider || 'openai');
    if (!prompt) return json(res, 400, { error: 'Describe the image first.' });
    if (!ws().tools?.media) return json(res, 400, { error: 'Media Generation is switched off under Tools. Nothing was generated.' });
    const k = store.keyFor(provider);
    if (!k) return json(res, 400, { error: `No ${PROVIDERS[provider]?.label || provider} key in memory, load one under Your keys. Nothing was generated.` });
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
  // By id, with or without the file's extension: a page may name the file.
  const mediaGet = p.match(/^\/api\/media\/([a-f0-9]{16})(?:\.[a-z0-9]{2,5})?$/);
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
  // A self-contained copy of a delivery: every picture and clip the page
  // asks the house for is carried inside it, so the file still shows and
  // speaks on a machine that has never seen this house.
  const inlineMedia = (html) => String(html || '').replace(/(src|href)="\/api\/media\/([a-f0-9]{16})(?:\.[a-z0-9]{2,5})?"/g, (whole, attr, id) => {
    const rec = ws().media.find((x) => x.id === id);
    if (!rec) return whole;
    try { return `${attr}="data:${rec.mime};base64,${fs.readFileSync(path.join(MEDIA_DIR, `${rec.id}.${rec.ext}`)).toString('base64')}"`; } catch { return whole; }
  }).replace(/ data-narration="([a-f0-9]{16})"/g, (whole, id) => {
    const rec = ws().media.find((x) => x.id === id);
    if (!rec) return whole;
    try { return `${whole} data-narration-src="data:${rec.mime};base64,${fs.readFileSync(path.join(MEDIA_DIR, `${rec.id}.${rec.ext}`)).toString('base64')}"`; } catch { return whole; }
  });
  const bundleMatch = p.match(/^\/api\/missions\/([\w]+)\/bundle$/);
  if (bundleMatch) {
    const m = store.missionFull(bundleMatch[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    const a = m.artifactId ? store.artifact(m.artifactId) : null;
    const html = m.artifactId ? inlineMedia(store.artifactHtml(m.artifactId)) : null;
    if (url.searchParams.get('format') === 'json') return json(res, 200, { schema: 'prajna.bundle.v1', exportedAt: Date.now(), mission: pub(m), artifact: a || null, artifactHtml: html });
    const name = `${m.serial}-audit-bundle.html`;
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    if (url.searchParams.get('download') === '1') headers['content-disposition'] = `attachment; filename="${name}"`;
    return sendCompressed(req, res, 200, headers, auditBundle(pub(m), a, html));
  }

  const runShare = p.match(/^\/api\/missions\/([\w]+)\/share$/);
  if (runShare && (req.method === 'POST' || req.method === 'DELETE')) {
    if (guestGate(req, res, 'spend')) return;
    const m = store.mission(runShare[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    if (req.method === 'POST' && m.status === 'OPEN') return json(res, 400, { error: 'An unstamped ticket has no record to share yet.' });
    m.shareToken = req.method === 'POST' ? (m.shareToken || crypto.randomBytes(16).toString('hex')) : null;
    m.sharedAt = m.shareToken ? (m.sharedAt || Date.now()) : null;
    store.flushMissions();
    // A shared record opens its delivery with one click, so the delivery is
    // shared with it, and closed with it unless it was shared on its own.
    const a = m.artifactId ? store.artifact(m.artifactId) : null;
    if (a && req.method === 'POST' && !a.shareToken) store.refreshArtifact(a.id, { shareToken: crypto.randomBytes(16).toString('hex'), sharedAt: Date.now(), sharedVia: 'record' }, store.artifactHtml(a.id));
    if (a && req.method === 'DELETE' && a.shareToken && a.sharedVia === 'record') store.refreshArtifact(a.id, { shareToken: null, sharedAt: null, sharedVia: null }, store.artifactHtml(a.id));
    return json(res, 200, { ok: true, shareToken: m.shareToken, path: m.shareToken ? `/r/${m.shareToken}` : null });
  }

  // Deliver again: send a fresh public link to the connectors that delivered
  // before (or the ones named), recorded as re-deliveries on the mission.
  const redeliver = p.match(/^\/api\/missions\/([\w]+)\/redeliver$/);
  if (redeliver && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
    const m = store.mission(redeliver[1]);
    if (!m) return json(res, 404, { error: 'Mission not found.' });
    if (m.status !== 'FILLED' || !m.artifactId) return json(res, 400, { error: 'Only a delivered mission can be delivered again.' });
    const body = await readBody(req);
    const wanted = Array.isArray(body.connectors) && body.connectors.length ? body.connectors.map(String) : [...new Set((m.deliveries || []).map((d) => d.connector))];
    const targets = wanted.filter((c) => DELIVERABLE_CONNECTORS.includes(c) && connectedConnectors().includes(c));
    if (!targets.length) return json(res, 400, { error: 'No connected app to deliver to. Connect one under Connectors, or name one that is connected.' });
    const a = store.artifact(m.artifactId);
    if (!a.shareToken) store.refreshArtifact(a.id, { shareToken: crypto.randomBytes(16).toString('hex'), sharedAt: Date.now(), sharedBy: 'redelivery' }, store.artifactHtml(a.id));
    const origin = (process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '');
    const link = `${origin}/s/${store.artifact(m.artifactId).shareToken}`;
    let linkOk = null;
    if (origin) { try { linkOk = (await fetch(link)).ok; } catch { linkOk = false; } }
    const full = store.missionFull(m.id);
    const results = [];
    for (const cid of targets) {
      try { const r = await deliverTo(cid, full, link); results.push({ stepId: null, connector: cid, ok: true, id: r.id, url: r.url, where: r.where, link, linkOk, redelivery: true, at: Date.now() }); }
      catch (e) { results.push({ stepId: null, connector: cid, ok: false, error: String(e.message || e).slice(0, 200), link, redelivery: true, at: Date.now() }); }
    }
    m.deliveries = [...(m.deliveries || []), ...results];
    m.redeliveries = [...(m.redeliveries || []), { at: Date.now(), connectors: targets, ok: results.filter((r) => r.ok).length, by: ws().profile?.name || null }];
    store.flushMissions();
    try { store.refreshArtifact(a.id, {}, GENERATORS[m.desk](store.missionFull(m.id)).html); } catch { /* provenance refresh is best effort */ }
    return json(res, 200, { ok: true, link, linkOk, results });
  }

  const planMatch = p.match(/^\/api\/missions\/([\w]+)\/plan$/);
  if (planMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    try { return json(res, 200, pub(editPlan(planMatch[1], body.plan))); }
    catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }

  // Owner notes on a delivery: the raw material for the next version.
  // ---- The canvas: a page edited in place comes back as words, an order and a look; the house re-renders it as the next version ----
  const editsMatch = p.match(/^\/api\/artifacts\/([\w]+)\/edits$/);
  if (editsMatch && req.method === 'POST') {
    if (guestGate(req, res, 'write')) return;
    const a = store.artifact(editsMatch[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const html = store.artifactHtml(a.id);
    if (!html) return json(res, 404, { error: 'The page is not on file.' });
    const body = await readBody(req);
    let r;
    try { r = applyEdits(html, body); } catch (e) { return json(res, 400, { error: e.message }); }
    if (!r.count) return json(res, 400, { error: 'Nothing to save: change a text, the order or the look first.' });
    const version = (a.version || 1) + 1;
    const by = meOf(req)?.name || ws().profile.name || 'the owner';
    const at = Date.now();
    store.refreshArtifact(a.id, { version, editedAt: at, editedBy: by, edits: (a.edits || 0) + 1 }, stampEdit(r.html, { version, summary: r.summary, by, at }));
    const m = a.missionId ? store.mission(a.missionId) : null;
    if (m) { m.edits = [...(m.edits || []), { at, version, summary: r.summary, by }]; store.flushMissions(); }
    return json(res, 200, { ok: true, version, summary: r.summary });
  }

  const noteMatch = p.match(/^\/api\/artifacts\/([\w]+)\/notes(?:\/([\w]+))?$/);
  if (noteMatch && (req.method === 'POST' || req.method === 'DELETE')) {
    if (guestGate(req, res, 'write')) return;
    const a = store.artifact(noteMatch[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const notes = Array.isArray(a.notes) ? a.notes : [];
    if (req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.text || '').trim().slice(0, 500);
      if (!text) return json(res, 400, { error: 'Write the note first.' });
      if (notes.length >= 12) return json(res, 400, { error: 'Twelve notes at most, the next version should be able to address them all.' });
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
    if (guestGate(req, res, 'spend')) return;
    const a = store.artifact(shareMatch[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const token = req.method === 'POST' ? (a.shareToken || crypto.randomBytes(16).toString('hex')) : null;
    const old = a.shareToken;
    store.refreshArtifact(a.id, { shareToken: token, sharedAt: token ? (a.sharedAt || Date.now()) : null }, store.artifactHtml(a.id));
    // Revoking a link that a connector delivered leaves a trail: the mission
    // records which deliveries now point at a dead link, and when.
    let revoked = 0;
    if (req.method === 'DELETE' && old) {
      const m = store.mission(a.missionId);
      if (m && (m.deliveries || []).length) {
        for (const d of m.deliveries) if (d.link && d.link.includes(`/s/${old}`) && !d.linkRevokedAt) { d.linkRevokedAt = Date.now(); revoked++; }
        if (revoked) { m.revocations = [...(m.revocations || []), { at: Date.now(), token: old, deliveries: revoked }]; store.flushMissions(); }
        try { store.refreshArtifact(a.id, { shareToken: null }, GENERATORS[m.desk](store.missionFull(m.id)).html); } catch (e) { console.error('prajna: provenance refresh after revoke failed', e.message); }
      }
    }
    return json(res, 200, { ok: true, shareToken: token, path: token ? `/s/${token}` : null, revokedDeliveries: revoked });
  }

  const artifactXlsx = p.match(/^\/api\/artifacts\/([\w]+)\/xlsx$/);
  if (artifactXlsx && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const a = store.artifact(artifactXlsx[1]);
    if (!a) return json(res, 404, { error: 'Artifact not found.' });
    const m = a.missionId ? store.mission(a.missionId) : null;
    const buf = m && xlsxFromMission({ artifact: a, mission: m, publicUrl: m.shareToken ? `${(process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '')}/r/${m.shareToken}` : null });
    if (!buf) return json(res, 400, { error: 'This delivery has no data table: attach a file to an analysis mission and the workbook follows.' });
    const file = `${a.serial || 'prajna'}-${String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'analysis'}.xlsx`;
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-length': buf.length, 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' });
    return res.end(buf);
  }
  const artifactPptx = p.match(/^\/api\/artifacts\/([\w]+)\/pptx$/);
  if (artifactPptx && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const a = store.artifact(artifactPptx[1]);
    const html = a ? store.artifactHtml(a.id) : null;
    if (!a || !html) return json(res, 404, { error: 'Artifact not found.' });
    const m = a.missionId ? store.mission(a.missionId) : null;
    const buf = pptxFromArtifact({ artifact: a, mission: m, html, mediaBytes: (name) => { try { return fs.readFileSync(path.join(MEDIA_DIR, path.basename(name))); } catch { return null; } }, publicUrl: m?.shareToken ? `${(process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '')}/r/${m.shareToken}` : null });
    if (!buf) return json(res, 400, { error: 'This delivery has no slides, so there is nothing to put in a deck.' });
    const file = `${a.serial || 'prajna'}-${String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'deck'}.pptx`;
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-length': buf.length, 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' });
    return res.end(buf);
  }
  const artifactDocx = p.match(/^\/api\/artifacts\/([\w]+)\/docx$/);
  if (artifactDocx && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { locked: true });
    const a = store.artifact(artifactDocx[1]);
    const html = a ? store.artifactHtml(a.id) : null;
    if (!a || !html) return json(res, 404, { error: 'Artifact not found.' });
    const m = a.missionId ? store.mission(a.missionId) : null;
    const buf = docxFromArtifact({ artifact: a, mission: m, html, publicUrl: m?.shareToken ? `${(process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '')}/r/${m.shareToken}` : null });
    const file = `${a.serial || 'prajna'}-${String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artifact'}.docx`;
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-length': buf.length, 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' });
    return res.end(buf);
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
    if (guestGate(req, res, 'write')) return;
    const body = await readBody(req);
    return json(res, 200, createChat({ title: body.title, mode: body.mode, projectId: body.projectId, owner: whoId(req) }));
  }
  const chatMatch = p.match(/^\/api\/chats\/([\w]+)$/);
  if (chatMatch) {
    const c = chatFor(chatMatch[1], whoId(req));
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    if (req.method === 'DELETE') { deleteChat(c.id); return json(res, 200, { ok: true }); }
    if (req.method === 'PATCH') { const body = await readBody(req); return json(res, 200, renameChat(c.id, body.title || c.title)); }
    return json(res, 200, c);
  }
  // The companion can start a mission mid-conversation: a live model ends its
  // reply with `PRAJNA-MISSION: <mode> | <goal>` when the user clearly asks
  // for a deliverable; without a live model a plain-language request is read
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
  const startMissionFromChat = async (c, mode, goal, seatId) => {
    const lead = modelById(seatId || ws().personalization.defaultModel).id;
    const advisers = (ws().personalization.defaultAdvisers || []).map((a) => modelById(a).id).filter((a) => a !== lead).slice(0, 5);
    const mission = writeContract({ goal, deskId: MODE_DESK_ALL[mode], lead, advisers, installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(), variant: 'build', template: null, depth: 'deep', chatId: c.id , pages: await pagesFor(goal) });
    if (store.workspace().credits < mission.contract.ceiling) return { mission, text: `I wrote the ticket (${mission.serial}: ${mission.contract.plan.length} steps, ceiling ${mission.contract.ceiling}) but the house holds only ${store.workspace().credits.toFixed(0)} credits, top up before stamping.`, kind: 'ticket' };
    launchMission(mission.id, notify);
    return { mission, text: `Started ${mission.deskName.replace(' desk', '')} mission ${mission.serial} from this conversation: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits estimated (ceiling ${mission.contract.ceiling}).`, kind: 'run' };
  };

  // Streaming plain chat: SSE deltas as the live model speaks, then the saved
  // message. Without a live model the house answers honestly in one event.
  const chatStreamMatch = p.match(/^\/api\/chats\/([\w]+)\/stream$/);
  if (chatStreamMatch && req.method === 'POST') {
    if (guestGate(req, res, 'write')) return;
    const c = chatFor(chatStreamMatch[1], whoId(req));
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) return json(res, 400, { error: 'Say something first.' });
    // The Browser tool in conversation: addresses in the message are read first,
    // recorded on the message, and handed to the model as pages it may quote.
    const docs = docsFrom(body);
    let pages = [], unread = [];
    if (ws().tools?.browser && urlsIn(text).length) {
      const results = await readPages(urlsIn(text));
      pages = results.filter((r) => !r.error); unread = results.filter((r) => r.error);
    }
    const userMsg = addMessage(c.id, { role: 'user', text, mode: 'chat', attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).map((a) => (typeof a === 'string' ? a : String(a?.name || 'attachment').slice(0, 120))), ...(pages.length || unread.length ? { pages: [...pages.map((p) => ({ title: p.title, url: p.url, words: p.words })), ...unread.map((u) => ({ url: u.url, error: u.error }))] } : {}), ...(docs.length ? { read: docs.map((d) => ({ name: d.name, words: d.text.split(/\s+/).filter(Boolean).length })) } : {}) });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (pages.length || unread.length) emit('read', { pages: userMsg.pages });
    const docsPrompt = docs.length ? `\n\nAttachments the user supplied (quote from them and cite them by name; say plainly when they do not answer the question):\n${docs.map((d, i) => `[${String.fromCharCode(65 + i)}] ${d.name} (${d.text.split(/\s+/).filter(Boolean).length} words)\n${d.text.slice(0, 6000)}`).join('\n\n')}` : '';
    const pagesPrompt = pages.length ? `\n\nPages the user named, read by the house just now (quote from them and cite them by title; say plainly when they do not answer the question):\n${pages.map((p, i) => `[${i + 1}] ${p.title} (${p.url}, ${p.words} words)\n${p.text.slice(0, 6000)}`).join('\n\n')}${unread.length ? `\n\nNot read: ${unread.map((u) => `${u.url} (${u.error})`).join('; ')}` : ''}` : unread.length ? `\n\nThe user named pages the house could not read: ${unread.map((u) => `${u.url} (${u.error})`).join('; ')}. Say so.` : '';
    const seatId = body.lead || ws().personalization.defaultModel;
    const live = liveSeat(seatId);
    let reply, kind = 'text';
    if (live) {
      try {
        const history = c.messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        reply = await streamModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, maxTokens: 1200, prompt: `You are Prajñā, a calm, precise assistant inside an agent workspace that can run missions (website, mobile, deck, research, analysis) with a visible contract. Reply helpfully and concisely (markdown ok).${docsPrompt}${pagesPrompt}${houseAnswer(text) ? `\n\nThe house ledger says (use only these figures for money or schedule; never invent a number): ${houseAnswer(text)}` : ''}${recordContext(c, 7000, text) ? `\n\nRecord of missions the user may be asking about (this thread, any serial named, the latest deliveries), answer ONLY from this record and say plainly when it does not say:\n${recordContext(c, 7000, text)}` : ''} If: and only if, the user clearly asks you to produce one of those deliverables, end your reply with a final line exactly of the form: PRAJNA-MISSION: <website|mobile|deck|research|analysis> | <one-line goal>\n\n${history}\nAssistant:`, onDelta: (d) => emit('delta', { text: d }) });
        kind = 'live';
        const mm = reply.match(/PRAJNA-MISSION:\s*(website|mobile|deck|research|analysis)\s*\|\s*(.+)$/im);
        if (mm && !ws().tools?.['task-agent']) reply = reply.replace(mm[0], '').trim() + '\n\n(The Task Agent tool is switched off under Tools, so I did not start a mission for this. Switch it on, or pick a mode in the composer.)';
        if (mm && ws().tools?.['task-agent']) {
          reply = reply.replace(mm[0], '').trim();
          const started = await startMissionFromChat(c, mm[1].toLowerCase(), mm[2].trim().slice(0, 400), seatId);
          const m = addMessage(c.id, { role: 'assistant', text: reply, kind, model: modelById(seatId).name });
          const m2 = addMessage(c.id, { role: 'assistant', text: started.text, missionId: started.mission.id, kind: started.kind });
          emit('done', { message: m, mission: m2, chat: getChat(c.id) });
          return res.end();
        }
      } catch (e) { reply = `The live model (${live.model.name}) refused: ${String(e.message || e).slice(0, 160)}. Check the key under Your keys.`; }
    } else {
      const fromHouse = houseAnswer(text);
      if (fromHouse) {
        const m = addMessage(c.id, { role: 'assistant', text: fromHouse, kind: 'house', model: 'the house' });
        emit('done', { message: m, chat: getChat(c.id) });
        return res.end();
      }
      const fromRecord = answerFromRecord(text, missionsFor(c, text));
      if (fromRecord) {
        const m = addMessage(c.id, { role: 'assistant', text: fromRecord, kind: 'record', model: 'the house' });
        emit('done', { message: m, chat: getChat(c.id) });
        return res.end();
      }
      const mode = ws().tools?.['task-agent'] ? inferMode(text) : null;
      if (mode) {
        const started = await startMissionFromChat(c, mode, text.slice(0, 400), seatId);
        const m = addMessage(c.id, { role: 'assistant', text: started.text, missionId: started.mission.id, kind: started.kind });
        emit('done', { message: m, chat: getChat(c.id) });
        return res.end();
      }
      reply = docs.length
        ? `I read ${docs.map((d) => `${d.name} (${d.text.split(/\s+/).filter(Boolean).length} words)`).join(' and ')}${pages.length ? ` and ${pages.map((p) => `${p.title} (${p.words} words)`).join(' and ')}` : ''}. From ${docs[0].name}: "${docs[0].text.replace(/\s+/g, ' ').trim().slice(0, 280)}". Without a model key I can only quote, not discuss; load one under Your keys, or ask for a brief on it and the house will run a mission that cites it.`
        : pages.length
        ? `I read ${pages.map((p) => `${p.title} (${p.words} words)`).join(' and ')}. From the first: "${pages[0].extract.slice(0, 280)}". Without a model key I can only quote, not discuss; load one under Your keys, or ask for a brief on it and the house will run a mission that cites the page.`
        : unread.length
          ? `I could not read ${unread.map((u) => `${u.url} (${u.error})`).join('; ')}. ${modelById(seatId).name} is not live either; load a key under Your keys.`
          : `I can chat once a model key is loaded under Your keys (that makes ${modelById(seatId).name} live). Meanwhile, ask me to build a website, an app, a deck, a brief or an analysis and I will run it as a mission with a visible contract.`;
    }
    const m = addMessage(c.id, { role: 'assistant', text: reply, kind, model: modelById(seatId).name });
    emit('done', { message: m, chat: getChat(c.id) });
    return res.end();
  }
  const msgMatch = p.match(/^\/api\/chats\/([\w]+)\/messages$/);
  if (msgMatch && req.method === 'POST') {
    if (guestGate(req, res, 'spend')) return;
    const c = chatFor(msgMatch[1], whoId(req));
    if (!c) return json(res, 404, { error: 'Chat not found.' });
    const body = await readBody(req);
    if (body.__tooLarge) return json(res, 413, { error: 'Request body too large.' });
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) return json(res, 400, { error: 'Say something first.' });
    const mode = String(body.mode || c.mode || 'chat');
    const docs = docsFrom(body);
    addMessage(c.id, { role: 'user', text, mode, attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8).map((a) => (typeof a === 'string' ? a : String(a?.name || 'attachment').slice(0, 120))) });
    const MODE_DESK = { website: 'site', mobile: 'mobile', deck: 'deck', research: 'brief', analysis: 'analysis' };
    if (MODE_DESK[mode]) {
      const lead = modelById(body.lead || ws().personalization.defaultModel).id;
      const advisers = (Array.isArray(body.advisers) ? body.advisers : ws().personalization.defaultAdvisers).map((a) => modelById(a).id).filter((a) => a !== lead).slice(0, 5);
      const mission = writeContract({ by: meOf(req)?.name || null, goal: text, deskId: MODE_DESK[mode], lead, advisers, installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(), variant: body.variant === 'design' ? 'design' : 'build', template: body.template || null, depth: body.depth === 'fast' ? 'fast' : 'deep', chatId: c.id, attachments: docs , pages: await pagesFor(text) });
      const credits = store.workspace().credits;
      if (credits < mission.contract.ceiling) {
        const m = addMessage(c.id, { role: 'assistant', text: `I wrote the ticket (${mission.serial}: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits, ceiling ${mission.contract.ceiling}) but the house holds only ${credits.toFixed(0)} credits, top up or trim the plan before stamping.`, missionId: mission.id, kind: 'ticket' });
        return json(res, 200, { chat: getChat(c.id), mission: pub(mission), message: m });
      }
      const launched = launchMission(mission.id, notify);
      const m = addMessage(c.id, { role: 'assistant', text: `On it: ${mission.deskName.replace(' desk', '')} mission ${mission.serial} is running: ${mission.contract.plan.length} steps, ${mission.contract.estimate} credits estimated (ceiling ${mission.contract.ceiling}). Watch the tape or wait for the delivery here.`, missionId: mission.id, kind: 'run' });
      return json(res, 200, { chat: getChat(c.id), mission: pub(launched || mission), message: m });
    }
    // Plain chat: a live model answers if a key is loaded; otherwise the house replies honestly.
    const seatId = body.lead || ws().personalization.defaultModel;
    const live = liveSeat(seatId);
    let reply, kind = 'text';
    if (live) {
      try {
        const history = c.messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        reply = await callModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, prompt: `You are Prajñā, a calm, precise assistant inside an agent workspace. Reply helpfully and concisely (markdown ok).${recordContext(c, 7000, text) ? `\n\nRecord of missions the user may be asking about (this thread, any serial named, the latest deliveries), answer ONLY from this record and say plainly when it does not say:\n${recordContext(c, 7000, text)}` : ''}\n\n${history}\nAssistant:`, maxTokens: 900 });
        kind = 'live';
      } catch (e) { reply = `The live model (${live.model.name}) refused: ${String(e.message || e).slice(0, 160)}. Check the key under Your keys.`; }
    } else {
      reply = houseAnswer(text) || answerFromRecord(text, missionsFor(c, text)) || `I can chat once a model key is loaded under Your keys (that makes ${modelById(seatId).name} live). Meanwhile, pick a mode, Website, Mobile App, Slide Deck or Research: and I will run it as a mission with a visible contract.`;
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
  const targetMatch = p.match(/^\/api\/connectors\/([\w-]+)\/target$/);
  if (targetMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    const t = connectorTargets(); const v = String(body.target || '').trim().slice(0, 200);
    if (v) t[targetMatch[1]] = v; else delete t[targetMatch[1]];
    flushWs();
    return json(res, 200, { ok: true, targets: t });
  }
  const pluginMatch = p.match(/^\/api\/plugins\/([\w-]+)\/toggle$/);
  if (pluginMatch && req.method === 'POST') {
    if (!PLUGINS.some((x) => x.id === pluginMatch[1])) return json(res, 404, { error: 'Unknown plugin.' });
    const w = ws(); w.plugins = w.plugins.includes(pluginMatch[1]) ? w.plugins.filter((x) => x !== pluginMatch[1]) : [...w.plugins, pluginMatch[1]]; flushWs();
    return json(res, 200, { enabled: w.plugins.includes(pluginMatch[1]) });
  }
  const toolMatch = p.match(/^\/api\/tools\/([\w-]+)\/toggle$/);
  if (toolMatch && req.method === 'POST') {
    if (ownerGate(req, res)) return;
    if (!TOOLS.some((x) => x.id === toolMatch[1])) return json(res, 404, { error: 'Unknown tool.' });
    const w = ws(); w.tools[toolMatch[1]] = !w.tools[toolMatch[1]]; flushWs(); return json(res, 200, { enabled: w.tools[toolMatch[1]] });
  }
  if (p === '/api/mcp' && req.method === 'POST') {
    const body = await readBody(req); const w = ws();
    const name = String(body.name || '').trim().slice(0, 40); const url = String(body.url || '').trim().slice(0, 200);
    if (!name || !/^https?:\/\//.test(url)) return json(res, 400, { error: 'A name and an http(s) URL are required.' });
    const entry = { id: `mcp_${Math.random().toString(36).slice(2, 8)}`, name, url, addedAt: Date.now(), status: 'registered, not yet probed' };
    w.mcp.push(entry); flushWs(); return json(res, 200, entry);
  }
  const mcpDel = p.match(/^\/api\/mcp\/(mcp_[\w]+)$/);
  if (mcpDel && req.method === 'DELETE') { const w = ws(); w.mcp = w.mcp.filter((x) => x.id !== mcpDel[1]); flushWs(); return json(res, 200, { ok: true }); }
  // Sign in: a name against your own cookie, never against the house.
  if (p === '/api/me' && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return json(res, 400, { error: 'A name is needed to sign in. Nothing else is required.' });
    const email = String(body.email || '').trim().slice(0, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'That does not look like an email address.' });
    let id = whoId(req);
    if (!id) { id = crypto.randomBytes(12).toString('hex'); res.setHeader('set-cookie', whoCookie(req, encodeURIComponent(signWho(id)), 60 * 60 * 24 * 365)); }
    // First means the first to sign a name, not the first to be given a
    // cookie: accepting the house rules now leaves a record of its own, and
    // a record without a name is nobody.
    const first = !Object.values(visitors()).some((v) => v && v.name);
    if (first && !ws().ownerId) ws().ownerId = id;
    visitors()[id] = { ...(visitors()[id] || {}), name, email, handle: String(body.handle || '').trim().slice(0, 60), bio: String(body.bio || '').trim().slice(0, 300), at: visitors()[id]?.at || Date.now(), lastSeen: Date.now() };
    // The first person to sign in is the house's own: the digest and the
    // workspace name follow them, and nobody after that changes them.
    const w = ws();
    if (first) { w.profile = { ...w.profile, name, email, avatar: name[0].toUpperCase() }; store.workspace().name = name; store.flushWorkspace(); }
    flushWs();
    return json(res, 200, { me: meOf({ headers: { cookie: `prajna_who=${encodeURIComponent(signWho(id))}` } }), owner: first });
  }
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
    if (typeof body.digestEmail === 'boolean') w.personalization.digestEmail = body.digestEmail;
    flushWs(); return json(res, 200, w.personalization);
  }
  if (p === '/api/language' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    if (/^[a-z]{2}(-[A-Z]{2})?$/.test(String(body.language || ''))) w.language = body.language; flushWs(); return json(res, 200, { language: w.language });
  }
  // Top-up: demo billing, an honest ledger line, nothing charged.
  if (p === '/api/credits/topup' && req.method === 'POST') {
    if (ownerGate(req, res)) return;
    const body = await readBody(req);
    const amount = Math.round(Number(body.amount) || 0);
    if (![100, 250, 500, 1000, 2500, 5000].includes(amount)) return json(res, 400, { error: 'Top-ups come in 100, 250, 500, 1000, 2500 or 5000 credits.' });
    store.workspace().credits = Math.round((store.workspace().credits + amount) * 10) / 10; store.flushWorkspace();
    const w = ws();
    w.invoices.unshift({ id: `inv_${Date.now().toString(36)}`, at: Date.now(), amount: Math.round(amount / 100 * 2 * 100) / 100, currency: 'USD', plan: `Top-up ${amount} cr`, status: 'demo, no payment collected' }); flushWs();
    const line = ledger('topup', amount, `Top-up of ${amount} cr (demo billing, no payment collected)`);
    return json(res, 200, { ok: true, credits: store.workspace().credits, line });
  }

  // The daily digest: preview, or send through the owner's own Gmail.
  if (p === '/api/digest' && req.method === 'GET') {
    const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days')) || 1));
    return json(res, 200, { days, text: digestText({ days }), to: ws().profile.email || null, connected: !!store.token('google') });
  }
  if (p === '/api/digest/send' && req.method === 'POST') {
    if (ownerGate(req, res)) return;
    const body = await readBody(req);
    const to = String(body.to || ws().profile.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(res, 400, { error: 'No email to send to, add one under My Profile.' });
    const base = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(body.base || '')) ? body.base : undefined; // test hook, local only
    try {
      const r = await sendMail({ to, subject: `Prajñā digest: ${new Date().toISOString().slice(0, 10)}`, text: digestText({ days: 1 }), base });
      return json(res, 200, { ok: true, ...r });
    } catch (e) { return json(res, 400, { error: String(e.message || e).slice(0, 220) }); }
  }

  if (p === '/api/plan' && req.method === 'PATCH') {
    const body = await readBody(req); const w = ws();
    const tier = PLAN_TIERS.find((t) => t.id === body.plan);
    if (!tier) return json(res, 400, { error: 'Unknown plan.' });
    if (tier.id !== w.plan) {
      w.plan = tier.id;
      if (tier.price > 0) {
        w.invoices.unshift({ id: `inv_${Date.now().toString(36)}`, at: Date.now(), amount: tier.price, currency: 'USD', plan: tier.name, status: 'demo, no payment collected' });
        store.workspace().credits = Math.round((store.workspace().credits + tier.credits) * 10) / 10; store.flushWorkspace();
        ledger('grant', tier.credits, `${tier.name} plan, ${tier.credits} cr granted (demo billing, no payment collected)`);
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
  if (p === '/api/logout' && req.method === 'POST') { res.setHeader('set-cookie', [sessionCookie(req, '', 0), whoCookie(req, '', 0)]); return json(res, 200, { ok: true, note: ACCESS_CODE ? 'Session closed. The access code opens the house again.' : 'Open house (no access code set): local preferences cleared client-side.' }); }

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

  // ---- BYOK: keys + custom models (keys never leave the server) ----
  const keyMatch = p.match(/^\/api\/keys\/([\w-]+)$/);
  if (keyMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    if (ownerGate(req, res)) return;
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
    // Testing the saved key is a call made on the owner's account.
    if (ownerGate(req, res)) return;
    const prov = keyTest[1];
    if (!PROVIDERS[prov]) return json(res, 404, { error: 'Unknown provider.' });
    const body = await readBody(req);
    const saved = store.keyFor(prov);
    const key = String(body.key || saved?.key || '').trim();
    if (!key) return json(res, 400, { error: 'No key to test, save one or pass it in the request.' });
    const modelId = String(body.modelId || '').trim() || allModels().find((m) => m.provider === prov)?.modelId;
    try {
      const r = await testKey({ provider: prov, key, baseUrl: String(body.baseUrl || saved?.baseUrl || '').trim() || null, modelId });
      return json(res, 200, { ...r, modelId });
    } catch (e) {
      return json(res, 400, { error: `${PROVIDERS[prov].label} refused: ${String(e.message || e).slice(0, 200)}`, modelId });
    }
  }
  if (p === '/api/models' && req.method === 'POST') {
    if (houseGate(req, res)) return;
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
    if (allModels().length >= 24) return json(res, 400, { error: 'Model limit reached (24 models).' });
    const symbol = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
    const m = store.addCustomModel({ id: `c_${Math.random().toString(36).slice(2, 8)}`, symbol, name, house: PROVIDERS[provider].label, role: 'Your model · BYOK', tier: 'byok', color: '#E3A93C', provider, modelId, baseUrl });
    return json(res, 200, m);
  }
  const modelDel = p.match(/^\/api\/models\/(c_[\w]+)$/);
  if (modelDel && req.method === 'DELETE') {
    if (houseGate(req, res)) return;
    store.removeCustomModel(modelDel[1]);
    return json(res, 200, { ok: true });
  }

  const connectMatch = p.match(/^\/api\/connectors\/([\w-]+)\/toggle$/);
  if (connectMatch && req.method === 'POST') {
    const cid = connectMatch[1];
    const cdef = CONNECTORS.find((c) => c.id === cid);
    if (!cdef) return json(res, 404, { error: 'Unknown connector.' });
    if (cdef.provider) return json(res, 400, { error: `${cdef.name} connects with real sign-in, use Connect on the Connectors page.` });
    return json(res, 400, { error: `${cdef.name} is not wired yet, no OAuth provider for it in this build.` });
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
    // Every browser that opens the page gets an identity of its own, before
    // it asks for anything. Without one a second visitor would inherit the
    // first visitor's acceptance of the house rules, which is not consent.
    if (ext === '.html' && !whoId(req)) {
      const fresh = crypto.randomBytes(12).toString('hex');
      headers['set-cookie'] = whoCookie(req, encodeURIComponent(signWho(fresh)), 60 * 60 * 24 * 365);
    }
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
scheduleDigest();
scheduleHouseCheck();
scheduleBackups();
// The weekly review: Mondays at 08:00 UTC, to the webhook if one is set.
setInterval(() => {
  try {
    const now = new Date();
    if (now.getUTCDay() !== 1 || now.getUTCHours() !== 8) return;
    const day = now.toISOString().slice(0, 10);
    if (ws().lastReviewDay === day) return;
    ws().lastReviewDay = day; flushWs();
    const r = weeklyReview({ weeks: 1 });
    console.log(`prajna: weekly review, ${r.now.delivered} delivered, ${r.now.settled} cr settled`);
    fireHook('review.weekly', { review: r.now, before: r.before, text: r.text });
  } catch (e) { console.error('prajna: weekly review,', e.message); }
}, 10 * 60 * 1000).unref();
scheduleStandingOrders(() => ({ installedSkills: skillsInstalled(), queuedConnectors: connectedConnectors(), notify }));
seedTestTokens();
server.listen(PORT, () => console.log(`Prajñā listening on http://localhost:${PORT}`));
