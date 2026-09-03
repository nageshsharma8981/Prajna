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
import { deskById, modelById } from './catalog.js';
import { GENERATORS, subjectOf } from './artifacts.js';

let counter = 4100 + Math.floor(Math.random() * 400);
const nextSerial = () => `PX-${counter++}`;
const id = () => Math.random().toString(36).slice(2, 10);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* ------------------------------- CONTRACTS -------------------------------- */

const PLANS = {
  brief: (s) => [
    { title: `Frame the decision behind “${s}”`, tool: 'scope', cost: 6 },
    { title: 'Sweep sources — filings, sector analyses, press', tool: 'search', cost: 14 },
    { title: 'Grade every claim A–D by source strength', tool: 'cite-guard', cost: 10 },
    { title: 'Council deliberation — positions, challenges, verdict', tool: 'council', cost: 18 },
    { title: 'Steelman the opposite conclusion', tool: 'steelman', cost: 8 },
    { title: 'Compose the decision brief', tool: 'compose', cost: 12 },
  ],
  deck: (s) => [
    { title: `Extract the argument in “${s}”`, tool: 'scope', cost: 6 },
    { title: 'Storyboard the narrative arc — nine beats', tool: 'storyboard', cost: 10 },
    { title: 'Council deliberation on the through-line', tool: 'council', cost: 16 },
    { title: 'Draft slides — one idea per slide', tool: 'compose', cost: 14 },
    { title: 'Deck Doctor pass — kill bullet sprawl', tool: 'deck-doctor', cost: 8 },
  ],
  site: (s) => [
    { title: `Position the offer — “${s}”`, tool: 'scope', cost: 6 },
    { title: 'Council deliberation on promise & proof', tool: 'council', cost: 14 },
    { title: 'Cut copy to promise → proof → action', tool: 'copy-cutter', cost: 8 },
    { title: 'Build the page — semantic, responsive', tool: 'build', cost: 16 },
    { title: 'Access audit — contrast, focus order', tool: 'a11y-audit', cost: 6 },
  ],
  analysis: (s) => [
    { title: `Define the question — “${s}”`, tool: 'scope', cost: 6 },
    { title: 'Load & profile the series (sample data)', tool: 'ingest', cost: 8 },
    { title: 'Interrogate — segments, mix shift, outliers', tool: 'analyze', cost: 14 },
    { title: 'Council deliberation on the read', tool: 'council', cost: 14 },
    { title: 'Chart Smith — honest forms only', tool: 'chart-smith', cost: 8 },
    { title: 'Compose dashboard with caveats attached', tool: 'compose', cost: 10 },
  ],
};

// Acceptance dimensions per desk — the council gate votes on these.
export const DIMENSIONS = {
  brief: ['Attribution', 'Completeness', 'Freshness'],
  deck: ['One idea per slide', 'Evidence under assertion', 'Narrative arc'],
  site: ['Promise → proof → action', 'Accessibility AA', 'Responsive'],
  analysis: ['Honest chart forms', 'Caveats attached', 'Segment coverage'],
};

export function writeContract({ goal, deskId, lead, advisers }) {
  const desk = deskById(deskId);
  const subject = subjectOf(goal);
  const plan = PLANS[desk.id](subject.length > 52 ? subject.slice(0, 49) + '…' : subject)
    .map((p, i) => ({ id: `s${i + 1}`, status: 'QUEUED', contextHash: hash(`${desk.id}:${i}:${p.tool}:${goal}`), ...p }));
  const estimate = plan.reduce((a, p) => a + p.cost, 0);
  const councilIds = [lead, ...advisers.filter((a) => a !== lead)];
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
    councilNames: councilIds.map((m) => modelById(m).name),
    status: 'OPEN', // OPEN → LIVE → FILLED | KILLED | PAUSED_ATTENTION | PAUSED_CEILING
    contract: { plan, estimate, ceiling: Math.ceil(estimate * 1.25), dimensions: DIMENSIONS[desk.id] },
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
  const dims = mission.contract.dimensions;
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
    ev.push({ t: (t += 1400 + Math.random() * 900), type: 'council.position', stepId, model: model.name, symbol: model.symbol, color: model.color, text: (VOICES[m] || VOICES.sonnet)(s) });
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
};

// The amnesiac terminal review: by construction sees only (goal, artifact).
// Scripted: the site desk surfaces a real GAP and raises an attention item.
function reviewFor(mission) {
  if (mission.desk === 'site') {
    return {
      verdict: 'gaps',
      gaps: [{
        id: 'GAP-001', severity: 'minor',
        description: 'The page promises a proof section, but the case-study slot ships as a labeled placeholder. Either the label must be louder or the section cut until real proof exists.',
      }],
    };
  }
  return { verdict: 'pass', gaps: [] };
}

function buildScript(mission) {
  const script = [];
  let t = 400;
  script.push({ t, type: 'run.launched', serial: mission.serial });

  for (const step of mission.contract.plan) {
    t += 700;
    script.push({ t, type: 'step.status', stepId: step.id, status: 'LIVE' });
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
    const jitter = Math.round(step.cost * (0.82 + Math.random() * 0.3) * 10) / 10;
    script.push({ t, type: 'step.status', stepId: step.id, status: 'FILLED' });
    script.push({ t: t + 60, type: 'cost', stepId: step.id, delta: jitter });
  }

  t += 1000;
  script.push({ t, type: 'artifact.build' });
  t += 2400;
  script.push({ t, type: 'artifact.ready' });
  t += 1400;
  script.push({ t, type: 'review.terminal' });
  t += 900;
  script.push({ t, type: 'run.done' });
  return script;
}

/* ---------------------------- CURSOR SCHEDULER ---------------------------- */

const runners = new Map(); // missionId → {script, cursor, timer, notify}

function estimateSoFar(m) {
  return m.contract.plan.filter((p) => p.status === 'FILLED').reduce((a, p) => a + p.cost, 0);
}

function pushEvent(m, record, notify) {
  record.seq = ++m.eventSeq;
  record.schema = 'praxis.event.v1';
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
    desk: m.deskName, tint: m.tint, createdAt: Date.now(), version: 1,
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
  pushEvent(m, { type: 'attention.raised', requestId: req.id, kind: req.kind, prompt: req.prompt, options: req.options }, notify);
  return req;
}

function applyEvent(m, ev, notify, runner) {
  const record = { ...ev };
  delete record.t;

  if (ev.type === 'step.status') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step) step.status = ev.status;
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
        kind: 'ceiling', prompt: `The hard ceiling (${m.contract.ceiling}cr) stops this run at step ${stepIdx + 1}. Raise it, or take the partial artifact?`,
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
    store.spendCredits(ev.delta);
  }

  if (ev.type === 'council.gate') m.gate = { rows: ev.rows, cleared: ev.cleared };

  if (ev.type === 'artifact.ready') {
    const a = makeArtifact(m, notify);
    Object.assign(record, a);
  }

  if (ev.type === 'review.terminal') {
    // Amnesiac by construction: sees only the goal and the artifact.
    const review = reviewFor({ desk: m.desk, goal: m.goal });
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
  }

  pushEvent(m, record, notify);
  if (ev.type === 'run.done') settle(m, notify);
  return 'ok';
}

function scheduleNext(missionId) {
  const runner = runners.get(missionId);
  if (!runner) return;
  const m = store.mission(missionId);
  if (!m || m.status === 'KILLED' || m.status === 'FILLED') return;
  if (runner.cursor >= runner.script.length) return;

  const ev = runner.script[runner.cursor];
  const prevT = runner.cursor === 0 ? 0 : runner.script[runner.cursor - 1].t;
  const delay = Math.max(60, ev.t - prevT);

  runner.timer = setTimeout(() => {
    const mission = store.mission(missionId);
    if (!mission || mission.status === 'KILLED') return;
    runner.cursor++;
    const outcome = applyEvent(mission, ev, runner.notify, runner);
    if (outcome === 'pause') return; // resumed via attention decision
    scheduleNext(missionId);
  }, delay);
}

export function launchMission(missionId, notify) {
  const mission = store.mission(missionId);
  if (!mission || mission.status !== 'OPEN') return null;
  mission.status = 'LIVE';
  mission.launchedAt = Date.now();
  if (mission.eventSeq === undefined) mission.eventSeq = 0;
  if (!mission.attention) mission.attention = [];
  store.flushMissions();

  runners.set(missionId, { script: buildScript(mission), cursor: 0, timer: null, notify, deferredCost: null });
  scheduleNext(missionId);
  return mission;
}

/* --------------------------------- CONTROLS ------------------------------- */

export function killMission(missionId, notify) {
  const m = store.mission(missionId);
  if (!m || (m.status !== 'LIVE' && !m.status.startsWith('PAUSED'))) return null;
  const runner = runners.get(missionId);
  if (runner?.timer) clearTimeout(runner.timer);
  runners.delete(missionId);

  const filled = m.contract.plan.filter((p) => p.status === 'FILLED').length;
  m.partial = filled < m.contract.plan.length;
  m.status = 'KILLED';
  m.contract.plan.forEach((p) => { if (p.status === 'LIVE') p.status = 'KILLED'; });
  pushEvent(m, { type: 'run.killed', note: `Position killed at step ${Math.min(filled + 1, m.contract.plan.length)} of ${m.contract.plan.length}. Completed work is kept — a partial artifact follows. Nothing beyond ${m.spent.toFixed(1)}cr was spent.` }, notify);
  if (!m.artifactId) {
    const a = makeArtifact(m, notify);
    pushEvent(m, { type: 'artifact.ready', ...a, partial: true }, notify);
  }
  settle(m, notify);
  store.flushMissions();
  return m;
}

export function decideAttention(missionId, requestId, decision, justification, notify) {
  const m = store.mission(missionId);
  if (!m) return { error: 'Mission not found.' };
  const req = (m.attention || []).find((r) => r.id === requestId);
  if (!req) return { error: 'Attention item not found.' };
  if (req.decision) return { error: 'Already decided — decisions are first-write-wins.' };
  if (!req.options.includes(decision)) return { error: `Decision must be one of: ${req.options.join(', ')}` };
  if (!justification || !justification.trim()) return { error: 'A justification is required — it goes on the record.' };

  req.decision = decision;
  req.justification = justification.trim().slice(0, 300);
  req.decidedAt = Date.now();
  pushEvent(m, { type: 'attention.resolved', requestId, kind: req.kind, decision, justification: req.justification }, notify);

  const runner = runners.get(missionId);

  if (req.kind === 'ceiling') {
    if (decision === 'raise-ceiling') {
      m.contract.ceiling = Math.ceil(m.contract.ceiling * 1.4);
      m.partial = false;
      m.status = 'LIVE';
      pushEvent(m, { type: 'ceiling.raised', ceiling: m.contract.ceiling }, notify);
      if (runner?.deferredCost) {
        const ev = runner.deferredCost;
        runner.deferredCost = null;
        applyEvent(m, ev, notify, runner);
      }
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
      m.partial = true;
      m.status = 'LIVE';
      pushEvent(m, { type: 'artifact.voided', note: 'Artifact voided on review. The run closes with the void on the record.' }, notify);
      scheduleNext(missionId);
    }
  }
  store.flushMissions();
  return { ok: true };
}
