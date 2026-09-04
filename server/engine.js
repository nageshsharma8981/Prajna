// The mission engine. Writes the contract (plan + estimate + acceptance
// dimensions) before anything runs, then executes the run as a cursor-driven
// event script streamed over SSE. Every event gets a monotonic seq — the
// ledger is the single source of truth for live view, replay, and provenance.
//
// Runs can pause (attention items, ceiling) and terminate early (kill) — and
// every terminal or paused state still produces an artifact. Demo mode: the
// script is authored, the artifacts are real. A provider layer can swap in
// live model calls when ANTHROPIC_API_KEY is present (future).

import crypto from 'node:crypto';
import { store } from './store.js';
import { deskById, modelById, SKILLS } from './catalog.js';
import { GENERATORS, subjectOf } from './artifacts.js';
import { callModel } from './providers.js';
import { authorContent } from './author.js';
import { evidenceFor } from './oauth.js';
import { ASSERTIONS, validateArtifact, evaluateGate } from './validators.js';

// BYOK: a seat is LIVE when the workspace holds a key for its provider.
export function liveSeat(modelIdOrRef) {
  const model = modelById(modelIdOrRef);
  const k = model && model.provider ? store.keyFor(model.provider) : null;
  return k ? { model, key: k.key, baseUrl: model.baseUrl || k.baseUrl || null } : null; // a seat's own host wins over the provider default
}

function positionPrompt(mission, model) {
  return `You are ${model.name}, one seat on a review panel for a ${mission.deskName.toLowerCase()} mission.\nGoal: "${mission.goal}"\nDeliverable: ${mission.deliverable}.\nIn 2-3 sentences state your position: the single strongest claim the deliverable should lead with, the biggest risk, and what you would refuse to assert without evidence. Be specific. No preamble.`;
}

// Serial counter continues from the persisted ledger so restarts never mint
// duplicate PX serials.
let counter = Math.max(
  4100 + Math.floor(Math.random() * 400),
  ...store.missions().map((m) => Number((m.serial || '').replace('PJ-', '')) + 1 || 0)
);
const nextSerial = () => `PJ-${counter++}`;
const id = () => Math.random().toString(36).slice(2, 10);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* ------------------------------- CONTRACTS -------------------------------- */

// Plans are milestone graphs (ii-agent's PlanSchema idea, independently
// implemented): each step names what it depends on, and its access class —
// read (observes), write (produces local artifacts), external (acts on the
// world; always an approval checkpoint). Steps with no dependency between
// them run in parallel on the tape.
const PLANS = {
  brief: (s) => [
    { id: 's1', title: `Frame the decision behind “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Sweep sources — filings, sector analyses, press', tool: 'search', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Grade every claim A–D by source strength', tool: 'cite-guard', cost: 10, access: 'read', dependsOn: ['s2'] },
    { id: 's4', title: 'Panel deliberation — positions, challenges, verdict', tool: 'council', cost: 18, access: 'read', dependsOn: ['s2'] },
    { id: 's5', title: 'Steelman the opposite conclusion', tool: 'steelman', cost: 8, access: 'read', dependsOn: ['s4'] },
    { id: 's6', title: 'Compose the decision brief', tool: 'compose', cost: 12, access: 'write', dependsOn: ['s3', 's5'] },
  ],
  deck: (s) => [
    { id: 's1', title: `Extract the argument in “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Storyboard the narrative arc — nine beats', tool: 'storyboard', cost: 10, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Panel deliberation on the through-line', tool: 'council', cost: 16, access: 'read', dependsOn: ['s1'] },
    { id: 's4', title: 'Draft slides — one idea per slide', tool: 'compose', cost: 14, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Deck Doctor pass — kill bullet sprawl', tool: 'deck-doctor', cost: 8, access: 'write', dependsOn: ['s4'] },
  ],
  site: (s) => [
    { id: 's1', title: `Position the offer — “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Panel deliberation on promise & proof', tool: 'council', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Cut copy to promise → proof → action', tool: 'copy-cutter', cost: 8, access: 'write', dependsOn: ['s1'] },
    { id: 's4', title: 'Build the page — semantic, responsive', tool: 'build', cost: 16, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Access audit — contrast, focus order', tool: 'a11y-audit', cost: 6, access: 'read', dependsOn: ['s4'] },
  ],
  mobile: (s) => [
    { id: 's1', title: `Map the app — “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Panel deliberation on the core flow', tool: 'council', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Screen inventory & navigation', tool: 'storyboard', cost: 8, access: 'read', dependsOn: ['s1'] },
    { id: 's4', title: 'Build the tappable prototype — 4 screens, tab bar', tool: 'build', cost: 16, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Access audit — touch targets, contrast', tool: 'a11y-audit', cost: 6, access: 'read', dependsOn: ['s4'] },
  ],
  analysis: (s) => [
    { id: 's1', title: `Define the question — “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Load & profile the series (sample data)', tool: 'ingest', cost: 8, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Interrogate — segments, mix shift, outliers', tool: 'analyze', cost: 14, access: 'read', dependsOn: ['s2'] },
    { id: 's4', title: 'Panel deliberation on the read', tool: 'council', cost: 14, access: 'read', dependsOn: ['s2'] },
    { id: 's5', title: 'Chart Smith — honest forms only', tool: 'chart-smith', cost: 8, access: 'write', dependsOn: ['s3'] },
    { id: 's6', title: 'Compose dashboard with caveats attached', tool: 'compose', cost: 10, access: 'write', dependsOn: ['s4', 's5'] },
  ],
};

// Queued connectors add an EXTERNAL delivery step — the only step class that
// always holds for approval before it runs.
const CONNECTOR_STEPS = {
  slack: { title: 'Post the delivery to Slack (queued connector)', tool: 'connector-post', cost: 2 },
  notion: { title: 'Publish the artifact to Notion (queued connector)', tool: 'connector-post', cost: 2 },
  gmail: { title: 'Draft a delivery email in Gmail (queued connector)', tool: 'connector-post', cost: 2 },
};

// Acceptance dimensions per desk — the panel gate votes on these.
export const DIMENSIONS = {
  mobile: ['Core flow works', 'Touch targets', 'Consistent navigation'],
  brief: ['Attribution', 'Completeness', 'Freshness'],
  deck: ['One idea per slide', 'Evidence under assertion', 'Narrative arc'],
  site: ['Promise → proof → action', 'Accessibility AA', 'Responsive'],
  analysis: ['Honest chart forms', 'Caveats attached', 'Segment coverage'],
};

// Plan steps that are skills (cite-guard, steelman, deck-doctor, copy-cutter,
// a11y-audit, chart-smith …) only appear when that skill is on the desk — so
// installing a skill genuinely changes every future ticket.
const SKILL_TOOLS = new Set(SKILLS.map((s) => s.id));

export function writeContract({ goal, deskId, lead, advisers, installedSkills, queuedConnectors, lineage, variant, template, depth, chatId }) {
  const desk = deskById(deskId);
  const subject = subjectOf(goal);
  const installed = installedSkills ? new Set(installedSkills) : null;
  const seatsAll = [lead, ...advisers.filter((a) => a !== lead)];

  let raw = PLANS[desk.id](subject.length > 52 ? subject.slice(0, 49) + '…' : subject);
  // Fast research keeps only scope → sweep → compose; deep keeps the full plan.
  if (desk.id === 'brief' && depth === 'fast') raw = raw.filter((p) => ['scope', 'search', 'compose'].includes(p.tool)).map((p) => (p.tool === 'compose' ? { ...p, dependsOn: ['s2'], title: 'Compose the fast brief' } : p));
  // Design mode produces a design draft instead of a build.
  if (variant === 'design' && ['site', 'mobile'].includes(desk.id)) raw = raw.map((p) => (p.tool === 'build' ? { ...p, title: p.title.replace(/^Build the page.*$|^Build the tappable prototype.*$/, 'Draft the design — layout, hierarchy, states'), tool: 'design' } : p)).filter((p) => p.tool !== 'a11y-audit');
  // Skill steps only exist when the skill is on the desk; dependents re-point
  // to the removed step's own dependencies so the graph stays connected.
  const removed = new Set(raw.filter((p) => installed && SKILL_TOOLS.has(p.tool) && !installed.has(p.tool)).map((p) => p.id));
  const byId = Object.fromEntries(raw.map((p) => [p.id, p]));
  const resolveDeps = (ids) => ids.flatMap((d) => (removed.has(d) ? resolveDeps(byId[d].dependsOn) : [d]));
  raw = raw.filter((p) => !removed.has(p.id)).map((p) => ({ ...p, dependsOn: [...new Set(resolveDeps(p.dependsOn))] }));

  // Per-seat pricing on the panel step: house seats share the cost; a BYOK
  // seat bills your own key, so it costs the house nothing.
  raw = raw.map((p) => {
    if (p.tool !== 'council') return p;
    const per = Math.round((p.cost / seatsAll.length) * 10) / 10;
    const seats = seatsAll.map((id) => ({ id, name: modelById(id).name, live: !!liveSeat(id), cost: liveSeat(id) ? 0 : per }));
    return { ...p, seats, cost: Math.round(seats.reduce((a, x) => a + x.cost, 0) * 10) / 10 };
  });

  // Queued connectors append an external delivery step after the last step.
  const last = raw[raw.length - 1];
  for (const cid of queuedConnectors || []) {
    const spec = CONNECTOR_STEPS[cid];
    if (!spec) continue;
    raw.push({ id: `s${raw.length + 1}`, ...spec, access: 'external', requiresConfirmation: true, connector: cid, dependsOn: [last.id] });
  }

  // Definition of done: atomic, testable assertions about the deliverable.
  // Each is owned by exactly one plan step (the step whose tool produces it);
  // if that step's skill is off the desk, ownership falls to the compose/build step.
  const catalog = ASSERTIONS[variant === 'design' ? 'design' : desk.id] || [];
  const fallbackOwner = raw.find((p) => ['compose', 'build'].includes(p.tool)) || raw[raw.length - 1];
  const assertions = catalog.map((a) => {
    const owner = raw.find((p) => p.tool === a.owner) || fallbackOwner;
    return { id: a.id, title: a.title, owner: owner.id, status: 'PENDING' };
  });
  raw = raw.map((p) => ({ ...p, targets: assertions.filter((a) => a.owner === p.id).map((a) => a.id) }));

  const plan = raw.map((p, i) => ({ status: 'QUEUED', contextHash: hash(`${desk.id}:${i}:${p.tool}:${goal}`), ...p }));
  const estimate = Math.round(plan.reduce((a, p) => a + p.cost, 0) * 10) / 10;
  const mission = {
    id: id(),
    serial: nextSerial(),
    goal,
    subject,
    desk: desk.id,
    deskName: desk.name,
    deskCode: desk.code,
    tint: desk.tint,
    deliverable: desk.deliverable,
    lead,
    advisers: advisers.filter((a) => a !== lead),
    councilNames: seatsAll.map((m) => modelById(m).name),
    status: 'OPEN', // OPEN → LIVE → FILLED | KILLED | PAUSED_ATTENTION | PAUSED_CEILING
    contract: {
      plan, estimate, ceiling: Math.ceil(estimate * 1.25), dimensions: DIMENSIONS[desk.id], assertions,
      access: { read: plan.filter((p) => p.access === 'read').length, write: plan.filter((p) => p.access === 'write').length, external: plan.filter((p) => p.access === 'external').length },
    },
    lineage: lineage || null, // { parentId, parentSerial, version }
    variant: variant || 'build',
    template: template || null,
    depth: depth || 'deep',
    chatId: chatId || null,
    connected: [...(queuedConnectors || [])],
    patches: [],
    acceptedRisks: [],
    validations: [],
    spent: 0,
    eventSeq: 0,
    events: [],
    attention: [],
    gate: null,
    review: null,
    settlement: null,
    partial: false,
    createdAt: Date.now(),
    launchedAt: null,
    filledAt: null,
    artifactId: null,
  };
  return store.addMission(mission);
}

/* ------------------------------ COUNCIL SCRIPT ---------------------------- */

const VOICES = {
  opus: (s) => `Lead the ${s} with the strongest single claim and let everything else defend it. The risk isn't being wrong — it's being vague enough that nobody can tell.`,
  sonnet: (s) => `Keep the scope honest: answer exactly what was asked about ${s}, flag what we couldn't verify, ship on time. Completeness is a trap here.`,
  gpt: (s) => `Comparable cases suggest a standard structure works for ${s} — but two of the usual assumptions don't transfer. I'd break convention on those and follow it elsewhere.`,
  gemini: (s) => `The retrieval set on ${s} skews recent. I weighted older primary sources back in; the picture changes at the margin, not the core.`,
  deepseek: (s) => `Disagree with the emerging consensus on ${s}. The majority read leans on an analogy that hasn't been tested. I want the counter-case in the final artifact, not a footnote.`,
  llama: (s) => `Baseline check on ${s}: a straightforward reading gets 80% of the way. Whatever we add beyond that must earn its place or it's decoration.`,
};

const CHALLENGES = [
  { from: 'deepseek', text: 'Your strongest claim rests on the weakest source class. Either upgrade the evidence or downgrade the claim.' },
  { from: 'gpt', text: 'Accepting the dissent on timing — tightening the recommendation from “when ready” to a dated window.' },
];

// Gate: every member votes pass/fail/unverifiable on every dimension.
// Scripted teeth: one member returns "unverifiable" (counts as a fail), the
// lead patches, the member re-votes. Dissent has consequences you can watch.
function gateScript(mission, stepId, baseT) {
  const members = [mission.lead, ...mission.advisers];
  const dims = mission.contract.dimensions || DIMENSIONS[mission.desk] || DIMENSIONS.brief;
  const skeptic = members.includes('deepseek') && mission.lead !== 'deepseek' ? 'deepseek' : members[members.length - 1];
  const failDim = dims[dims.length - 1];
  const rows = [];
  for (const m of members) {
    for (const d of dims) {
      const isFail = m === skeptic && d === failDim;
      rows.push({
        member: modelById(m).name,
        symbol: modelById(m).symbol,
        dimension: d,
        verdict: isFail ? 'unverifiable' : 'pass',
        rationale: isFail
          ? `Cannot verify ${d.toLowerCase()} from the material examined — counts as a fail, never a benefit-of-the-doubt pass.`
          : 'Checked against the draft; holds.',
      });
    }
  }
  const lead = modelById(mission.lead);
  const skepticName = modelById(skeptic).name;
  let t = baseT;
  const ev = [];
  ev.push({ t: (t += 1600), type: 'council.gate', stepId, rows, cleared: false, note: `${skepticName} returns UNVERIFIABLE on ${failDim} — the gate does not clear.` });
  ev.push({ t: (t += 1900), type: 'council.patch', stepId, model: lead.name, symbol: lead.symbol, text: `Patch: an explicit ${failDim.toLowerCase()} caveat is written into the artifact itself, with the unverified span marked. Re-vote requested.` });
  ev.push({ t: (t += 1500), type: 'council.revote', stepId, member: skepticName, dimension: failDim, verdict: 'pass', rationale: 'Caveat makes the limit visible in the deliverable; passes with the mark carried.' });
  ev.push({ t: (t += 700), type: 'council.gate', stepId, rows: rows.map((r) => (r.verdict === 'unverifiable' ? { ...r, verdict: 'pass', rationale: 'Passes after patch — caveat carried into the artifact.' } : r)), cleared: true, note: 'All seats pass all dimensions. Gate cleared with the patch on the record.' });
  return { events: ev, end: t };
}

function councilScript(mission, stepId, baseT) {
  const s = mission.subject.length > 40 ? 'this' : `“${mission.subject}”`;
  const members = [mission.lead, ...mission.advisers];
  const ev = [];
  let t = baseT;
  for (const m of members) {
    const model = modelById(m);
    ev.push({ t: (t += 1400 + Math.random() * 900), type: 'council.position', stepId, seat: m, model: model.name, symbol: model.symbol, color: model.color, text: (VOICES[m] || VOICES.sonnet)(s) });
  }
  const challengers = CHALLENGES.filter((c) => members.includes(c.from) && c.from !== mission.lead).slice(0, 2);
  for (const c of challengers) {
    const model = modelById(c.from);
    ev.push({ t: (t += 1800), type: 'council.challenge', stepId, model: model.name, symbol: model.symbol, color: model.color, text: c.text });
  }
  const lead = modelById(mission.lead);
  const hasDissent = members.includes('deepseek') && mission.lead !== 'deepseek';
  ev.push({
    t: (t += 2200), type: 'council.verdict', stepId,
    model: lead.name, symbol: lead.symbol, color: lead.color,
    text: 'Synthesis: adopt the strong-claim structure, date the window, carry the graded caveats into the artifact itself.',
    dissent: hasDissent ? { model: 'DeepSeek R2', text: 'Holds that the window estimate is optimistic. Recorded in the artifact, not erased.' } : null,
  });
  const gate = gateScript(mission, stepId, t);
  ev.push(...gate.events);
  return { events: ev, end: gate.end };
}

/* -------------------------------- RUN SCRIPT ------------------------------ */

const TOOL_LINES = {
  scope: [['parse-goal', 'decomposed into decision, audience, constraints'], ['frame', 'success criteria drafted · 3 explicit, 1 implicit']],
  search: [['web.search', '34 candidates → 19 kept after dedupe'], ['fetch', '11 primary documents retrieved'], ['extract', '61 claims extracted with source spans']],
  'cite-guard': [['grade', '61 claims graded · 9×A · 21×B · 31×C'], ['refuse', '4 ungraded assertions refused from draft'], ['registry', 'source registry sealed · references render from citations only']],
  steelman: [['invert', 'strongest counter-case constructed'], ['stress', 'recommendation survives 2 of 3 attacks · 1 absorbed as tripwire']],
  storyboard: [['beats', 'nine-beat arc drafted · problem → shift → mechanism → ask'], ['order', 'two beats swapped after tension check']],
  compose: [['draft', 'long-form draft assembled from graded material'], ['tighten', 'cut 28% · every claim keeps its grade mark']],
  'deck-doctor': [['scan', '3 slides over one-idea budget → split or cut'], ['verify', 'evidence sits beneath every assertion']],
  'copy-cutter': [['cut', 'copy reduced to promise → proof → action'], ['headline', '7 candidates → 1 survivor']],
  build: [['scaffold', 'semantic structure · nav, hero, proof, close'], ['style', 'committed palette + type system applied'], ['responsive', 'breaks at 800px verified']],
  'a11y-audit': [['contrast', 'AA pass · lowest pair 5.1:1'], ['keyboard', 'focus order verified end to end']],
  ingest: [['load', '12 periods × 8 segments loaded (sample set)'], ['profile', 'no gaps · 2 outliers flagged for inspection']],
  analyze: [['decompose', 'topline split by segment and cohort'], ['test', 'mix-shift hypothesis vs performance: mix shift wins'], ['residual', 'one segment moves opposite — isolated']],
  'chart-smith': [['form', 'line + segment bars chosen · dual axis refused'], ['annotate', 'the finding is drawn on the chart, not beside it']],
  'connector-post': [['compose', 'delivery summary drafted with artifact link'], ['post', 'simulated post — connector is queued intent, live OAuth wiring pending']],
  design: [['layout', 'grid, hierarchy and spacing decided before any pixel'], ['states', 'empty, loading, error and success states drawn'], ['annotate', 'every region labeled with its intent']],
};

// The amnesiac terminal review: by construction sees only (goal, artifact).
// Scripted: the site desk surfaces a real GAP and raises an attention item.
// The amnesiac terminal review: by construction sees only the goal and the
// artifact itself — never mission state. It judges what shipped.
function reviewFor({ desk, goal, html }) {
  const h = html || '';
  if (desk === 'site' && (/awaits your real case study/.test(h) || /replace with real capture/i.test(h))) {
    return {
      verdict: 'gaps',
      gaps: [{
        id: 'GAP-001', severity: 'minor',
        description: 'The page promises a proof section, but the case-study slot ships as a labeled placeholder. Either the label must be louder or the section cut until real proof exists.',
      }],
    };
  }
  if (desk === 'brief' && !/Recorded dissent/.test(h)) {
    return { verdict: 'gaps', gaps: [{ id: 'GAP-002', severity: 'major', description: 'The brief carries no recorded dissent — the panel disagreement was erased from the deliverable.' }] };
  }
  return { verdict: 'pass', gaps: [] };
}

function buildScript(mission) {
  const script = [];
  script.push({ t: 400, type: 'run.launched', serial: mission.serial });

  // Roughly one mission in three hits a genuine overrun: one late step burns
  // retries and crosses the hard ceiling, exercising the PAUSED_CEILING →
  // raise/abort flow for real. Deterministic per serial.
  const serialSum = [...mission.serial].reduce((a, c) => a + c.charCodeAt(0), 0);
  const overrun = serialSum % 3 === 0;
  const plan = mission.contract.plan;
  const overrunStep = plan[Math.max(0, plan.length - 2)].id;
  let projected = 0;

  // Each step starts 700ms after the LAST of its dependencies ends; steps
  // whose dependencies are satisfied at the same moment run side by side.
  const endAt = { __start: 400 };
  for (const step of plan) {
    const deps = step.dependsOn?.length ? step.dependsOn : ['__start'];
    let t = Math.max(...deps.map((d) => endAt[d] ?? 400)) + 700;
    script.push({ t, type: 'step.status', stepId: step.id, status: 'LIVE', access: step.access, requiresConfirmation: !!step.requiresConfirmation });
    if (step.id === 's1') {
      for (const cid of mission.connected || []) {
        t += 900;
        script.push({ t, type: 'log', stepId: step.id, label: 'evidence', detail: `reading ${cid} (live, read-only)…`, connector: cid });
      }
    }
    if (step.tool === 'council') {
      const c = councilScript(mission, step.id, t);
      script.push(...c.events);
      t = c.end;
    } else {
      const lines = TOOL_LINES[step.tool] || TOOL_LINES.compose;
      for (const [label, detail] of lines) {
        t += 1100 + Math.random() * 1300;
        script.push({ t, type: 'log', stepId: step.id, label, detail });
      }
    }
    t += 900;
    let jitter = Math.round(step.cost * (0.82 + Math.random() * 0.3) * 10) / 10;
    let byokSeats = 0;
    if (step.tool === 'council') {
      byokSeats = (step.seats || []).filter((x) => x.live).length;
      if (byokSeats) script.push({ t: t - 300, type: 'log', stepId: step.id, label: 'byok', detail: `${byokSeats} live seat(s) billed to your own keys — priced at 0 house credits on the ticket` });
    }
    if (overrun && step.id === overrunStep) {
      jitter = Math.max(jitter, Math.round((mission.contract.ceiling * 1.08 - projected) * 10) / 10);
      script.push({ t: t - 400, type: 'log', stepId: step.id, label: 'retry', detail: 'two model retries burned on a malformed draft — cost running hot' });
    }
    projected += jitter;
    script.push({ t, type: 'step.status', stepId: step.id, status: 'FILLED' });
    script.push({ t: t + 60, type: 'cost', stepId: step.id, delta: jitter, byokSeats });
    endAt[step.id] = t + 60;
  }

  let t = Math.max(...Object.values(endAt)) + 1000;
  script.push({ t, type: 'artifact.build' });
  t += 2400;
  script.push({ t, type: 'artifact.ready' });
  t += 1100;
  script.push({ t, type: 'validate.run' });
  t += 1400;
  script.push({ t, type: 'review.terminal' });
  t += 900;
  script.push({ t, type: 'run.done' });
  // Parallel branches interleave: the tape is strictly time-ordered.
  return script.map((e, i) => ({ ...e, _i: i })).sort((a, b) => a.t - b.t || a._i - b._i).map(({ _i, ...e }) => e);
}

/* ---------------------------- CURSOR SCHEDULER ---------------------------- */

const runners = new Map(); // missionId → {script, cursor, timer, notify}

function estimateSoFar(m) {
  return m.contract.plan.filter((p) => p.status === 'FILLED').reduce((a, p) => a + p.cost, 0);
}

function pushEvent(m, record, notify) {
  record.seq = ++m.eventSeq;
  record.schema = 'prajna.event.v1';
  record.at = Date.now();
  m.events.push(record);
  store.flushMissions();
  notify(m.id, record);
  return record;
}

function makeArtifact(m, notify) {
  const gen = GENERATORS[m.desk];
  const { title, kind, html } = gen(m);
  const artifactId = id();
  store.addArtifact({
    id: artifactId, title: m.partial ? `${title} (partial)` : title, kind, missionId: m.id, serial: m.serial,
    desk: m.deskName, tint: m.tint, createdAt: Date.now(), version: (m.lineage && m.lineage.version) || 1, supersedes: m.lineage ? m.lineage.parentArtifactId : null,
    cost: m.spent, council: m.councilNames, partial: m.partial,
  }, html);
  m.artifactId = artifactId;
  return { artifactId, title, kind };
}

function settle(m, notify) {
  m.settlement = {
    reserved: m.contract.ceiling,
    settled: Math.round(m.spent * 10) / 10,
    released: Math.round((m.contract.ceiling - m.spent) * 10) / 10,
  };
  store.releaseReserve(m.settlement.released);
  pushEvent(m, { type: 'settlement', ...m.settlement }, notify);
  // The artifact of record carries the FINAL provenance: settlement, review
  // verdict, and every human decision. Regenerate it now that they exist.
  if (m.artifactId) {
    const { html } = GENERATORS[m.desk](m);
    store.refreshArtifact(m.artifactId, { cost: m.settlement.settled, partial: !!m.partial }, html);
  }
}

function raiseAttention(m, notify, item) {
  const req = { id: id(), raisedAt: Date.now(), decision: null, justification: null, decidedAt: null, ...item };
  m.attention.push(req);
  m.status = 'PAUSED_ATTENTION';
  pushEvent(m, { type: 'attention.raised', requestId: req.id, kind: req.kind, prompt: req.prompt, options: req.options, gaps: req.gaps || null }, notify);
  return req;
}

async function applyEvent(m, ev, notify, runner) {
  const record = { ...ev };
  delete record.t;

  // Approval checkpoint: an external step never starts without a signed
  // decision. The run holds; approve continues, skip drops the step.
  if (ev.type === 'step.status' && ev.status === 'LIVE' && ev.requiresConfirmation) {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && !step.approved) {
      runner.pendingStep = ev;
      raiseAttention(m, notify, {
        kind: 'approval', stepId: step.id,
        prompt: `Step “${step.title}” acts outside the workspace (${step.access}). Approve it, or skip it and close the mission without it?`,
        options: ['approve-step', 'skip-step'],
      });
      store.flushMissions();
      return 'pause';
    }
  }

  if (ev.type === 'log' && ev.connector) {
    try {
      const text = await evidenceFor(ev.connector);
      record.detail = text ? `${text} · live` : `${ev.connector}: no live token in memory — reconnect on the Connectors page`;
      record.live = !!text;
    } catch (e) {
      record.detail = `${ev.connector}: live read failed (${String(e.message || e).slice(0, 120)}) — recorded, not hidden`;
      record.live = false;
    }
  }

  if (ev.type === 'council.position' && ev.seat) {
    const live = liveSeat(ev.seat);
    if (live) {
      try {
        record.text = await callModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, prompt: positionPrompt(m, live.model) });
        record.live = true;
        record.modelId = live.model.modelId;
      } catch (e) {
        record.live = false;
        record.liveError = String(e.message || e).slice(0, 200);
      }
    }
  }

  if (ev.type === 'step.status') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step) step.status = ev.status;
  }

  // Live authoring: at the step that writes the deliverable, a live lead seat
  // authors the substance itself. Success or failure, the ledger says which.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && ['compose', 'build', 'design'].includes(step.tool) && !m.authored) {
      const live = liveSeat(m.lead);
      if (live) {
        pushEvent(m, record, notify);
        let log;
        try {
          m.authored = await authorContent(m, live);
          log = { type: 'log', stepId: step.id, label: 'author', live: true, detail: `${m.authored.model} wrote the substance — ${m.authored.chars} chars in ${(m.authored.ms / 1000).toFixed(1)}s · billed to your key, 0 house credits · validators still gate it` };
        } catch (e) {
          m.authored = { live: false, model: live.model.name, modelId: live.model.modelId, error: String(e.message || e).slice(0, 200), at: Date.now() };
          log = { type: 'log', stepId: step.id, label: 'author', live: false, detail: `${live.model.name} could not author (${m.authored.error}) — house-scripted substance used and recorded as such` };
        }
        pushEvent(m, log, notify);
        return 'ok';
      }
    }
  }

  if (ev.type === 'cost') {
    const wouldBe = Math.round((m.spent + ev.delta) * 10) / 10;
    if (wouldBe > m.contract.ceiling) {
      // Ceiling breach: pause instead of spend. The deferred cost applies only
      // if the user raises the ceiling; abort still yields a partial artifact.
      const stepIdx = m.contract.plan.findIndex((p) => p.id === ev.stepId);
      m.partial = true;
      pushEvent(m, { type: 'ceiling.reached', stepId: ev.stepId, wouldBe, ceiling: m.contract.ceiling, note: `Step ${stepIdx + 1} of ${m.contract.plan.length} would take spend to ${wouldBe}cr — over the ${m.contract.ceiling}cr ceiling. Nothing further is spent without a decision.` }, notify);
      runner.deferredCost = ev;
      raiseAttention(m, notify, {
        kind: 'ceiling', prompt: `The hard ceiling (${m.contract.ceiling}cr) stops this mission at step ${stepIdx + 1}. Raise it, or take the partial artifact?`,
        options: ['raise-ceiling', 'abort-with-partial'],
      });
      m.status = 'PAUSED_CEILING';
      store.flushMissions();
      return 'pause';
    }
    m.spent = wouldBe;
    record.total = m.spent;
    record.estimateSoFar = estimateSoFar(m);
    record.variance = Math.round((m.spent - record.estimateSoFar) * 10) / 10;
    store.settleFromReserve(ev.delta);
  }

  if (ev.type === 'council.gate') m.gate = { rows: ev.rows, cleared: ev.cleared };

  if (ev.type === 'artifact.ready') {
    const a = makeArtifact(m, notify);
    Object.assign(record, a);
  }

  if (ev.type === 'validate.run') {
    const outcome = runValidation(m, notify, runner);
    return outcome;
  }

  if (ev.type === 'review.terminal') {
    // Amnesiac by construction: sees only the goal and the artifact.
    const review = reviewFor({ desk: m.desk, goal: m.goal, html: m.artifactId ? store.artifactHtml(m.artifactId) : '' });
    m.review = review;
    Object.assign(record, review);
    pushEvent(m, record, notify);
    if (review.verdict === 'gaps') {
      raiseAttention(m, notify, {
        kind: 'review-gap',
        prompt: `A reviewer who never saw the work found ${review.gaps.length} gap(s) in the artifact. Accept with the gap on the record, or void the artifact?`,
        options: ['accept-gap', 'void-artifact'],
        gaps: review.gaps,
      });
      store.flushMissions();
      return 'pause';
    }
    return 'pushed';
  }

  if (ev.type === 'run.done') {
    m.status = 'FILLED';
    m.filledAt = Date.now();
    record.total = m.spent;
    record.elapsed = m.filledAt - m.launchedAt;
    const as = m.contract.assertions || [];
    record.closure = { sealed: as.filter((a) => a.status === 'SEALED').length, acceptedRisk: as.filter((a) => a.status === 'ACCEPTED-RISK').length, open: as.filter((a) => !['SEALED', 'ACCEPTED-RISK'].includes(a.status)).length, total: as.length };
  }

  pushEvent(m, record, notify);
  if (ev.type === 'run.done') settle(m, notify);
  return 'ok';
}

// Two independent validator lanes prove every assertion against the real
// artifact; the gate seals only what both lanes pass. A failed gate raises a
// decision: patch (fix the earliest wrong artifact, re-validate), accept the
// risk on the record, or stop.
function runValidation(m, notify, runner) {
  const html = m.artifactId ? store.artifactHtml(m.artifactId) : '';
  const ids = (m.contract.assertions || []).map((a) => a.id);
  const rows = validateArtifact(m.variant === 'design' ? 'design' : m.desk, html || '', ids);
  const round = (m.validations?.length || 0) + 1;
  for (const lane of ['scrutiny', 'surface']) {
    const laneRows = rows.filter((r) => r.lane === lane);
    pushEvent(m, { type: 'validate.lane', lane, round, verdicts: laneRows.map((r) => ({ id: r.id, passed: r.passed, error: r.error })) , note: `${lane} lane: ${laneRows.filter((r) => r.passed).length}/${laneRows.length} assertions pass` }, notify);
  }
  const gate = evaluateGate(ids, rows);
  m.validations = [...(m.validations || []), { round, rows, gate }];
  for (const a of m.contract.assertions || []) {
    a.status = gate.sealed.includes(a.id) ? 'SEALED' : gate.dissenting.includes(a.id) ? 'DISSENT' : gate.failed.includes(a.id) ? 'FAILED' : m.acceptedRisks?.includes(a.id) ? 'ACCEPTED-RISK' : 'OPEN';
  }
  const openAfterRisk = [...gate.failed, ...gate.dissenting, ...gate.missing].filter((id) => !(m.acceptedRisks || []).includes(id));
  pushEvent(m, { type: 'gate', round, cleared: openAfterRisk.length === 0, sealed: gate.sealed, failed: gate.failed, dissenting: gate.dissenting, missing: gate.missing, acceptedRisks: m.acceptedRisks || [],
    note: openAfterRisk.length === 0
      ? `Gate cleared: ${gate.sealed.length}/${ids.length} assertions sealed by both lanes${(m.acceptedRisks || []).length ? ` · ${(m.acceptedRisks || []).length} carried as accepted risk` : ''}.`
      : `Gate NOT cleared: ${openAfterRisk.join(', ')} — ${gate.failed.length} failed, ${gate.dissenting.length} dissenting, ${gate.missing.length} missing.` }, notify);
  m.gateResult = gate;
  if (openAfterRisk.length === 0) return 'pushed';
  // A patch that did not clear is not offered twice: the honest options left
  // are to carry the risk on the record or stop.
  const alreadyPatched = openAfterRisk.filter((id) => (m.patches || []).includes(id));
  const patchable = alreadyPatched.length < openAfterRisk.length;
  raiseAttention(m, notify, {
    kind: 'gate', assertions: openAfterRisk,
    prompt: `The gate did not clear: ${openAfterRisk.map((id) => `${id} — ${(m.contract.assertions.find((a) => a.id === id) || {}).title}`).join('; ')}. ${alreadyPatched.length ? `A patch was already applied to ${alreadyPatched.join(', ')} and did not clear it. ` : ''}${patchable ? 'Patch the artifact and re-validate, accept the risk on the record, or stop?' : 'Accept the risk on the record, or stop?'}`,
    options: patchable ? ['patch', 'accept-risk', 'stop-run'] : ['accept-risk', 'stop-run'],
  });
  store.flushMissions();
  return 'pause';
}

function scheduleNext(missionId) {
  const runner = runners.get(missionId);
  if (!runner) return;
  const m = store.mission(missionId);
  if (!m || m.status === 'KILLED' || m.status === 'FILLED') { runners.delete(missionId); return; }
  if (runner.cursor >= runner.script.length) { runners.delete(missionId); return; }

  const ev = runner.script[runner.cursor];
  const prevT = runner.cursor === 0 ? 0 : runner.script[runner.cursor - 1].t;
  const delay = Math.max(60, ev.t - prevT);

  runner.timer = setTimeout(() => {
    const mission = store.mission(missionId);
    if (!mission || mission.status === 'KILLED') return;
    runner.cursor++;
    mission.runCursor = runner.cursor;
    applyEvent(mission, ev, runner.notify, runner).catch((e) => { console.error('prajna: event failed', e); return 'ok'; }).then((outcome) => {
      const after = store.mission(missionId);
      if (!after || after.status === 'FILLED' || after.status === 'KILLED') { runners.delete(missionId); return; }
      if (outcome === 'pause') {
        after.deferredCost = runner.deferredCost || null;
        store.flushMissions();
        return; // resumed via attention decision
      }
      scheduleNext(missionId);
    });
  }, delay);
}

export function launchMission(missionId, notify) {
  const mission = store.mission(missionId);
  if (!mission || mission.status !== 'OPEN') return null;
  if (!store.reserveCredits(mission.contract.ceiling)) return null;
  mission.status = 'LIVE';
  mission.launchedAt = Date.now();
  if (mission.eventSeq === undefined) mission.eventSeq = 0;
  if (!mission.attention) mission.attention = [];
  if (!mission.contract.dimensions) mission.contract.dimensions = DIMENSIONS[mission.desk] || DIMENSIONS.brief;

  // The script is persisted with the mission so a server restart can
  // rehydrate the runner and continue exactly where the run left off.
  mission.seats = [mission.lead, ...mission.advisers].map((id) => ({ id, name: modelById(id).name, live: !!liveSeat(id) }));
  const script = buildScript(mission);
  mission.runScript = script;
  mission.runCursor = 0;
  store.flushMissions();

  runners.set(missionId, { script, cursor: 0, timer: null, notify, deferredCost: null, pendingStep: null });
  scheduleNext(missionId);
  return mission;
}

// Called once at server boot: rebuild runners for missions that were LIVE or
// PAUSED when the previous process ended. LIVE runs continue from their
// cursor; PAUSED runs wait for their attention decision as before.
export function rehydrate(notify) {
  let resumed = 0;
  for (const m of store.missions()) {
    if (!['LIVE', 'PAUSED_ATTENTION', 'PAUSED_CEILING'].includes(m.status)) continue;
    if (!Array.isArray(m.runScript) || typeof m.runCursor !== 'number') {
      // Pre-persistence mission: nothing to resume from — close it honestly.
      m.status = 'LIVE';
      runners.set(m.id, { script: [], cursor: 0, timer: null, notify, deferredCost: null });
      killMission(m.id, notify);
      continue;
    }
    runners.set(m.id, { script: m.runScript, cursor: m.runCursor, timer: null, notify, deferredCost: m.deferredCost || null, pendingStep: m.runScript[m.runCursor - 1]?.requiresConfirmation ? m.runScript[m.runCursor - 1] : null });
    if (m.status === 'LIVE') scheduleNext(m.id);
    resumed++;
  }
  if (resumed) console.log(`prajna: rehydrated ${resumed} in-flight mission(s)`);
}

/* --------------------------------- CONTROLS ------------------------------- */

export function killMission(missionId, notify) {
  const m = store.mission(missionId);
  if (!m || (m.status !== 'LIVE' && !m.status.startsWith('PAUSED'))) return null;
  const runner = runners.get(missionId);
  if (runner?.timer) clearTimeout(runner.timer);
  runners.delete(missionId);

  // Any undecided attention item dies with the run — recorded as voided, so
  // the open question stays on the record instead of vanishing.
  for (const req of (m.attention || []).filter((r) => !r.decision)) {
    req.decision = 'voided-by-kill';
    req.justification = 'Run stopped before a decision was made.';
    req.decidedAt = Date.now();
  }

  const filled = m.contract.plan.filter((p) => p.status === 'FILLED').length;
  m.partial = m.partial || filled < m.contract.plan.length;
  m.status = 'KILLED';
  m.contract.plan.forEach((p) => { if (p.status === 'LIVE') p.status = 'KILLED'; });
  const artifactNote = m.artifactId
    ? 'The artifact already produced is retained.'
    : 'Completed work is kept — a partial artifact follows.';
  pushEvent(m, { type: 'run.killed', note: `Run stopped at step ${Math.min(filled + 1, m.contract.plan.length)} of ${m.contract.plan.length}. ${artifactNote} Nothing beyond ${m.spent.toFixed(1)}cr was spent.` }, notify);
  if (!m.artifactId) {
    const a = makeArtifact(m, notify);
    pushEvent(m, { type: 'artifact.ready', ...a, partial: true }, notify);
  }
  settle(m, notify);
  store.flushMissions();
  return m;
}

// Void an OPEN ticket: nothing ran, nothing was spent, the serial is retired.
// Pushed as an event so any open stream (e.g. a Run tab) updates live.
export function voidTicket(missionId, notify) {
  const m = store.mission(missionId);
  if (!m || m.status !== 'OPEN') return null;
  m.status = 'KILLED';
  m.voidedBeforeRun = true;
  if (m.eventSeq === undefined) m.eventSeq = 0;
  pushEvent(m, { type: 'ticket.voided', note: 'Ticket voided before any spend. The serial is retired.' }, notify);
  return m;
}

// Fork: amend & re-run. A new OPEN ticket on the same desk with the same
// panel, carrying lineage so the next artifact is v(n+1) and supersedes.
export function forkMission(missionId, { goal, installedSkills, queuedConnectors }) {
  const parent = store.mission(missionId);
  if (!parent) return null;
  const version = ((parent.lineage && parent.lineage.version) || 1) + 1;
  return writeContract({
    goal: goal || parent.goal, deskId: parent.desk, lead: parent.lead, advisers: parent.advisers,
    installedSkills, queuedConnectors,
    lineage: { parentId: parent.id, parentSerial: parent.serial, parentArtifactId: parent.artifactId || null, version },
  });
}

export async function decideAttention(missionId, requestId, decision, justification, notify) {
  const m = store.mission(missionId);
  if (!m) return { error: 'Mission not found.' };
  if (m.status === 'KILLED' || m.status === 'FILLED') {
    return { error: `This position is already ${m.status.toLowerCase()} — the run ended before the decision landed.` };
  }
  const req = (m.attention || []).find((r) => r.id === requestId);
  if (!req) return { error: 'Attention item not found.' };
  if (req.decision) return { error: 'Already decided — decisions are first-write-wins.' };
  if (!req.options.includes(decision)) return { error: `Decision must be one of: ${req.options.join(', ')}` };
  if (!justification || !justification.trim()) return { error: 'A justification is required — it goes on the record.' };

  // Fund a raised ceiling BEFORE anything is recorded; a refusal changes nothing.
  let raisedCeiling = null;
  if (req.kind === 'ceiling' && decision === 'raise-ceiling') {
    raisedCeiling = Math.ceil(m.contract.ceiling * 1.4);
    if (!store.reserveCredits(raisedCeiling - m.contract.ceiling)) {
      return { error: `House credits cannot fund the raised ceiling (${raisedCeiling}cr). Abort with the partial artifact, or top up first.` };
    }
  }

  req.decision = decision;
  req.justification = justification.trim().slice(0, 300);
  req.decidedAt = Date.now();
  pushEvent(m, { type: 'attention.resolved', requestId, kind: req.kind, decision, justification: req.justification }, notify);

  const runner = runners.get(missionId);

  if (req.kind === 'ceiling') {
    if (decision === 'raise-ceiling') {
      m.contract.ceiling = raisedCeiling;
      m.partial = false;
      m.status = 'LIVE';
      pushEvent(m, { type: 'ceiling.raised', ceiling: m.contract.ceiling }, notify);
      const deferred = runner?.deferredCost || m.deferredCost;
      if (runner) runner.deferredCost = null;
      m.deferredCost = null;
      if (deferred) await applyEvent(m, deferred, notify, runner || { deferredCost: null });
      scheduleNext(missionId);
    } else {
      killMission(missionId, notify);
    }
  } else if (req.kind === 'approval') {
    const step = m.contract.plan.find((p) => p.id === req.stepId);
    if (decision === 'approve-step') {
      if (step) step.approved = true;
      m.status = 'LIVE';
      pushEvent(m, { type: 'step.approved', stepId: req.stepId, note: `Approved: “${step?.title}” may act externally. Signed with the justification above.` }, notify);
      const pending = runner?.pendingStep;
      if (runner) runner.pendingStep = null;
      if (pending) await applyEvent(m, pending, notify, runner);
      scheduleNext(missionId);
    } else {
      if (step) step.status = 'SKIPPED';
      m.status = 'LIVE';
      if (runner) {
        runner.pendingStep = null;
        // Drop every remaining event of the skipped step from the timeline.
        runner.script = runner.script.filter((e, i) => i < runner.cursor || e.stepId !== req.stepId);
        m.runScript = runner.script;
      }
      pushEvent(m, { type: 'step.skipped', stepId: req.stepId, note: `Skipped: “${step?.title}” — declined on the record. Nothing acted externally; nothing was spent on it.` }, notify);
      scheduleNext(missionId);
    }
  } else if (req.kind === 'gate') {
    if (decision === 'patch') {
      // Patch the earliest wrong artifact: the deliverable is regenerated with
      // the patch applied, then both lanes run again.
      m.patches = [...new Set([...(m.patches || []), ...req.assertions])];
      m.status = 'LIVE';
      pushEvent(m, { type: 'artifact.patched', assertions: req.assertions, note: `Patch applied for ${req.assertions.join(', ')} — artifact regenerated, re-validating.` }, notify);
      if (m.artifactId) {
        const { html } = GENERATORS[m.desk](m);
        store.refreshArtifact(m.artifactId, { version: store.artifact(m.artifactId)?.version || 1 }, html);
      }
      const outcome = runValidation(m, notify, runner);
      if (outcome !== 'pause') scheduleNext(missionId);
    } else if (decision === 'accept-risk') {
      m.acceptedRisks = [...new Set([...(m.acceptedRisks || []), ...req.assertions])];
      for (const a of m.contract.assertions || []) if (req.assertions.includes(a.id)) a.status = 'ACCEPTED-RISK';
      m.status = 'LIVE';
      pushEvent(m, { type: 'risk.accepted', assertions: req.assertions, note: `Accepted risk on the record: ${req.assertions.join(', ')} ship unproven, by your decision.` }, notify);
      scheduleNext(missionId);
    } else {
      killMission(missionId, notify);
    }
  } else if (req.kind === 'review-gap') {
    if (decision === 'accept-gap') {
      m.status = 'LIVE';
      pushEvent(m, { type: 'review.accepted', note: 'Gap accepted and recorded in provenance — the artifact ships with the gap named, not hidden.' }, notify);
      scheduleNext(missionId);
    } else {
      // Really void it: the ledger entry is stamped VOID, the artifact of
      // record is regenerated carrying the void, and the run closes on it.
      m.voided = true;
      m.status = 'LIVE';
      if (m.artifactId) {
        const a = store.artifact(m.artifactId);
        store.refreshArtifact(m.artifactId, { voided: true, title: a && !a.title.startsWith('VOID') ? `VOID · ${a.title}` : a?.title }, GENERATORS[m.desk](m).html);
      }
      pushEvent(m, { type: 'artifact.voided', note: 'Artifact VOIDED on terminal review — kept in Artifacts for audit, stamped void. The run closes with the void on the record.' }, notify);
      scheduleNext(missionId);
    }
  }
  store.flushMissions();
  return { ok: true };
}
