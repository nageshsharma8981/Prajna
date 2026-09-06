// The mission engine. Writes the contract (plan + estimate + acceptance
// dimensions) before anything runs, then executes the run as a cursor-driven
// event script streamed over SSE. Every event gets a monotonic seq, the
// ledger is the single source of truth for live view, replay, and provenance.
//
// Runs can pause (attention items, ceiling) and terminate early (kill), and
// every terminal or paused state still produces an artifact. Demo mode: the
// script is authored, the artifacts are real. A provider layer can swap in
// live model calls when ANTHROPIC_API_KEY is present (future).

import crypto from 'node:crypto';
import { store } from './store.js';
import { deskById, modelById, SKILLS } from './catalog.js';
import { GENERATORS, subjectOf, deckSlides, deckLook } from './artifacts.js';
import fs from 'node:fs';
import path from 'node:path';
import { callModel, generateImage, synthesizeSpeech } from './providers.js';
import { DATA_DIR } from './store.js';
import { authorContent, critiqueContent } from './author.js';
import { memoryCount } from './memory.js';
import { retrieve, urlsIn, readPages } from './retrieve.js';
import { composeFor } from './compose.js';
import { costHistory } from './history.js';
import { clarify } from './clarify.js';

// The table sets the estimate; the house's own past sets the ceiling when it
// knows better. A ceiling too low does not save money, it stops a run and
// asks the owner to raise it, which is worse than reserving honestly. The
// estimate is never touched: only the room around it.
function ceilingFor(estimate, { desk, depth, variant }) {
  const table = Math.ceil(estimate * 1.25);
  // Like for like first; if too few of exactly this kind have finished, ask
  // the desk as a whole rather than pretend the narrow answer is the evidence.
  const narrow = costHistory({ desk, depth, variant });
  const h = narrow.enough && narrow.n >= 5 ? narrow : costHistory({ desk });
  if (!h.enough || h.n < 5 || h.high <= table) return { ceiling: table, from: 'table' };
  return { ceiling: Math.ceil(h.high * 1.05), from: 'history', table, n: h.n, high: h.high, median: h.median, like: h === narrow };
}
import { takeUsage } from './providers.js';

// Tokens the owner's own provider says a call used. Counted, never estimated:
// a provider that reports nothing adds nothing but the call itself.
function countUsage(m, model) {
  const u = takeUsage();
  if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} };
  m.keyUse.calls += 1;
  if (u) {
    m.keyUse.reported += 1;
    m.keyUse.prompt += u.prompt || 0;
    m.keyUse.completion += u.completion || 0;
    const k = model || 'a model';
    const at = (m.keyUse.models[k] = m.keyUse.models[k] || { calls: 0, prompt: 0, completion: 0 });
    at.calls += 1; at.prompt += u.prompt || 0; at.completion += u.completion || 0;
  }
  return u;
}
import { narrateRun } from './narrate.js';
import { addMessage } from './workspace.js';
import { record as ledger } from './ledger.js';
import { looksLikeCsv, profileCsv, dataSummary } from './data.js';
import { gather, deliver, DELIVERABLE_CONNECTORS } from './connect.js';
import { ws, flushWs } from './workspace.js';
import { ASSERTIONS, validateArtifact, evaluateGate } from './validators.js';

// BYOK: a model is LIVE when the workspace holds a key for its provider.
export function liveSeat(modelIdOrRef) {
  const model = modelById(modelIdOrRef);
  const k = model && model.provider ? store.keyFor(model.provider) : null;
  return k ? { model, key: k.key, baseUrl: model.baseUrl || k.baseUrl || null } : null; // a model's own host wins over the provider default
}

function positionPrompt(mission, model) {
  const sources = (mission.sources || []).slice(0, 6).map((s, i) => `[${i + 1}] ${s.title}, ${s.extract.slice(0, 220)}`).join('\n');
  return `You are ${model.name}, one model on a review panel for a ${mission.deskName.toLowerCase()} mission.\nGoal: "${mission.goal}"\nDeliverable: ${mission.deliverable}.\n${sources ? `Retrieved sources on the table (refer to them by number where they bear on your position):\n${sources}\n` : ''}In 2-3 sentences state your position: the single strongest claim the deliverable should lead with, the biggest risk, and what you would refuse to assert without evidence. Be specific. No preamble.`;
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
// implemented): each step names what it depends on, and its access class,
// read (observes), write (produces local artifacts), external (acts on the
// world; always an approval checkpoint). Steps with no dependency between
// them run in parallel on the tape.
const PLANS = {
  brief: (s) => [
    { id: 's1', title: `Frame the decision behind “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Sweep sources: filings, sector analyses, press', tool: 'search', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Grade every claim A–D by source strength', tool: 'cite-guard', cost: 10, access: 'read', dependsOn: ['s2'] },
    { id: 's4', title: 'Panel deliberation: positions, challenges, verdict', tool: 'council', cost: 18, access: 'read', dependsOn: ['s2'] },
    { id: 's5', title: 'Steelman the opposite conclusion', tool: 'steelman', cost: 8, access: 'read', dependsOn: ['s4'] },
    { id: 's6', title: 'Compose the decision brief', tool: 'compose', cost: 12, access: 'write', dependsOn: ['s3', 's5'] },
  ],
  deck: (s) => [
    { id: 's1', title: `Extract the argument in “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Storyboard the narrative arc, nine beats', tool: 'storyboard', cost: 10, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Panel deliberation on the through-line', tool: 'council', cost: 16, access: 'read', dependsOn: ['s1'] },
    { id: 's4', title: 'Draft slides: one idea per slide', tool: 'compose', cost: 14, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Deck Doctor pass: kill bullet sprawl', tool: 'deck-doctor', cost: 8, access: 'write', dependsOn: ['s4'] },
    { id: 's6', title: 'Illustrate: one image per slide on your image key', tool: 'illustrate', cost: 6, access: 'write', dependsOn: ['s5'] },
    { id: 's7', title: 'Narrate: speak the presenter notes on your key, for the film', tool: 'narrate', cost: 4, access: 'write', dependsOn: ['s6'] },
  ],
  site: (s) => [
    { id: 's1', title: `Position the offer, “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Panel deliberation on promise & proof', tool: 'council', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Cut copy to promise → proof → action', tool: 'copy-cutter', cost: 8, access: 'write', dependsOn: ['s1'] },
    { id: 's4', title: 'Build the page, semantic, responsive', tool: 'build', cost: 16, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Access audit: contrast, focus order', tool: 'a11y-audit', cost: 6, access: 'read', dependsOn: ['s4'] },
    { id: 's6', title: 'Illustrate: a hero image on your image key', tool: 'illustrate', cost: 4, access: 'write', dependsOn: ['s4'] },
  ],
  mobile: (s) => [
    { id: 's1', title: `Map the app, “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Panel deliberation on the core flow', tool: 'council', cost: 14, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Screen inventory & navigation', tool: 'storyboard', cost: 8, access: 'read', dependsOn: ['s1'] },
    { id: 's4', title: 'Build the tappable prototype, 4 screens, tab bar', tool: 'build', cost: 16, access: 'write', dependsOn: ['s2', 's3'] },
    { id: 's5', title: 'Access audit: touch targets, contrast', tool: 'a11y-audit', cost: 6, access: 'read', dependsOn: ['s4'] },
    { id: 's6', title: 'Illustrate: an app icon on your image key', tool: 'illustrate', cost: 3, access: 'write', dependsOn: ['s4'] },
  ],
  analysis: (s) => [
    { id: 's1', title: `Define the question, “${s}”`, tool: 'scope', cost: 6, access: 'read', dependsOn: [] },
    { id: 's2', title: 'Load & profile the series (sample data)', tool: 'ingest', cost: 8, access: 'read', dependsOn: ['s1'] },
    { id: 's3', title: 'Interrogate: segments, mix shift, outliers', tool: 'analyze', cost: 14, access: 'read', dependsOn: ['s2'] },
    { id: 's4', title: 'Panel deliberation on the read', tool: 'council', cost: 14, access: 'read', dependsOn: ['s2'] },
    { id: 's5', title: 'Chart Smith: honest forms only', tool: 'chart-smith', cost: 8, access: 'write', dependsOn: ['s3'] },
    { id: 's6', title: 'Compose dashboard with caveats attached', tool: 'compose', cost: 10, access: 'write', dependsOn: ['s4', 's5'] },
  ],
};

// Queued connectors add an EXTERNAL delivery step, the only step class that
// always holds for approval before it runs.
const CONNECTOR_STEPS = {
  slack: { title: 'Post the delivery to Slack (queued connector)', tool: 'connector-post', cost: 2 },
  notion: { title: 'Publish the artifact to Notion (queued connector)', tool: 'connector-post', cost: 2 },
  gmail: { title: 'Draft a delivery email in Gmail (queued connector)', tool: 'connector-post', cost: 2 },
  outlook: { title: 'Draft a delivery email in Outlook (queued connector)', tool: 'connector-post', cost: 2 },
  github: { title: 'Open a delivery issue on GitHub (queued connector)', tool: 'connector-post', cost: 2 },
};

// Acceptance dimensions per desk, the panel gate votes on these.
export const DIMENSIONS = {
  mobile: ['Core flow works', 'Touch targets', 'Consistent navigation'],
  brief: ['Attribution', 'Completeness', 'Freshness'],
  deck: ['One idea per slide', 'Evidence under assertion', 'Narrative arc'],
  site: ['Promise → proof → action', 'Accessibility AA', 'Responsive'],
  analysis: ['Honest chart forms', 'Caveats attached', 'Segment coverage'],
};

// Plan steps that are skills (cite-guard, steelman, deck-doctor, copy-cutter,
// a11y-audit, chart-smith …) only appear when that skill is on the desk, so
// installing a skill genuinely changes every future ticket.
const SKILL_TOOLS = new Set(SKILLS.map((s) => s.id));

// Why each step is on the ticket, house-written, deterministic, honest.
// Shown on the ticket and carried in provenance so a reader can see the
// reasoning behind the estimate, not just the number.
export const RATIONALE = {
  scope: 'Fixes the question first so every later step, and the estimate, means something.',
  search: 'Retrieves real, dated sources; nothing downstream may cite what was not retrieved.',
  'cite-guard': 'Grades every claim and refuses ungraded ones, the brief cannot ship an unsourced sentence.',
  steelman: 'Builds the strongest case against the recommendation so the dissent is real, not decorative.',
  storyboard: 'Orders the beats before any slide is written; tension is decided here, not in the copy.',
  compose: 'Writes the deliverable from graded material. Live lead models author it on your own key.',
  'deck-doctor': 'Splits or cuts any slide carrying more than one idea.',
  'copy-cutter': 'Reduces copy to promise → proof → action; refuses filler.',
  build: 'Produces the working deliverable, semantic, responsive, and owns its structural assertions.',
  'a11y-audit': 'Contrast, focus order and touch targets checked against the real output.',
  ingest: 'Loads and profiles the data before any conclusion is drawn.',
  analyze: 'Tests the obvious explanation against the alternative and isolates what moves opposite.',
  'chart-smith': 'Chooses honest chart forms and draws the finding on the chart itself.',
  'connector-post': 'Delivers outside the workspace, always behind an approval checkpoint.',
  design: 'Decides layout, hierarchy and states before any pixel; a draft, not a promise of final styling.',
  council: 'Every model states a position; advisers challenge; dissent is recorded and survives into the artifact.',
};
function contractWhy({ desk, depth, variant, plan, seatsAll, removedSkills, connectors }) {
  const bits = [`${desk.name}: ${plan.length} steps, ordered by dependency so independent steps run in parallel.`];
  if (desk.id === 'brief') bits.push(depth === 'fast' ? 'Fast research keeps scope → sweep → compose only; grading and steelman steps are dropped and the brief says so.' : 'Deep research keeps the full grading and steelman steps.');
  if (variant === 'design') bits.push('Design mode produces an annotated draft instead of a build, so the accessibility audit does not apply.');
  if (removedSkills.length) bits.push(`Skill steps not on the desk were removed (${removedSkills.join(', ')}); their dependents re-pointed so the graph stays connected.`);
  if (connectors.length) bits.push(`Connected apps add an external delivery step each (${connectors.join(', ')}), gated by approval.`);
  const live = seatsAll.filter((x) => x.live).length;
  bits.push(live ? `${live} of ${seatsAll.length} panel models are live on your own keys and priced at 0 house credits; the rest share the panel cost.` : `All ${seatsAll.length} panel models are house models and share the panel cost.`);
  bits.push('The ceiling is the estimate plus 25%; nothing beyond it is spent without a decision.');
  return bits.join(' ');
}

// What a ticket will ask of the owner's key, said before it is stamped:
// house credits are on the contract already; this is the other bill.
// Computed when asked, against the keys held now, so it is never stale.
export function keyPlanFor(m) {
  const held = { image: ['openai', 'google'].find((id) => store.keyFor(id)) || null, speech: ['openai', 'google'].find((id) => store.keyFor(id)) || null };
  const bench = [m.lead, ...(m.advisers || [])].map((id) => modelById(id)).filter(Boolean);
  const live = bench.filter((x) => store.keyFor(x.provider));
  const mediaOn = !!ws().tools?.media;
  // A deck draws every slide in one look, the one sentence and the close included.
  const images = m.desk === 'deck' ? 9 : m.desk === 'site' || m.desk === 'mobile' ? 1 : 0;
  const speech = m.desk === 'deck' ? 9 : 0;
  return {
    authoring: live.length ? { calls: 1 + Math.max(0, live.length - 1), models: live.map((x) => x.name) } : null,
    images: images ? { count: images, size: m.desk === 'site' ? '1024×1536' : m.desk === 'mobile' ? '1024×1024' : '1536×1024', on: held.image && mediaOn ? PROVIDER_LABEL[held.image] : null } : null,
    speech: speech ? { clips: speech, on: held.speech && mediaOn ? PROVIDER_LABEL[held.speech] : null, voice: ws().voice || null } : null,
    mediaOff: (images || speech) ? !mediaOn : false,
  };
}

export function writeContract({ goal, deskId, lead, advisers, installedSkills, queuedConnectors, lineage, variant, template, depth, chatId, attachments, pages, by, asker }) {
  const desk = deskById(deskId);
  const subject = subjectOf(goal);
  const installed = installedSkills ? new Set(installedSkills) : null;
  const seatsAll = [lead, ...advisers.filter((a) => a !== lead)];

  let raw = PLANS[desk.id](subject.length > 52 ? subject.slice(0, 49) + '…' : subject);
  // Fast research keeps only scope → sweep → compose; deep keeps the full plan.
  if (desk.id === 'brief' && depth === 'fast') raw = raw.filter((p) => ['scope', 'search', 'compose'].includes(p.tool)).map((p) => (p.tool === 'compose' ? { ...p, dependsOn: ['s2'], title: 'Compose the fast brief' } : p));
  // Design mode produces a design draft instead of a build.
  if (variant === 'design' && ['site', 'mobile'].includes(desk.id)) raw = raw.map((p) => (p.tool === 'build' ? { ...p, title: p.title.replace(/^Build the page.*$|^Build the tappable prototype.*$/, 'Draft the design, layout, hierarchy, states'), tool: 'design' } : p)).filter((p) => p.tool !== 'a11y-audit');
  // Skill steps only exist when the skill is on the desk; dependents re-point
  // to the removed step's own dependencies so the graph stays connected.
  const removed = new Set(raw.filter((p) => installed && SKILL_TOOLS.has(p.tool) && !installed.has(p.tool)).map((p) => p.id));
  const byId = Object.fromEntries(raw.map((p) => [p.id, p]));
  const resolveDeps = (ids) => ids.flatMap((d) => (removed.has(d) ? resolveDeps(byId[d].dependsOn) : [d]));
  raw = raw.filter((p) => !removed.has(p.id)).map((p) => ({ ...p, dependsOn: [...new Set(resolveDeps(p.dependsOn))] }));

  // Per-seat pricing on the panel step: house models share the cost; a BYOK
  // seat bills your own key, so it costs the house nothing.
  raw = raw.map((p) => {
    if (p.tool !== 'council') return p;
    const per = Math.round((p.cost / seatsAll.length) * 10) / 10;
    const seats = seatsAll.map((id) => ({ id, name: modelById(id).name, live: !!liveSeat(id), cost: liveSeat(id) ? 0 : per }));
    return { ...p, seats, housePer: per, cost: Math.round(seats.reduce((a, x) => a + x.cost, 0) * 10) / 10 };
  });

  // Queued connectors append an external delivery step after the last step.
  const last = raw[raw.length - 1];
  for (const cid of queuedConnectors || []) {
    const spec = CONNECTOR_STEPS[cid];
    if (!spec) continue;
    // Ids must not collide with kept steps of a trimmed plan (fast research keeps s1, s2, s6).
    const nextId = `s${Math.max(0, ...raw.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0)) + 1}`;
    raw.push({ id: nextId, ...spec, access: 'external', requiresConfirmation: true, connector: cid, dependsOn: [last.id] });
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

  const plan = raw.map((p, i) => ({ status: 'QUEUED', contextHash: hash(`${desk.id}:${i}:${p.tool}:${goal}`), rationale: RATIONALE[p.tool] || 'House step.', ...p }));
  const seatsPriced = (plan.find((p) => p.tool === 'council') || {}).seats || seatsAll.map((id) => ({ id, live: !!liveSeat(id) }));
  const why = contractWhy({ desk, depth, variant, plan, seatsAll: seatsPriced, removedSkills: [...removed].map((id) => byId[id]?.tool).filter(Boolean), connectors: [...(queuedConnectors || [])] });
  const estimate = Math.round(plan.reduce((a, p) => a + p.cost, 0) * 10) / 10;
  const room = ceilingFor(estimate, { desk: desk.id, depth: depth || 'deep', variant: variant || 'build' });
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
      plan, estimate, ceiling: room.ceiling, ceilingFrom: room, dimensions: DIMENSIONS[desk.id], assertions, why,
      access: { read: plan.filter((p) => p.access === 'read').length, write: plan.filter((p) => p.access === 'write').length, external: plan.filter((p) => p.access === 'external').length },
    },
    // Who asked for this. A house several people can enter should say whose
    // request each ticket is, and it travels with the artifact.
    writtenBy: by ? { name: by, at: Date.now() } : null,
    // Who asked, by their signed cookie, so what they told the house to
    // remember reaches the author of this delivery and nobody else's.
    askerId: asker || null,
    // A thin ask makes a thin contract; the ticket says so rather than
    // pretending the plan and the price mean more than the goal does.
    thin: (() => { const c = clarify(goal, desk.id); return c.thin ? { why: c.why, questions: c.questions } : null; })(),
    lineage: lineage || null, // { parentId, parentSerial, version }
    variant: variant || 'build',
    template: template || null,
    depth: depth || 'deep',
    chatId: chatId || null,
    // Owner-supplied sources: text attachments are on the table from the
    // start, citable, and their figures count as sourced.
    attachments: [...(attachments || []).map((d) => ({ name: d.name, chars: d.text.length })), ...(pages || []).map((p) => ({ name: p.title, chars: (p.text || '').length, url: p.url, words: p.words, page: true }))],
    // Owner data: the first CSV attached to an analysis mission is the data the charts plot.
    data: ['analysis', 'brief'].includes(desk.id) ? ((attachments || []).filter((d) => looksLikeCsv(d.name, d.text)).map((d) => profileCsv(d.name, d.text)).find(Boolean) || null) : null,
    sources: [...(attachments || []).map((d) => ({ title: d.name, url: null, kind: 'owner', engine: 'attachment', retrieved: new Date().toISOString().slice(0, 10), extract: d.text.replace(/\s+/g, ' ').trim().slice(0, 4000) })), ...(pages || []).map((p) => ({ title: p.title, url: p.url, kind: 'page', engine: 'page', retrieved: p.retrieved, words: p.words, extract: (p.text || p.extract || '').replace(/[^\S\n]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 4000) }))].map((s, i) => ({ ...s, id: `src-${i + 1}` })),
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

// The plain-words narrative, written from the tape when a run ends. It is
// stored on the mission and, when the mission came from a chat, dropped into
// that thread so the thread tells the whole story.
function tellTheStory(m) {
  try {
    m.narrative = narrateRun(m);
    store.flushMissions();
    if (m.chatId) addMessage(m.chatId, { role: 'assistant', text: m.narrative, missionId: m.id, kind: 'narrative' });
  } catch (e) { console.error('prajna: narrative failed', e); }
}

/* ------------------------------ PLAN EDITING ------------------------------ */

// The owner edits the ticket before stamping it: trim, reorder, retitle or
// add steps. The contract is recomputed, estimate, ceiling, access counts,
// assertion ownership, and the edit is recorded on the contract itself.
export const PLAN_TOOLS = () => [...Object.keys(TOOL_LINES), 'council'];
const DEFAULT_COST = { scope: 6, search: 14, 'cite-guard': 8, steelman: 8, storyboard: 8, compose: 12, 'deck-doctor': 6, 'copy-cutter': 7, build: 16, 'a11y-audit': 6, ingest: 8, analyze: 12, 'chart-smith': 8, 'connector-post': 6, design: 12, council: 12 };
export function editPlan(missionId, steps) {
  const m = store.mission(missionId);
  if (!m) throw new Error('Mission not found.');
  if (m.status !== 'OPEN') throw new Error('Only an unstamped ticket can be edited.');
  if (!Array.isArray(steps) || !steps.length) throw new Error('A plan needs at least one step.');
  if (steps.length > 12) throw new Error('At most twelve steps on a ticket.');
  const tools = new Set(PLAN_TOOLS());
  const old = Object.fromEntries(m.contract.plan.map((p) => [p.id, p]));
  const ids = [];
  const plan = steps.map((s, i) => {
    const prev = s.id && old[s.id] ? old[s.id] : null;
    const tool = String(s.tool || prev?.tool || 'compose');
    if (!tools.has(tool)) throw new Error(`Unknown tool "${tool}".`);
    const title = String(s.title || prev?.title || '').trim().slice(0, 120);
    if (!title) throw new Error(`Step ${i + 1} needs a title.`);
    const access = ['read', 'write', 'external'].includes(s.access) ? s.access : prev?.access || (tool === 'build' || tool === 'compose' || tool === 'design' ? 'write' : 'read');
    const id = prev ? prev.id : `n${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
    const dependsOn = [...new Set((Array.isArray(s.dependsOn) ? s.dependsOn : prev?.dependsOn || []).filter((d) => ids.includes(d)))];
    if (!dependsOn.length && i > 0 && !Array.isArray(s.dependsOn)) dependsOn.push(ids[i - 1]);
    ids.push(id);
    const cost = prev ? prev.cost : Math.min(40, Math.max(1, Number(s.cost) || DEFAULT_COST[tool] || 8));
    return { ...(prev || {}), id, title, tool, access, cost, dependsOn, status: 'QUEUED', rationale: prev?.tool === tool && prev?.rationale ? prev.rationale : (RATIONALE[tool] || 'Owner-added step.'), requiresConfirmation: access === 'external' || !!prev?.requiresConfirmation, contextHash: hash(`${m.desk}:${i}:${tool}:${m.goal}`) };
  });
  // Assertion ownership follows the tool that produces each promise.
  const fallbackOwner = plan.find((p) => ['compose', 'build', 'design'].includes(p.tool)) || plan[plan.length - 1];
  const catalog = ASSERTIONS[m.variant === 'design' ? 'design' : m.desk] || [];
  const assertions = catalog.map((a) => ({ id: a.id, title: a.title, owner: (plan.find((p) => p.tool === a.owner) || fallbackOwner).id, status: 'PENDING' }));
  for (const p of plan) p.targets = assertions.filter((a) => a.owner === p.id).map((a) => a.id);
  const estimate = Math.round(plan.reduce((a, p) => a + p.cost, 0) * 10) / 10;
  const room = ceilingFor(estimate, { desk: m.desk, depth: m.depth, variant: m.variant });
  const before = m.contract.plan.map((p) => p.id);
  m.contract = {
    ...m.contract, plan, assertions, estimate, ceiling: room.ceiling, ceilingFrom: room,
    access: { read: plan.filter((p) => p.access === 'read').length, write: plan.filter((p) => p.access === 'write').length, external: plan.filter((p) => p.access === 'external').length },
    edited: { at: Date.now(), edits: ((m.contract.edited && m.contract.edited.edits) || 0) + 1, added: plan.filter((p) => !before.includes(p.id)).length, removed: before.filter((id) => !ids.includes(id)).length, steps: plan.length },
  };
  store.flushMissions();
  return m;
}

/* ------------------------------ COUNCIL SCRIPT ---------------------------- */

const VOICES = {
  opus: (s) => `Lead the ${s} with the strongest single claim and let everything else defend it. The risk isn't being wrong, it's being vague enough that nobody can tell.`,
  sonnet: (s) => `Keep the scope honest: answer exactly what was asked about ${s}, flag what we couldn't verify, ship on time. Completeness is a trap here.`,
  gpt: (s) => `Comparable cases suggest a standard structure works for ${s}, but two of the usual assumptions don't transfer. I'd break convention on those and follow it elsewhere.`,
  gemini: (s) => `The retrieval set on ${s} skews recent. I weighted older primary sources back in; the picture changes at the margin, not the core.`,
  deepseek: (s) => `Disagree with the emerging consensus on ${s}. The majority read leans on an analogy that hasn't been tested. I want the counter-case in the final artifact, not a footnote.`,
  llama: (s) => `Baseline check on ${s}: a straightforward reading gets 80% of the way. Whatever we add beyond that must earn its place or it's decoration.`,
};

const CHALLENGES = [
  { from: 'deepseek', text: 'Your strongest claim rests on the weakest source class. Either upgrade the evidence or downgrade the claim.' },
  { from: 'gpt', text: 'Accepting the dissent on timing, tightening the recommendation from “when ready” to a dated window.' },
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
          ? `Cannot verify ${d.toLowerCase()} from the material examined, counts as a fail, never a benefit-of-the-doubt pass.`
          : 'Checked against the draft; holds.',
      });
    }
  }
  const lead = modelById(mission.lead);
  const skepticName = modelById(skeptic).name;
  let t = baseT;
  const ev = [];
  ev.push({ t: (t += 1600), type: 'council.gate', stepId, rows, cleared: false, note: `${skepticName} returns UNVERIFIABLE on ${failDim}, the gate does not clear.` });
  ev.push({ t: (t += 1900), type: 'council.patch', stepId, model: lead.name, symbol: lead.symbol, text: `Patch: an explicit ${failDim.toLowerCase()} caveat is written into the artifact itself, with the unverified span marked. Re-vote requested.` });
  ev.push({ t: (t += 1500), type: 'council.revote', stepId, member: skepticName, dimension: failDim, verdict: 'pass', rationale: 'Caveat makes the limit visible in the deliverable; passes with the mark carried.' });
  ev.push({ t: (t += 700), type: 'council.gate', stepId, rows: rows.map((r) => (r.verdict === 'unverifiable' ? { ...r, verdict: 'pass', rationale: 'Passes after patch, caveat carried into the artifact.' } : r)), cleared: true, note: 'All models pass all dimensions. Gate cleared with the patch on the record.' });
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

const PROVIDER_LABEL = { openai: 'OpenAI', google: 'Google' };
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
  analyze: [['decompose', 'topline split by segment and cohort'], ['test', 'mix-shift hypothesis vs performance: mix shift wins'], ['residual', 'one segment moves opposite, isolated']],
  'chart-smith': [['form', 'line + segment bars chosen · dual axis refused'], ['annotate', 'the finding is drawn on the chart, not beside it']],
  'connector-post': [['compose', 'delivery summary drafted with the artifact link']],
  design: [['layout', 'grid, hierarchy and spacing decided before any pixel'], ['states', 'empty, loading, error and success states drawn'], ['annotate', 'every region labeled with its intent']],
};

// The amnesiac terminal review: by construction sees only (goal, artifact).
// Scripted: the site desk surfaces a real GAP and raises an attention item.
// The amnesiac terminal review: by construction sees only the goal and the
// artifact itself, never mission state. It judges what shipped.
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
    return { verdict: 'gaps', gaps: [{ id: 'GAP-002', severity: 'major', description: 'The brief carries no recorded dissent, the panel disagreement was erased from the deliverable.' }] };
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
      if (byokSeats) script.push({ t: t - 300, type: 'log', stepId: step.id, label: 'byok', detail: `${byokSeats} live model(s) billed to your own keys, priced at 0 house credits on the ticket` });
    }
    if (overrun && step.id === overrunStep) {
      jitter = Math.max(jitter, Math.round((mission.contract.ceiling * 1.08 - projected) * 10) / 10);
      script.push({ t: t - 400, type: 'log', stepId: step.id, label: 'retry', detail: 'two model retries burned on a malformed draft, cost running hot' });
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
  ledger('settle', -m.settlement.settled, `${m.serial} settled ${m.settlement.settled} cr against a ${m.settlement.reserved} cr reserve; ${m.settlement.released} cr released`, { missionId: m.id, serial: m.serial, released: m.settlement.released });
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
        prompt: `Step “${step.title}” acts outside the workspace (${step.access}).${step.tool === 'connector-post' ? ' Approving publishes the artifact at a public link (revocable from the artifact bar) so the delivery can point at it.' : ''} Approve it, or skip it and close the mission without it?`,
        options: ['approve-step', 'skip-step'],
      });
      store.flushMissions();
      return 'pause';
    }
  }

  if (ev.type === 'log' && ev.connector) {
    // A connected app puts what it knows about the goal on the sources table.
    try {
      const { sources, note } = await gather(ev.connector, m.goal);
      const owned = (m.sources || []).filter((s) => s.engine === 'attachment');
      const rest = (m.sources || []).filter((s) => s.engine !== 'attachment');
      m.sources = [...owned, ...rest, ...sources].map((s, i) => ({ ...s, id: `src-${i + 1}` }));
      record.detail = `${note} · live`;
      record.live = true;
      record.count = sources.length;
    } catch (e) {
      record.detail = `${ev.connector}: live read failed (${String(e.message || e).slice(0, 140)}), recorded, not hidden`;
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
        countUsage(m, live.model.name);
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

  // Real retrieval: the research desk's sweep step fetches real, linked,
  // dated sources. Recorded whether or not anyone cites them.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && step.tool === 'narrate' && !m.narration) {
      pushEvent(m, record, notify);
      m.narration = [];
      const prov = ['openai', 'google'].find((id) => store.keyFor(id));
      const k = prov ? store.keyFor(prov) : null;
      let slides = deckSlides(m).map((sl, i) => ({ i, text: String(sl.notes || '').replace(/<[^>]+>/g, '').trim() })).filter((x) => x.text);
      // Unchanged notes keep the parent's clip.
      const parentN = m.lineage?.parentId ? store.missionFull(m.lineage.parentId) : null;
      if (parentN && Array.isArray(parentN.narration) && parentN.narration.length) {
        const pn = new Map(deckSlides(parentN).map((sl, i) => [i, String(sl.notes || '').replace(/<[^>]+>/g, '').trim()]));
        const kept = [];
        slides = slides.filter(({ i, text }) => {
          const pc = parentN.narration.find((n) => n.slide === i);
          if (!pc || pn.get(i) !== text) return true;
          m.narration.push({ ...pc, reused: parentN.serial }); kept.push(i + 1); return false;
        });
        if (kept.length) pushEvent(m, { type: 'log', stepId: step.id, label: 'narrate', live: false, detail: `${kept.length} clip(s) kept from ${parentN.serial}, notes on slides ${kept.join(', ')} unchanged; nothing billed for them` }, notify);
        if (!slides.length) { pushEvent(m, { type: 'log', stepId: step.id, label: 'narrate', live: false, detail: `every slide kept its clip from ${parentN.serial}; nothing was spoken` }, notify); return 'ok'; }
      }
      if (!k) {
        pushEvent(m, { type: 'log', stepId: step.id, label: 'narrate', live: false, detail: `no speech key in memory (OpenAI or Google), so the film will read the notes with the browser's own voice; a video exported that way carries no narration. Load a key under Your keys and re-run for a spoken track` }, notify);
        return 'ok';
      }
      if (!ws().tools?.media) {
        pushEvent(m, { type: 'log', stepId: step.id, label: 'narrate', live: false, detail: 'Media Generation is switched off under Tools, so the film will read the notes with the browser\'s own voice' }, notify);
        return 'ok';
      }
      const mediaDir = path.join(DATA_DIR, 'media'); fs.mkdirSync(mediaDir, { recursive: true });
      const voice = String(ws().voice || '').trim() || null;
      const capped = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no audio within ${ms / 1000}s`)), ms))]);
      const queue = slides.slice(); const results = [];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) {
          const job = queue.shift(); const started = Date.now();
          try { results.push({ ...job, started, out: await capped(synthesizeSpeech({ provider: prov, key: k.key, baseUrl: k.baseUrl, text: job.text, voice }), 90000) }); }
          catch (e) { results.push({ ...job, started, error: e }); }
        }
      }));
      results.sort((x, y) => x.i - y.i);
      let made = 0; const failed = [];
      for (const { i, text, started, out, error } of results) {
        if (error) { failed.push(`slide ${i + 1} (${String(error.message || error).slice(0, 80)})`); continue; }
        const id = crypto.randomBytes(8).toString('hex');
        fs.writeFileSync(path.join(mediaDir, `${id}.wav`), out.bytes);
        const seconds = Math.max(0, Math.round(((out.bytes.length - 44) / (24000 * 2)) * 10) / 10);
        const rec = { id, ext: 'wav', mime: out.mime, prompt: text.slice(0, 200), provider: prov, model: out.model, bytes: out.bytes.length, ms: Date.now() - started, createdAt: Date.now(), missionId: m.id, slide: i, kind: 'narration' };
        ws().media.unshift(rec); ws().media = ws().media.slice(0, 400); flushWs();
        m.narration.push({ slide: i, id, file: `${id}.wav`, chars: text.length, seconds, model: out.model, voice: out.voice, ms: rec.ms });
        if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1;
        const at = (m.keyUse.models[out.model] = m.keyUse.models[out.model] || { calls: 0, prompt: 0, completion: 0 }); at.calls += 1;
        made += 1;
      }
      pushEvent(m, { type: 'log', stepId: step.id, label: 'narrate', live: made > 0, detail: `${made} of ${slides.length} slides spoken by ${results.find((r) => r.out)?.out.model || PROVIDER_LABEL[prov] || prov}${results.find((r) => r.out) ? ` in the voice “${results.find((r) => r.out).out.voice}”` : ''}, ${m.narration.reduce((a, n) => a + n.seconds, 0).toFixed(0)}s of narration · billed to your key${failed.length ? `; ${failed.length} not spoken: ${failed.join(', ')}` : ''}` }, notify);
      return 'ok';
    }
    if (step && step.tool === 'illustrate' && !m.visuals) {
      pushEvent(m, record, notify);
      m.visuals = [];
      // A deck's pictures are all made the same way: the look names the
      // medium, the light and the palette once, and every slide's prompt
      // starts from it, so nine pictures read as one film, not nine stock
      // photographs. The look goes on the record and on the tape.
      const look = m.desk === 'deck' ? deckLook(m) : null;
      if (look) { m.look = look; pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: `one look for every slide, chosen by ${look.by}: ${look.mood}; ${look.type} display type, ${look.paper} paper, ${look.acc} accent` }, notify); }
      const prov = ['openai', 'google'].find((id) => store.keyFor(id));
      const k = prov ? store.keyFor(prov) : null;
      // A deck wants the title and every argument; a landing page wants one
      // hero, drawn from the brand, the headline and the line under it.
      const wantedFor = (x) => (x.desk === 'site'
        ? [{ i: 0, sl: { k: 'hero', h: `${String(x.authored?.content?.brand || '').trim()} ${String(x.authored?.content?.headline || subjectOf(x.goal)).trim()}`.trim(), s: String(x.authored?.content?.sub || x.goal).trim() } }]
        : x.desk === 'mobile'
          ? [{ i: 0, sl: { k: 'icon', h: `an app icon for “${String(x.authored?.content?.short || subjectOf(x.goal)).trim()}”`, s: String(x.authored?.content?.screens?.[0]?.body || x.goal).trim() } }]
          : deckSlides(x).map((sl, i) => ({ sl, i })));
      let wanted = wantedFor(m);
      // An amended version keeps the parent's picture for every slide whose
      // words did not change: the same words would buy the same picture, and
      // the tape says which were kept rather than bought again.
      const parent = m.lineage?.parentId ? store.missionFull(m.lineage.parentId) : null;
      if (parent && Array.isArray(parent.visuals) && parent.visuals.length) {
        const pw = new Map(wantedFor(parent).map((w) => [w.i, w.sl]));
        const kept = [];
        wanted = wanted.filter(({ sl, i }) => {
          const pv = parent.visuals.find((v) => v.slide === i); const ps = pw.get(i);
          if (!pv || !ps || String(ps.h) !== String(sl.h) || String(ps.s) !== String(sl.s)) return true;
          m.visuals.push({ ...pv, reused: parent.serial }); kept.push(i + 1); return false;
        });
        if (kept.length) pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: `${kept.length} picture(s) kept from ${parent.serial}, slides ${kept.join(', ')} unchanged; nothing billed for them` }, notify);
        if (!wanted.length) { pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: `every slide kept its picture from ${parent.serial}; nothing was drawn` }, notify); return 'ok'; }
      }
      if (!k) {
        pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: `no image key in memory (OpenAI or Google), so the house draws its own ${wanted.length} visuals; load a key under Your keys and re-run for generated images` }, notify);
        return 'ok';
      }
      if (!ws().tools?.media) {
        pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: 'Media Generation is switched off under Tools, so the house draws its own visuals' }, notify);
        return 'ok';
      }
      const mediaDir = path.join(DATA_DIR, 'media'); fs.mkdirSync(mediaDir, { recursive: true });
      const style = m.desk === 'mobile'
        ? 'Flat app icon, one bold centred symbol, two or three solid colours, no text, no letters, no numbers, no border, filling the square edge to edge'
        : m.desk === 'site'
        ? 'Product photograph for a landing page hero, natural light, clean background, the product or its setting in use, no text, no logos, no watermarks, tall 4:5 composition'
        : `${look.image}. Mood: ${look.mood}. Clean plate: no text, no logos, no letters, no watermarks. Wide 3:2 composition with the left third quiet and dark enough for a headline`;
      let made = 0; const failed = [];
      // Three at a time, ninety seconds each at most: a slow or stalled
      // provider costs the deck a minute and a half, never seven of them.
      const capped = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no picture within ${ms / 1000}s`)), ms))]);
      const queue = wanted.slice(); const results = [];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) {
          const job = queue.shift(); const started = Date.now();
          const prompt = `${style}. Subject: ${String(job.sl.h).replace(/<[^>]+>/g, '')}. Context: ${String(job.sl.s).replace(/<[^>]+>/g, '').slice(0, 300)}`;
          try { results.push({ ...job, prompt, started, out: await capped(generateImage({ provider: prov, key: k.key, baseUrl: k.baseUrl, prompt, size: m.desk === 'site' ? '1024x1536' : m.desk === 'mobile' ? '1024x1024' : '1536x1024' }), 90000) }); }
          catch (e) { results.push({ ...job, prompt, started, error: e }); }
        }
      }));
      results.sort((x, y) => x.i - y.i);
      for (const { sl, i, prompt, started, out, error } of results) {
        try {
          if (error) throw error;
          const id = crypto.randomBytes(8).toString('hex');
          const ext = out.mime.includes('jpeg') ? 'jpg' : out.mime.includes('webp') ? 'webp' : 'png';
          fs.writeFileSync(path.join(mediaDir, `${id}.${ext}`), out.bytes);
          const rec = { id, ext, mime: out.mime, prompt, provider: prov, model: out.model, bytes: out.bytes.length, ms: Date.now() - started, createdAt: Date.now(), missionId: m.id, slide: i };
          ws().media.unshift(rec); ws().media = ws().media.slice(0, 400); flushWs();
          m.visuals.push({ slide: i, file: `${id}.${ext}`, id, prompt, model: out.model, ms: rec.ms });
          if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1;
          const at = (m.keyUse.models[out.model] = m.keyUse.models[out.model] || { calls: 0, prompt: 0, completion: 0 }); at.calls += 1;
          made += 1;
          pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: true, detail: `slide ${i + 1}: ${out.model} drew “${String(sl.h).replace(/<[^>]+>/g, '').slice(0, 60)}” (${Math.round(out.bytes.length / 1024)} KB in ${(rec.ms / 1000).toFixed(1)}s) · billed to your key` }, notify);
        } catch (e) {
          failed.push(`slide ${i + 1} (${String(e.message || e).slice(0, 80)})`);
          pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: false, detail: `slide ${i + 1}: ${PROVIDER_LABEL[prov] || prov} refused (${String(e.message || e).slice(0, 100)}), the house draws that one itself` }, notify);
        }
      }
      pushEvent(m, { type: 'log', stepId: step.id, label: 'illustrate', live: made > 0, detail: `${made} of ${wanted.length} slides illustrated on your ${PROVIDER_LABEL[prov] || prov} key${failed.length ? `; the house drew ${failed.length}: ${failed.join(', ')}` : ''}` }, notify);
      return 'ok';
    }
    if (step && step.tool === 'search' && !m.retrieval) {
      pushEvent(m, record, notify);
      // The Browser tool: pages the ticket names are read first and kept as owned sources.
      let pages = [];
      if (ws().tools?.browser && !(m.sources || []).some((s) => s.engine === 'page')) {
        const urls = urlsIn(m.goal);
        if (urls.length) {
          const results = await readPages(urls);
          pages = results.filter((r) => !r.error);
          const failed = results.filter((r) => r.error);
          pushEvent(m, { type: 'log', stepId: step.id, label: 'read', live: pages.length > 0, detail: `${pages.length} page(s) read${pages.length ? `: ${pages.map((p) => `${p.title} (${p.words} words)`).join('; ')}` : ''}${failed.length ? `; ${failed.length} not read: ${failed.map((f) => `${f.url} (${f.error})`).join('; ')}` : ''}` }, notify);
        }
      }
      try {
        const started = Date.now();
        const { query, sources, engines } = await retrieve(m.goal);
        m.retrieval = { ok: true, query, count: sources.length, engines, ms: Date.now() - started, at: Date.now() };
        const owned = [...(m.sources || []).filter((s) => s.engine === 'attachment' || s.engine === 'connector' || s.engine === 'page'), ...pages];
        m.sources = [...owned, ...sources].map((s, i) => ({ ...s, id: `src-${i + 1}` }));
        // The ground changed: a plan that grades and steelmans sources cannot
        // do either with none. The house says so and offers the cheaper path
        // rather than charging for steps with nothing to work on.
        if (!(m.sources || []).length) {
          const started = m.contract.plan.findIndex((p) => p.id === step.id);
          const dead = m.contract.plan.filter((p, i) => i > started && ['cite-guard', 'steelman'].includes(p.tool));
          if (dead.length) {
            const save = Math.round(dead.reduce((a, p) => a + p.cost, 0) * 10) / 10;
            raiseAttention(m, notify, {
              kind: 'ground', stepId: step.id, dead: dead.map((p) => p.id),
              prompt: `The sweep found no sources, and ${dead.length} step${dead.length === 1 ? '' : 's'} on this ticket exist only to work on them: ${dead.map((p) => `“${p.title}”`).join(', ')}, ${save} cr of the plan. Write an amended ticket without them, or run the plan as you stamped it?`,
              options: ['amend-ticket', 'continue-as-stamped'],
            });
            pushEvent(m, { type: 'log', stepId: step.id, label: 'retrieve', live: true, detail: `Nothing was retrieved for “${query}”; the plan is now larger than the evidence. Brought to you before more is spent.` }, notify);
            return 'pause';
          }
        }
        pushEvent(m, { type: 'log', stepId: step.id, label: 'retrieve', live: true, detail: sources.length ? `${sources.length} real sources retrieved for “${query}” in ${(m.retrieval.ms / 1000).toFixed(1)}s via ${Object.entries(engines).map(([k, e]) => `${k} ${e.ok ? e.count : 'failed'}`).join(' + ')}: ${sources.map((s) => s.title).join(' · ')}` : `no sources found for “${query}”, the brief will say so` }, notify);
      } catch (e) {
        m.retrieval = { ok: false, error: String(e.message || e).slice(0, 160), at: Date.now() };
        m.sources = [...(m.sources || []).filter((s) => s.engine === 'attachment' || s.engine === 'connector' || s.engine === 'page'), ...pages].map((s, i) => ({ ...s, id: `src-${i + 1}` }));
        pushEvent(m, { type: 'log', stepId: step.id, label: 'retrieve', live: false, detail: `retrieval failed (${m.retrieval.error}), recorded; the brief carries no retrieved reading` }, notify);
      }
      return 'ok';
    }
  }

  // Delivery through a connected app, after the approval checkpoint: a real
  // post, page, draft or issue with its id on the tape.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && step.tool === 'connector-post' && step.connector && !(m.deliveries || []).some((d) => d.stepId === step.id)) {
      pushEvent(m, record, notify);
      if (!m.artifactId) { const a = makeArtifact(m, notify); pushEvent(m, { type: 'artifact.ready', ...a, early: true, note: 'Artifact produced ahead of delivery so the delivery can point at it; validation still follows.' }, notify); }
      const art = store.artifact(m.artifactId);
      if (art && !art.shareToken) store.refreshArtifact(art.id, { shareToken: crypto.randomBytes(16).toString('hex'), sharedAt: Date.now(), sharedBy: 'delivery' }, store.artifactHtml(art.id));
      const token = store.artifact(m.artifactId)?.shareToken;
      const origin = (process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '');
      const link = `${origin}/s/${token}`;
      let linkOk = null;
      if (origin) { try { const r = await fetch(link, { method: 'GET' }); linkOk = r.ok; } catch { linkOk = false; } }
      let rec;
      try {
        const r = await deliver(step.connector, m, link);
        rec = { stepId: step.id, connector: step.connector, ok: true, id: r.id, url: r.url, where: r.where, link, linkOk, at: Date.now() };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'deliver', live: true, detail: `${r.where}: delivered${r.id ? ` (${r.id})` : ''}${r.url ? ` ${r.url}` : ''} · points at ${link}${linkOk === true ? ' (link checked)' : linkOk === false ? ' (LINK DID NOT RESOLVE, recorded)' : ' (no public host set, link not checked)'}` }, notify);
      } catch (e) {
        rec = { stepId: step.id, connector: step.connector, ok: false, error: String(e.message || e).slice(0, 200), at: Date.now() };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'deliver', live: false, detail: `${step.connector}: delivery failed (${rec.error}), recorded, not hidden` }, notify);
      }
      m.deliveries = [...(m.deliveries || []), rec];
      return 'ok';
    }
  }

  // Code interpreter plugin: real computation over the owner's data at the
  // analyze step; the facts go on the tape, into the author's prompt and the
  // artifact's caveats.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && step.tool === 'analyze' && !m.computed && (ws().plugins || []).includes('code-interpreter')) {
      pushEvent(m, record, notify);
      if (m.data && m.data.series) {
        const pts = m.data.series.points; const v = pts.map((p) => p.value);
        const first = v[0], last = v.at(-1);
        const growth = first ? Math.round(((last - first) / Math.abs(first)) * 1000) / 10 : null;
        const peak = pts.reduce((a, p) => (p.value > a.value ? p : a), pts[0]); const trough = pts.reduce((a, p) => (p.value < a.value ? p : a), pts[0]);
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
        const top = m.data.segments?.items?.[0]; const total = (m.data.segments?.items || []).reduce((a, s) => a + s.value, 0);
        m.computed = { growthPct: growth, peak: peak ? `${peak.label || ''} ${peak.value}`.trim() : null, trough: trough ? `${trough.label || ''} ${trough.value}`.trim() : null, mean: Math.round(mean * 100) / 100, sd: Math.round(sd * 100) / 100, topSegment: top ? `${top.name} ${Math.round((top.value / (total || 1)) * 1000) / 10}%` : null, n: v.length };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'compute', live: true, detail: `code interpreter: ${m.computed.n} points of ${m.data.series.column}; change first to last ${growth == null ? 'n/a' : `${growth > 0 ? '+' : ''}${growth}%`}; peak ${m.computed.peak}; trough ${m.computed.trough}; mean ${m.computed.mean}, sd ${m.computed.sd}${top ? `; top segment ${m.computed.topSegment}` : ''}` }, notify);
      } else {
        m.computed = { none: true };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'compute', live: false, detail: 'code interpreter: no CSV attached, nothing to compute; the sample series is not computed over' }, notify);
      }
      return 'ok';
    }
  }

  // Ingest: the analysis desk says what data it is working from.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && step.tool === 'ingest' && !m.ingested) {
      m.ingested = true;
      pushEvent(m, record, notify);
      pushEvent(m, { type: 'log', stepId: step.id, label: 'ingest', live: !!m.data, detail: m.data ? `${m.data.name}: ${m.data.notes.join(' · ')}, the charts plot this, not sample data` : 'no CSV attached: the charts plot the house sample series, labelled as such' }, notify);
      return 'ok';
    }
  }

  // Live authoring: at the step that writes the deliverable, a live lead model
  // authors the substance itself. Success or failure, the ledger says which.
  if (ev.type === 'step.status' && ev.status === 'LIVE') {
    const step = m.contract.plan.find((p) => p.id === ev.stepId);
    if (step && ['compose', 'build', 'design'].includes(step.tool) && !m.authored) {
      // The lead writes. If its provider refuses, the panel stands in: each
      // adviser with a key of its own is asked in turn, and the substitution
      // goes on the tape and into the provenance rather than a silent fall
      // back to scripted prose.
      const bench = [m.lead, ...(m.advisers || [])].map((id) => liveSeat(id)).filter(Boolean)
        .filter((s, i, all) => all.findIndex((x) => x.model.id === s.model.id) === i);
      if (bench.length) {
        pushEvent(m, record, notify);
        const refused = [];
        for (const seat of bench) {
          try {
            // The tape carries the writing as it happens: ephemeral, never
            // persisted, so the ledger stays a record and not a transcript.
            let sent = 0, written = '', lastAt = 0, lastSent = 0;
            const showWriting = (done) => {
              try { notify(m.id, { type: 'author.writing', model: seat.model.name, chars: sent, tail: written.replace(/\s+/g, ' ').slice(-180), ...(done ? { done: true } : {}) }); } catch { /* nobody is watching */ }
            };
            m.authored = await authorContent(m, seat, { onDelta: (d) => {
              written += d; sent += d.length;
              const now = Date.now();
              // Print on time or on length: a fast model must not arrive in
              // one silent burst, and a slow one must not print every letter.
              if (now - lastAt < 250 && sent - lastSent < 400) return;
              lastAt = now; lastSent = sent;
              showWriting(false);
            } });
            showWriting(true);
            { const hb = String(ws().houseBrief || '').trim(); if (hb) m.houseBrief = { at: Date.now(), chars: hb.length }; }
            if (m.authored.usage) { const u = m.authored.usage; if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1; m.keyUse.reported += 1; m.keyUse.prompt += u.prompt || 0; m.keyUse.completion += u.completion || 0; const at = (m.keyUse.models[seat.model.name] = m.keyUse.models[seat.model.name] || { calls: 0, prompt: 0, completion: 0 }); at.calls += 1; at.prompt += u.prompt || 0; at.completion += u.completion || 0; } else if (m.authored.live) { if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1; }
            if (refused.length) { m.authored.steppedIn = { after: refused.map((r) => r.name), lead: modelById(m.lead).name }; }
            const remembered = memoryCount(m);
            if (remembered) pushEvent(m, { type: 'log', stepId: step.id, label: 'author', live: false, detail: `the author was told ${remembered} thing${remembered === 1 ? '' : 's'} the person asking asked the house to remember` }, notify);
            pushEvent(m, { type: 'log', stepId: step.id, label: 'author', live: true, detail: `${m.authored.model} wrote the substance, ${m.authored.chars} chars in ${(m.authored.ms / 1000).toFixed(1)}s · billed to your key, 0 house credits · validators still gate it${refused.length ? ` · stepped in after ${refused.map((r) => `${r.name} refused (${r.error})`).join('; ')}` : ''}` }, notify);
            return 'ok';
          } catch (e) {
            refused.push({ name: seat.model.name, error: String(e.message || e).slice(0, 120) });
            if (bench.length > 1) pushEvent(m, { type: 'log', stepId: step.id, label: 'author', live: false, detail: `${seat.model.name} could not author (${refused.at(-1).error}); asking the next model on the panel` }, notify);
          }
        }
        m.authored = { live: false, model: refused[0].name, error: refused.map((r) => `${r.name}: ${r.error}`).join('; ').slice(0, 300), refusedBy: refused.map((r) => r.name), at: Date.now() };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'author', live: false, detail: `No model on the panel could author (${refused.map((r) => `${r.name}: ${r.error}`).join('; ')}); the house composes or scripts the substance and records it as such` }, notify);
        // Every key refused: the house still prefers quoting real sources to
        // inventing prose, so fall through to composition below.
      }
      // No model loaded. If real sources are on the table, the house composes
      // the brief out of them: every claim a quotation, nothing invented,
      // and the absence of judgement stated in the lede.
      const composed = composeFor(m);
      if (composed) {
        m.authored = { live: false, composed: true, model: composed.via, chars: JSON.stringify(composed.content).length, at: Date.now(), content: composed.content };
        pushEvent(m, { type: 'log', stepId: step.id, label: 'compose', live: false, detail: composed.log }, notify);
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
      pushEvent(m, { type: 'ceiling.reached', stepId: ev.stepId, wouldBe, ceiling: m.contract.ceiling, note: `Step ${stepIdx + 1} of ${m.contract.plan.length} would take spend to ${wouldBe}cr, over the ${m.contract.ceiling}cr ceiling. Nothing further is spent without a decision.` }, notify);
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
  if (ev.dissent && ev.dissent.model) m.dissent = { model: ev.dissent.model, text: ev.dissent.text };

  if (ev.type === 'artifact.ready') {
    // Live advisers read the lead's draft before it becomes the artifact of
    // record. One "revise" with issues sends the lead back once; every
    // critique and the revision are on the tape.
    if (m.authored?.live && !m.critiques) {
      m.critiques = [];
      const issues = [];
      for (const seatId of m.advisers || []) {
        const live = liveSeat(seatId);
        if (!live) continue;
        try {
          const c = await critiqueContent(m, live);
          countUsage(m, live.model.name);
          m.critiques.push({ seat: seatId, ...c });
          pushEvent(m, { type: 'council.critique', seat: seatId, model: c.model, live: true, verdict: c.verdict, issues: c.issues, text: c.verdict === 'pass' ? `${c.model}: the draft passes my read.` : `${c.model}: revise, ${c.issues.join(' · ') || 'no issues stated'}` }, notify);
          if (c.verdict === 'revise' && c.issues.length) issues.push(...c.issues.map((x) => `${c.model}: ${x}`));
        } catch (e) {
          m.critiques.push({ seat: seatId, model: live.model.name, error: String(e.message || e).slice(0, 160) });
          pushEvent(m, { type: 'council.critique', seat: seatId, model: live.model.name, live: false, verdict: 'unavailable', issues: [], text: `${live.model.name} could not critique (${String(e.message || e).slice(0, 100)}), recorded` }, notify);
        }
      }
      // The dissent that reaches the document should be a real disagreement
      // by a model that actually made it. Until now it was whatever the lead
      // invented about its own draft, or a scripted line attributed to a
      // model that never spoke. A live adviser that objected is the dissent.
      const objected = m.critiques.find((c) => c.verdict === 'revise' && c.issues?.length);
      if (objected) m.dissent = { model: objected.model, text: objected.issues.join(' '), live: true, answered: false };
      if (issues.length) {
        // Whoever actually wrote the draft answers the critique. If the lead
        // refused earlier and an adviser stood in, asking the lead to revise
        // work it never wrote would be the wrong model on the wrong page.
        const wrote = m.authored?.model;
        const bench = [m.lead, ...(m.advisers || [])].map((x) => liveSeat(x)).filter(Boolean);
        const lead = bench.find((x) => x.model.name === wrote) || bench[0] || null;
        if (lead) {
          const before = m.authored;
          try {
            m.authored = await authorContent(m, lead, { revise: issues.join('; ') });
            if (before?.steppedIn) m.authored.steppedIn = before.steppedIn;
            // The revision is a call on the owner's key like any other.
            if (m.authored.usage) { const u = m.authored.usage; if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1; m.keyUse.reported += 1; m.keyUse.prompt += u.prompt || 0; m.keyUse.completion += u.completion || 0; const at = (m.keyUse.models[lead.model.name] = m.keyUse.models[lead.model.name] || { calls: 0, prompt: 0, completion: 0 }); at.calls += 1; at.prompt += u.prompt || 0; at.completion += u.completion || 0; } else { if (!m.keyUse) m.keyUse = { calls: 0, prompt: 0, completion: 0, reported: 0, models: {} }; m.keyUse.calls += 1; }
            if (m.dissent?.live) m.dissent.answered = true;
            pushEvent(m, { type: 'log', stepId: null, label: 'revise', live: true, detail: `${m.authored.model} revised the draft on adviser critique (${issues.length} issue(s)), ${m.authored.chars} chars in ${(m.authored.ms / 1000).toFixed(1)}s` }, notify);
          } catch (e) {
            pushEvent(m, { type: 'log', stepId: null, label: 'revise', live: false, detail: `${lead.model.name} could not revise on critique (${String(e.message || e).slice(0, 100)}), the draft stands; the gate decides` }, notify);
          }
        }
      }
    }
    if (m.artifactId) {
      const { title, kind, html } = GENERATORS[m.desk](m);
      store.refreshArtifact(m.artifactId, { title: m.partial ? `${title} (partial)` : title, cost: m.spent }, html);
      Object.assign(record, { artifactId: m.artifactId, title, kind });
    } else {
      const a = makeArtifact(m, notify);
      Object.assign(record, a);
    }
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
  if (ev.type === 'run.done') { settle(m, notify); tellTheStory(m); store.archiveMission(m); }
  return 'ok';
}

// Two independent validator lanes prove every assertion against the real
// artifact; the gate seals only what both lanes pass. A failed gate raises a
// decision: patch (fix the earliest wrong artifact, re-validate), accept the
// risk on the record, or stop.
function runValidation(m, notify, runner) {
  const html = m.artifactId ? store.artifactHtml(m.artifactId) : '';
  const ids = (m.contract.assertions || []).map((a) => a.id);
  const rows = validateArtifact(m.variant === 'design' ? 'design' : m.desk, html || '', ids, { mission: m });
  const round = (m.validations?.length || 0) + 1;
  for (const lane of ['scrutiny', 'surface']) {
    const laneRows = rows.filter((r) => r.lane === lane);
    pushEvent(m, { type: 'validate.lane', lane, round, verdicts: laneRows.map((r) => ({ id: r.id, passed: r.passed, error: r.error, detail: r.detail })) , note: `${lane} lane: ${laneRows.filter((r) => r.passed).length}/${laneRows.length} assertions pass` }, notify);
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
      : `Gate NOT cleared: ${openAfterRisk.join(', ')}, ${gate.failed.length} failed, ${gate.dissenting.length} dissenting, ${gate.missing.length} missing.` }, notify);
  m.gateResult = gate;
  if (openAfterRisk.length === 0) return 'pushed';
  // A patch that did not clear is not offered twice: the honest options left
  // are to carry the risk on the record or stop.
  const alreadyPatched = openAfterRisk.filter((id) => (m.patches || []).includes(id));
  const patchable = alreadyPatched.length < openAfterRisk.length;
  raiseAttention(m, notify, {
    kind: 'gate', assertions: openAfterRisk,
    prompt: `The gate did not clear: ${openAfterRisk.map((id) => { const d = rows.find((r) => r.id === id && !r.passed && r.detail)?.detail; return `${id}, ${(m.contract.assertions.find((a) => a.id === id) || {}).title}${d ? ` (${d})` : ''}`; }).join('; ')}. ${alreadyPatched.length ? `A patch was already applied to ${alreadyPatched.join(', ')} and did not clear it. ` : ''}${patchable ? 'Patch the artifact and re-validate, accept the risk on the record, or stop?' : 'Accept the risk on the record, or stop?'}`,
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
  ledger('reserve', -mission.contract.ceiling, `${mission.serial} stamped, ceiling reserved`, { missionId: mission.id, serial: mission.serial });
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
      // Pre-persistence mission: nothing to resume from, close it honestly.
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

  // Any undecided attention item dies with the run, recorded as voided, so
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
    : 'Completed work is kept, a partial artifact follows.';
  pushEvent(m, { type: 'run.killed', note: `Run stopped at step ${Math.min(filled + 1, m.contract.plan.length)} of ${m.contract.plan.length}. ${artifactNote} Nothing beyond ${m.spent.toFixed(1)}cr was spent.` }, notify);
  tellTheStory(m);
  if (!m.artifactId) {
    const a = makeArtifact(m, notify);
    pushEvent(m, { type: 'artifact.ready', ...a, partial: true }, notify);
  }
  settle(m, notify);
  store.flushMissions();
  store.archiveMission(m);
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
export function forkMission(missionId, { goal, installedSkills, queuedConnectors, feedback, redeliverTo }) {
  const parent = store.mission(missionId);
  if (!parent) return null;
  const version = ((parent.lineage && parent.lineage.version) || 1) + 1;
  const notes = (Array.isArray(feedback) ? feedback : []).map((x) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 12);
  const next = writeContract({
    goal: goal || parent.goal, deskId: parent.desk, lead: parent.lead, advisers: parent.advisers,
    installedSkills, queuedConnectors, variant: parent.variant, template: parent.template, depth: parent.depth, chatId: parent.chatId,
    lineage: { parentId: parent.id, parentSerial: parent.serial, parentArtifactId: parent.artifactId || null, version, feedback: notes, previousDraft: parent.authored?.live ? parent.authored.content : null, redeliverTo: redeliverTo || [] },
  });
  return next;
}

export async function decideAttention(missionId, requestId, decision, justification, notify, by = null) {
  const m = store.mission(missionId);
  if (!m) return { error: 'Mission not found.' };
  if (m.status === 'KILLED' || m.status === 'FILLED') {
    return { error: `This position is already ${m.status.toLowerCase()}, the run ended before the decision landed.` };
  }
  const req = (m.attention || []).find((r) => r.id === requestId);
  if (!req) return { error: 'Attention item not found.' };
  if (req.decision) return { error: 'Already decided: decisions are first-write-wins.' };
  if (!req.options.includes(decision)) return { error: `Decision must be one of: ${req.options.join(', ')}` };
  if (!justification || !justification.trim()) return { error: 'A justification is required, it goes on the record.' };

  // Fund a raised ceiling BEFORE anything is recorded; a refusal changes nothing.
  let raisedCeiling = null;
  if (req.kind === 'ceiling' && decision === 'raise-ceiling') {
    raisedCeiling = Math.ceil(m.contract.ceiling * 1.4);
    if (!store.reserveCredits(raisedCeiling - m.contract.ceiling)) {
      return { error: `House credits cannot fund the raised ceiling (${raisedCeiling}cr). Abort with the partial artifact, or top up first.` };
    }
    ledger('reserve', -(raisedCeiling - m.contract.ceiling), `${m.serial} ceiling raised ${m.contract.ceiling} → ${raisedCeiling} cr, extra reserve taken`, { missionId: m.id, serial: m.serial });
  }

  req.decision = decision;
  req.decidedBy = by || null;
  req.justification = justification.trim().slice(0, 300);
  req.decidedAt = Date.now();
  pushEvent(m, { type: 'attention.resolved', requestId, kind: req.kind, decision, justification: req.justification, by: req.decidedBy }, notify);

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
  } else if (req.kind === 'ground') {
    if (decision === 'amend-ticket') {
      const dead = new Set(req.dead || []);
      killMission(missionId, notify);
      const next = forkMission(missionId, { goal: m.goal, installedSkills: m.installedSkills || [], queuedConnectors: m.connected || [], feedback: [`The sweep found no sources, so ${dead.size} step(s) that could only work on sources were dropped from this ticket.`] });
      if (next) {
        const kept = next.contract.plan.filter((p) => !['cite-guard', 'steelman'].includes(p.tool));
        if (kept.length) { try { editPlan(next.id, kept.map((p) => ({ id: p.id, title: p.title, tool: p.tool, access: p.access, dependsOn: p.dependsOn }))); } catch { /* the standard plan stands */ } }
        m.amendedTo = { id: next.id, serial: next.serial };
        store.flushMissions();
        pushEvent(m, { type: 'log', label: 'amend', detail: `Amended into ${next.serial}: the same goal without the steps that had nothing to work on. Nothing beyond ${m.spent.toFixed(1)}cr was spent here, and ${next.serial} is unstamped until you stamp it.` }, notify);
      }
    } else {
      m.status = 'LIVE';
      pushEvent(m, { type: 'log', label: 'ground', detail: 'Running the plan as stamped, with no sources on the table. The brief will say so.' }, notify);
      scheduleNext(missionId);
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
      pushEvent(m, { type: 'step.skipped', stepId: req.stepId, note: `Skipped: “${step?.title}”, declined on the record. Nothing acted externally; nothing was spent on it.` }, notify);
      scheduleNext(missionId);
    }
  } else if (req.kind === 'gate') {
    if (decision === 'patch') {
      // Patch the earliest wrong artifact: the deliverable is regenerated with
      // the patch applied, then both lanes run again.
      m.patches = [...new Set([...(m.patches || []), ...req.assertions])];
      m.status = 'LIVE';
      // A live author revises its own draft against the gate's findings; the
      // house never silently edits authored text.
      if (req.assertions.includes('VAL-FIGURES-SOURCED') && m.authored?.live) {
        const live = liveSeat(m.lead);
        const finding = (m.validations?.at(-1)?.rows || []).find((r) => r.id === 'VAL-FIGURES-SOURCED' && !r.passed && r.detail)?.detail || 'unsupported figures';
        if (live) {
          try {
            m.authored = await authorContent(m, live, { revise: finding });
            pushEvent(m, { type: 'log', stepId: req.stepId || null, label: 'revise', live: true, detail: `${m.authored.model} revised its draft against the gate finding (${finding}), ${m.authored.chars} chars in ${(m.authored.ms / 1000).toFixed(1)}s` }, notify);
          } catch (e) {
            pushEvent(m, { type: 'log', stepId: req.stepId || null, label: 'revise', live: false, detail: `${live.model.name} could not revise (${String(e.message || e).slice(0, 120)}), the draft stands and the gate will say so` }, notify);
          }
        }
      }
      pushEvent(m, { type: 'artifact.patched', assertions: req.assertions, note: `Patch applied for ${req.assertions.join(', ')}, artifact regenerated, re-validating.` }, notify);
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
      pushEvent(m, { type: 'review.accepted', note: 'Gap accepted and recorded in provenance, the artifact ships with the gap named, not hidden.' }, notify);
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
      pushEvent(m, { type: 'artifact.voided', note: 'Artifact VOIDED on terminal review, kept in Artifacts for audit, stamped void. The run closes with the void on the record.' }, notify);
      scheduleNext(missionId);
    }
  }
  store.flushMissions();
  return { ok: true };
}
