// Take your data: the whole workspace as one zip, written without any
// dependency (stored entries, CRC-32, central directory). Keys, OAuth apps
// and tokens never appear: they live only in memory and are not the
// workspace's data. The Privacy Policy promises this export; here it is.
import fs from 'node:fs';
import path from 'node:path';
import { store, DATA_DIR } from './store.js';
import { zipEntries, zipRead } from './docs.js';
import { ws } from './workspace.js';

const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosTime(d) { return { time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff }; }

export function zipStore(entries, when = new Date()) {
  const { time, date } = dosTime(when);
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, data); centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const strip = (m) => { const { runScript, deferredCost, ...rest } = m; return rest; };
const J = (x) => JSON.stringify(x, null, 2);

export function exportWorkspace({ version }) {
  const now = new Date();
  const missions = store.missions().map((m) => strip(store.missionFull(m.id)));
  const artifacts = store.artifacts();
  const w = ws();
  const entries = [];
  entries.push({ name: 'README.txt', data: [
    `Prajñā workspace export, ${now.toISOString()}, app version ${version}.`,
    '',
    'workspace.json      credits, reserve, spend',
    'workspace-ui.json   profile, chats, notes, boards, ledger, media index, standing orders, plugins, tools, consent record',
    'missions.json       every mission with its full event tape, contract, decisions, validation, settlement, sources, deliveries',
    'artifacts.json      the artifact index; artifacts/<id>.html are the delivered files, each with its provenance',
    'connectors.json     connector settings and delivery targets (no tokens: tokens and keys live only in memory and are never exported)',
    'models.json         models you added to the panel (base URLs only, never keys)',
    'media/              generated media files',
    '',
    'Everything is plain JSON and HTML; nothing here needs Prajñā to read.',
  ].join('\n') });
  entries.push({ name: 'workspace.json', data: J(store.workspace()) });
  // The signing secret stays in the house: an export is data, not a key.
  const { secret, ...uiWithoutSecret } = w;
  entries.push({ name: 'workspace-ui.json', data: J(uiWithoutSecret) });
  entries.push({ name: 'missions.json', data: J(missions) });
  entries.push({ name: 'artifacts.json', data: J(artifacts) });
  for (const a of artifacts) { const html = store.artifactHtml(a.id); if (html) entries.push({ name: `artifacts/${a.id}.html`, data: html }); }
  entries.push({ name: 'connectors.json', data: J(store.state.connectors || {}) });
  entries.push({ name: 'models.json', data: J(store.state.customModels || []) });
  const mediaDir = path.join(DATA_DIR, 'media');
  try { for (const f of fs.readdirSync(mediaDir)) { try { entries.push({ name: `media/${f}`, data: fs.readFileSync(path.join(mediaDir, f)) }); } catch { /* skip unreadable */ } } } catch { /* no media dir */ }
  return { zip: zipStore(entries, now), count: entries.length, missions: missions.length, artifacts: artifacts.length };
}

// Restore: a workspace export goes back in whole. Every file is rewritten
// from the zip, archived tapes are re-archived from the events the export
// carried, and runs that were live when the export was taken close as
// interrupted, since their run scripts do not travel. Returns the counts.
export function importWorkspace(buf) {
  let es;
  try { es = zipEntries(buf); } catch (e) { return { error: `Not a zip archive (${e.message}).` }; }
  const get = (n) => { const e = es.find((x) => x.name === n); return e ? zipRead(buf, e) : null; };
  const need = ['workspace.json', 'workspace-ui.json', 'missions.json', 'artifacts.json'];
  const missing = need.filter((n) => !get(n));
  if (missing.length) return { error: `Not a Prajñā export: missing ${missing.join(', ')}.` };
  let workspace, ui, missions, artifacts, connectors, models;
  try {
    workspace = JSON.parse(get('workspace.json')); ui = JSON.parse(get('workspace-ui.json')); missions = JSON.parse(get('missions.json')); artifacts = JSON.parse(get('artifacts.json'));
    connectors = get('connectors.json') ? JSON.parse(get('connectors.json')) : null; models = get('models.json') ? JSON.parse(get('models.json')) : [];
  } catch (e) { return { error: `The export's JSON is damaged (${e.message}).` }; }
  if (!Array.isArray(missions) || !Array.isArray(artifacts) || typeof workspace !== 'object' || typeof ui !== 'object') return { error: 'The export does not have the shape of a workspace.' };
  eraseFiles();
  const w = (f, v) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(v));
  let interrupted = 0, tapes = 0;
  for (const m of missions) {
    if (m.status === 'LIVE' || String(m.status || '').startsWith('PAUSED')) {
      m.status = 'KILLED'; m.partial = true; m.importNote = 'This run was live when the export was taken; it closes here as interrupted.'; interrupted++;
      // Its reserve comes home: settle what it spent, release the rest, on the ledger.
      const ceiling = m.contract?.ceiling || 0, spent = Math.round((m.spent || 0) * 10) / 10;
      const released = Math.round(Math.max(0, ceiling - spent) * 10) / 10;
      m.settlement = { reserved: ceiling, settled: spent, released };
      workspace.reserved = Math.round(Math.max(0, (workspace.reserved || 0) - released) * 10) / 10;
      workspace.credits = Math.round(((workspace.credits || 0) + released) * 10) / 10;
      if (!Array.isArray(ui.ledger)) ui.ledger = [];
      ui.ledger.unshift({ id: `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind: 'settle', delta: -spent, balanceAfter: workspace.credits, reservedAfter: workspace.reserved, note: `${m.serial} closed as interrupted on restore: ${spent} cr settled, ${released} cr released`, missionId: m.id, serial: m.serial, released });
    }
    if (m.eventsArchived && (m.events || []).length) {
      fs.writeFileSync(path.join(DATA_DIR, 'tape', `${m.id}.json`), JSON.stringify({ schema: 'prajna.tape.v1', missionId: m.id, serial: m.serial, archivedAt: Date.now(), events: m.events, runScript: null }));
      m.eventCount = m.events.length; m.events = []; tapes++;
    }
  }
  w('workspace.json', workspace); w('workspace-ui.json', ui); w('missions.json', missions); w('artifacts.json', artifacts);
  if (connectors) w('connectors.json', connectors); w('models.json', models);
  let files = 0;
  for (const e of es) {
    if (e.name.startsWith('artifacts/') && e.name.endsWith('.html')) { fs.writeFileSync(path.join(DATA_DIR, 'artifacts', path.basename(e.name)), zipRead(buf, e)); files++; }
    else if (e.name.startsWith('media/') && e.name.length > 6) { fs.writeFileSync(path.join(DATA_DIR, 'media', path.basename(e.name)), zipRead(buf, e)); files++; }
  }
  store.state.missions = missions; store.state.artifacts = artifacts; store.state.workspace = workspace; store.state.connectors = connectors; store.state.customModels = models;
  store.state.ws = null; // workspace-ui.json is re-read on the next touch
  return { missions: missions.length, artifacts: artifacts.length, files, tapes, interrupted, chats: (ui.chats || []).length };
}

// Backups: the house writes its own export to data/backups, keeps the last
// seven, and can tell whether the latest is fresh and readable.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR).filter((f) => /^prajna-backup-.*\.zip$/.test(f)).map((name) => { const st = fs.statSync(path.join(BACKUP_DIR, name)); return { name, bytes: st.size, at: st.mtimeMs }; }).sort((a, b) => b.at - a.at);
  } catch { return []; }
}
export function writeBackup({ version, keep = 7 }) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const { zip, count } = exportWorkspace({ version });
  const name = `prajna-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const file = path.join(BACKUP_DIR, name);
  fs.writeFileSync(file + '.tmp', zip); fs.renameSync(file + '.tmp', file);
  const all = listBackups();
  for (const old of all.slice(keep)) { try { fs.unlinkSync(path.join(BACKUP_DIR, old.name)); } catch { /* gone */ } }
  return { name, bytes: zip.length, entries: count, kept: Math.min(all.length, keep) };
}
export function readBackup(name) {
  if (!/^prajna-backup-[\w-]+\.zip$/.test(name)) return null;
  try { return fs.readFileSync(path.join(BACKUP_DIR, name)); } catch { return null; }
}
export function backupHealth(now = Date.now()) {
  const latest = listBackups()[0];
  if (!latest) return { ok: false, detail: 'no backup yet' };
  const age = now - latest.at;
  let readable = false; try { readable = zipEntries(fs.readFileSync(path.join(BACKUP_DIR, latest.name))).some((e) => e.name === 'missions.json'); } catch { readable = false; }
  const hours = Math.round(age / 3600000);
  return { ok: readable && age < 36 * 3600000, detail: `${listBackups().length} kept, latest ${hours < 1 ? 'under an hour' : `${hours}h`} old, ${(latest.bytes / 1024).toFixed(0)} KB, ${readable ? 'readable' : 'NOT readable'}` };
}

// Erase: every file the workspace wrote, gone; the house re-seeds itself.
// The consent record keeps only its version and time (proof of acceptance,
// no personal data). Returns what was removed.
export function eraseFiles() {
  const removed = { files: 0 };
  const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); removed.files++; } catch { /* already gone */ } };
  for (const f of ['missions.json', 'artifacts.json', 'workspace.json', 'connectors.json', 'models.json', 'workspace-ui.json']) rm(path.join(DATA_DIR, f));
  for (const d of ['artifacts', 'tape', 'media']) { rm(path.join(DATA_DIR, d)); try { fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true }); } catch { /* fine */ } }
  // Backups are deliberately kept: they are the way back from a mistaken erase.
  return removed;
}
