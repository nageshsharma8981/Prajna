// The mission engine. Writes the contract (plan + estimate) before anything
// runs, then executes the run as a timed event script streamed over SSE.
// Demo mode: the script is authored, the artifacts are real. A provider layer
// can swap in live model calls when ANTHROPIC_API_KEY is present (future).

import { store } from './store.js';
import { deskById, modelById } from './catalog.js';
import { GENERATORS, subjectOf } from './artifacts.js';

let counter = 4100 + Math.floor(Math.random() * 400);
const nextSerial = () => `PX-${counter++}`;
const id = () => Math.random().toString(36).slice(2, 10);

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

export function writeContract({ goal, deskId, lead, advisers }) {
  const desk = deskById(deskId);
  const subject = subjectOf(goal);
  const plan = PLANS[desk.id](subject.length > 52 ? subject.slice(0, 49) + '…' : subject)
    .map((p, i) => ({ id: `s${i + 1}`, status: 'QUEUED', ...p }));
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
    status: 'OPEN', // OPEN → LIVE → FILLED
    contract: { plan, estimate, ceiling: Math.ceil(estimate * 1.25) },
    spent: 0,
    events: [],
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
    text: `Synthesis: adopt the strong-claim structure, date the window, carry the graded caveats into the artifact itself.`,
    dissent: hasDissent ? { model: 'DeepSeek R2', text: 'Holds that the window estimate is optimistic. Recorded in the artifact, not erased.' } : null,
  });
  return { events: ev, end: t };
}

/* -------------------------------- RUN SCRIPT ------------------------------ */

const TOOL_LINES = {
  scope: [['parse-goal', 'decomposed into decision, audience, constraints'], ['frame', 'success criteria drafted · 3 explicit, 1 implicit']],
  search: [['web.search', '34 candidates → 19 kept after dedupe'], ['fetch', '11 primary documents retrieved'], ['extract', '61 claims extracted with source spans']],
  'cite-guard': [['grade', '61 claims graded · 9×A · 21×B · 31×C'], ['refuse', '4 ungraded assertions refused from draft']],
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

export function launchMission(missionId, notify) {
  const mission = store.mission(missionId);
  if (!mission || mission.status !== 'OPEN') return null;
  mission.status = 'LIVE';
  mission.launchedAt = Date.now();
  store.flushMissions();

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
    script.push({ t: t + 60, type: 'cost', delta: jitter });
  }

  t += 1000;
  script.push({ t, type: 'artifact.build' });
  t += 2400;
  script.push({ t, type: 'artifact.ready' });
  t += 900;
  script.push({ t, type: 'run.done' });

  // Execute the script against real time.
  for (const ev of script) {
    setTimeout(() => {
      const m = store.mission(missionId);
      if (!m || m.status === 'KILLED') return;
      const record = { ...ev, at: Date.now() };
      delete record.t;

      if (ev.type === 'step.status') {
        const step = m.contract.plan.find((p) => p.id === ev.stepId);
        if (step) step.status = ev.status;
      }
      if (ev.type === 'cost') {
        m.spent = Math.round((m.spent + ev.delta) * 10) / 10;
        record.total = m.spent;
        store.spendCredits(ev.delta);
      }
      if (ev.type === 'artifact.ready') {
        const gen = GENERATORS[m.desk];
        const { title, kind, html } = gen(m);
        const artifactId = id();
        store.addArtifact({
          id: artifactId, title, kind, missionId: m.id, serial: m.serial,
          desk: m.deskName, tint: m.tint, createdAt: Date.now(), version: 1,
          cost: m.spent, council: m.councilNames,
        }, html);
        m.artifactId = artifactId;
        record.artifactId = artifactId;
        record.title = title;
        record.kind = kind;
      }
      if (ev.type === 'run.done') {
        m.status = 'FILLED';
        m.filledAt = Date.now();
        record.total = m.spent;
        record.elapsed = m.filledAt - m.launchedAt;
      }

      m.events.push(record);
      store.flushMissions();
      notify(missionId, record);
    }, ev.t);
  }
  return mission;
}
