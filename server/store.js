// JSON-file persistence for the Praxis workspace. Single-process, write-through.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.PRAXIS_DATA_DIR || path.join(__dirname, '..', 'data');
const ARTIFACT_DIR = path.join(DATA_DIR, 'artifacts');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, value) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(value, null, 2));
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
  artifactHtml(id) {
    try {
      return fs.readFileSync(path.join(ARTIFACT_DIR, `${id}.html`), 'utf8');
    } catch {
      return null;
    }
  },

  workspace() {
    if (!this.state.workspace) {
      this.state.workspace = { credits: 2400, spent: 0, name: 'Nagesh Sharma', seat: 'SEAT 001' };
      this.flushWorkspace();
    }
    return this.state.workspace;
  },
  spendCredits(n) {
    const w = this.workspace();
    w.credits = Math.max(0, Math.round((w.credits - n) * 10) / 10);
    w.spent = Math.round((w.spent + n) * 10) / 10;
    this.flushWorkspace();
    return w;
  },
};
