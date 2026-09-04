#!/usr/bin/env node
// Prajñā CLI — the outcome exchange from a terminal. Zero dependencies.
//
//   prajna login <workspace-url> [--code <access-code>]
//   prajna run <website|mobile|deck|research|analysis> "<goal>" [--fast] [--design] [--auto] [--out dir]
//   prajna status                      missions on the board
//   prajna tape <mission-id>           the event ledger
//   prajna artifacts                   delivered artifacts
//   prajna get <artifact-id> [--out dir]
//   prajna bundle <mission-id> [--out dir]   the whole record in one HTML file
//   prajna watch                       ring when a run needs a decision
//
// The session file holds the workspace URL and the session cookie (an HMAC
// the server minted — never the access code, never a provider key).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const CFG_DIR = path.join(os.homedir(), '.config', 'prajna');
const CFG = path.join(CFG_DIR, 'session.json');
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(arr[i - 1] && arr[i - 1].startsWith('--') && !['fast', 'design', 'auto'].includes(arr[i - 1].slice(2))));

function loadCfg() { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return null; } }
function saveCfg(c) { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); }

async function api(cfg, p, opts = {}) {
  const r = await fetch(cfg.workspace + p, { ...opts, headers: { 'content-type': 'application/json', ...(cfg.cookie ? { cookie: cfg.cookie } : {}), ...(opts.headers || {}) } });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (r.status === 401) throw new Error(`The house is locked. Run: prajna login ${cfg.workspace} --code <access-code>`);
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const post = (cfg, p, body) => api(cfg, p, { method: 'POST', body: JSON.stringify(body || {}) });
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dim = (s) => `\x1b[2m${s}\x1b[0m`, bold = (s) => `\x1b[1m${s}\x1b[0m`, amber = (s) => `\x1b[33m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`;

function need() { const c = loadCfg(); if (!c) { console.error('Not logged in. Run: prajna login <workspace-url>'); process.exit(2); } return c; }

async function login() {
  const workspace = String(positional[0] || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(workspace)) { console.error('Usage: prajna login <workspace-url> [--code <access-code>]'); process.exit(2); }
  const code = flag('code');
  const cfg = { workspace, cookie: null, savedAt: Date.now() };
  const st = await api(cfg, '/api/session');
  if (st.open) { saveCfg(cfg); console.log(green('Open house.'), `Workspace ${workspace} saved to ${CFG}.`); return; }
  const c = code || await ask('Access code: ');
  const r = await fetch(`${workspace}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) });
  if (!r.ok) { console.error(red((await r.json().catch(() => ({}))).error || 'Refused.')); process.exit(1); }
  const setCookie = r.headers.get('set-cookie') || '';
  cfg.cookie = setCookie.split(';')[0];
  saveCfg(cfg);
  console.log(green('House opened.'), `Session saved to ${CFG} (mode 600). The code itself is not stored.`);
}

async function run() {
  const cfg = need();
  const mode = positional[0]; const goal = positional.slice(1).join(' ');
  if (!['website', 'mobile', 'deck', 'research', 'analysis'].includes(mode) || !goal) { console.error('Usage: prajna run <website|mobile|deck|research|analysis> "<goal>" [--fast] [--design] [--auto] [--out dir]'); process.exit(2); }
  const chat = await post(cfg, '/api/chats', { mode, title: goal.slice(0, 60) });
  const r = await post(cfg, `/api/chats/${chat.id}/messages`, { text: goal, mode, depth: flag('fast') ? 'fast' : 'deep', variant: flag('design') ? 'design' : 'build' });
  const msg = r.chat.messages.find((m) => m.kind === 'run' || m.kind === 'ticket');
  if (!msg?.missionId) { console.error(red('No mission was written.')); process.exit(1); }
  if (msg.kind === 'ticket') { console.log(amber(msg.text)); process.exit(1); }
  const mid = msg.missionId;
  const m0 = r.mission || await api(cfg, `/api/missions/${mid}`);
  console.log(bold(`${m0.serial}`), `${m0.deskName} · ${m0.contract.plan.length} steps · est ${m0.contract.estimate} cr · ceiling ${m0.contract.ceiling} cr`);
  let seen = 0; const shown = new Set();
  for (;;) {
    const m = await api(cfg, `/api/missions/${mid}`);
    for (const e of (m.events || []).slice(seen)) {
      if (e.type === 'step.status') console.log(`${e.status === 'LIVE' ? amber('▶') : e.status === 'FILLED' ? green('✔') : dim('·')} ${m.contract.plan.find((p) => p.id === e.stepId)?.title || e.stepId} ${dim(e.status)}`);
      else if (e.type === 'log') console.log(`   ${dim(e.label)} ${e.detail}`);
      else if (e.type === 'council.position') console.log(`   ${dim('panel')} ${e.model}${e.live ? green(' live') : ''}: ${e.text}`);
      else if (e.type === 'gate') console.log(`   ${e.cleared ? green('gate') : red('gate')} ${e.note}`);
      else if (e.type === 'cost') console.log(`   ${dim('cost')} +${e.delta} → ${e.total} cr`);
      else if (e.type === 'attention.raised') console.log(`   ${amber('attention')} ${e.prompt}`);
      else if (e.type === 'settlement') console.log(`   ${dim('settled')} ${e.settled} cr · ${e.released} cr released`);
    }
    seen = (m.events || []).length;
    const pending = (m.attention || []).find((a) => !a.decision && !shown.has(a.id));
    if (pending) {
      shown.add(pending.id);
      let decision = pending.options[0], why = 'CLI --auto: first option taken';
      if (!flag('auto')) {
        console.log(bold('\nDecision needed:'), pending.prompt);
        pending.options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
        const pick = Number(await ask('Choose: ')) - 1;
        decision = pending.options[pick] || pending.options[0];
        why = await ask('Justification (goes on the record): ');
        if (!why) why = 'no justification given at the CLI';
      }
      await post(cfg, `/api/missions/${mid}/attention/${pending.id}`, { decision, justification: why });
      console.log(`   ${amber('decided')} ${decision} — ${why}`);
    }
    if (m.status === 'FILLED' || m.status === 'KILLED') {
      console.log(bold(`\n${m.status}`), `· ${m.spent} cr spent`);
      if (m.artifactId) await save(cfg, m.artifactId);
      return;
    }
    await sleep(1500);
  }
}

async function save(cfg, id, outDir = flag('out') || '.') {
  const boot = await api(cfg, '/api/bootstrap');
  const a = (boot.artifacts || []).find((x) => x.id === id);
  const r = await fetch(`${cfg.workspace}/api/artifacts/${id}/html`, { headers: cfg.cookie ? { cookie: cfg.cookie } : {} });
  if (!r.ok) throw new Error(`Artifact ${id}: HTTP ${r.status}`);
  const name = `${a?.serial || 'PJ'}-${(a?.title || id).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80)}.html`;
  fs.mkdirSync(String(outDir), { recursive: true });
  const file = path.join(String(outDir), name);
  fs.writeFileSync(file, await r.text());
  console.log(green('Saved'), file, dim('(provenance block inside)'));
}

async function status() {
  const cfg = need(); const boot = await api(cfg, '/api/bootstrap');
  console.log(bold(`${boot.workspace.credits.toFixed(0)} cr`), dim(`· ${boot.workspace.reserved.toFixed(0)} reserved · ${boot.workspace.spent.toFixed(0)} spent`));
  for (const m of (boot.missions || []).slice(0, 20)) console.log(`${m.serial}  ${m.status.padEnd(16)} ${m.deskName.padEnd(14)} ${m.spent.toFixed(1).padStart(6)} cr  ${m.subject}`);
}
async function tape() {
  const cfg = need(); const m = await api(cfg, `/api/missions/${positional[0]}`);
  for (const e of m.events || []) console.log(`${String(e.seq).padStart(4)} ${dim(e.type.padEnd(18))} ${e.detail || e.text || e.note || e.prompt || e.status || ''}`);
}
async function artifacts() {
  const cfg = need(); const boot = await api(cfg, '/api/bootstrap');
  for (const a of boot.artifacts || []) console.log(`${a.id}  ${a.serial}  ${a.kind.padEnd(9)} v${a.version}  ${a.title}`);
}

async function bundle() {
  const cfg = need(); const id = positional[0];
  if (!id) { console.error('Usage: prajna bundle <mission-id> [--out dir]'); process.exit(2); }
  const r = await fetch(`${cfg.workspace}/api/missions/${id}/bundle`, { headers: cfg.cookie ? { cookie: cfg.cookie } : {} });
  if (!r.ok) throw new Error(`Bundle ${id}: HTTP ${r.status}`);
  const m = await api(cfg, `/api/missions/${id}`);
  const outDir = flag('out') || '.'; fs.mkdirSync(String(outDir), { recursive: true });
  const file = path.join(String(outDir), `${m.serial}-audit-bundle.html`);
  fs.writeFileSync(file, await r.text());
  console.log(green('Saved'), file, dim(`(${m.events?.length || 0} events, artifact ${m.artifactId ? 'embedded' : 'none'})`));
}
async function watch() {
  // Sit on the board and say when the house needs a decision. Ctrl-C to stop.
  const cfg = need(); const seen = new Set();
  console.log(dim('Watching for decisions… (Ctrl-C to stop)'));
  for (;;) {
    const boot = await api(cfg, '/api/bootstrap');
    const pending = (boot.missions || []).filter((m) => m.status.startsWith('PAUSED') && (m.attention || []).some((a) => !a.decision));
    for (const m of pending) {
      const a = m.attention.find((x) => !x.decision);
      if (seen.has(a.id)) continue; seen.add(a.id);
      process.stdout.write('\u0007');
      console.log(`${amber('DECISION NEEDED')} ${bold(m.serial)} ${dim(a.kind)}\n   ${a.prompt}\n   options: ${a.options.join(' / ')}  →  ${cfg.workspace}/run/${m.id}`);
    }
    await sleep(5000);
  }
}
const CMDS = { login, run, status, tape, artifacts, bundle, watch, get: async () => save(need(), positional[0]) };
if (!CMDS[cmd]) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 2 : 0); }
CMDS[cmd]().catch((e) => { console.error(red(e.message)); process.exit(1); });
