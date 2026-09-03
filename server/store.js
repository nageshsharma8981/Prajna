// JSON-file persistence for the Prajñā workspace. Single-process, write-through.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.PRAJNA_DATA_DIR || path.join(__dirname, '..', 'data');
const ARTIFACT_DIR = path.join(DATA_DIR, 'artifacts');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    // A corrupt ledger must never be silently reseeded over — keep the
    // evidence aside and start from the fallback.
    if (fs.existsSync(full)) {
      try { fs.copyFileSync(full, `${full}.corrupt-${Date.now()}`); } catch {}
      console.error(`prajna: ${file} unreadable (${e.message}); backed up and reset`);
    }
    return fallback;
  }
}
function writeJson(file, value) {
  // Atomic write: a crash mid-flush must not truncate the ledger.
  const full = path.join(DATA_DIR, file);
  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, full);
}

export const store = {
  state: {
    missions: readJson('missions.json', []),
    artifacts: readJson('artifacts.json', []),
    workspace: readJson('workspace.json', null),
    connectors: readJson('connectors.json', null),
  },

  flushMissions() { writeJson('missions.json', this.state.missions); },
  flushArtifacts() { writeJson('artifacts.json', this.state.artifacts); },
  flushWorkspace() { writeJson('workspace.json', this.state.workspace); },
  flushConnectors() { writeJson('connectors.json', this.state.connectors); },

  missions() { return this.state.missions; },
  mission(id) { return this.state.missions.find((m) => m.id === id); },
  addMission(m) { this.state.missions.unshift(m); this.flushMissions(); return m; },
  updateMission(id, patch) {
    const m = this.mission(id);
    if (!m) return null;
    Object.assign(m, patch);
    this.flushMissions();
    return m;
  },

  artifacts() { return this.state.artifacts; },
  artifact(id) { return this.state.artifacts.find((a) => a.id === id); },
  addArtifact(meta, html) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${meta.id}.html`), html);
    this.state.artifacts.unshift(meta);
    this.flushArtifacts();
    return meta;
  },
  refreshArtifact(id, meta, html) {
    const a = this.artifact(id);
    if (!a) return null;
    Object.assign(a, meta);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${id}.html`), html);
    this.flushArtifacts();
    return a;
  },
  artifactHtml(id) {
    try {
      return fs.readFileSync(path.join(ARTIFACT_DIR, `${id}.html`), 'utf8');
    } catch {
      return null;
    }
  },

  workspace() {
    if (!this.state.workspace) {
      this.state.workspace = { credits: 2400, reserved: 0, spent: 0, name: 'Nagesh Sharma', seat: 'SEAT 001' };
      this.flushWorkspace();
    }
    if (this.state.workspace.reserved === undefined) this.state.workspace.reserved = 0;
    return this.state.workspace;
  },
  // Real reservation accounting: credits + reserved + spent always reconciles
  // to the funded pool. A stamped ticket RESERVES its ceiling; each cost event
  // SETTLES from the reservation; closing the run RELEASES the remainder.
  reserveCredits(n) {
    const w = this.workspace();
    if (w.credits < n) return null;
    w.credits = Math.round((w.credits - n) * 10) / 10;
    w.reserved = Math.round((w.reserved + n) * 10) / 10;
    this.flushWorkspace();
    return w;
  },
  settleFromReserve(n) {
    const w = this.workspace();
    const take = Math.min(n, w.reserved);
    w.reserved = Math.round((w.reserved - take) * 10) / 10;
    w.spent = Math.round((w.spent + n) * 10) / 10;
    if (take < n) w.credits = Math.round((w.credits - (n - take)) * 10) / 10;
    this.flushWorkspace();
    return w;
  },
  releaseReserve(n) {
    const w = this.workspace();
    const give = Math.min(Math.max(0, n), w.reserved);
    w.reserved = Math.round((w.reserved - give) * 10) / 10;
    w.credits = Math.round((w.credits + give) * 10) / 10;
    this.flushWorkspace();
    return w;
  },
  // Direct debit (seed history only): spent that was never reserved.
  debitCredits(n) {
    const w = this.workspace();
    w.credits = Math.round((w.credits - n) * 10) / 10;
    w.spent = Math.round((w.spent + n) * 10) / 10;
    this.flushWorkspace();
    return w;
  },
};
