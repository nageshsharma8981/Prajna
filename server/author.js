// Live authoring. When the lead seat is live (a BYOK key is loaded for its
// provider), the lead model writes the SUBSTANCE of the deliverable as strict
// JSON at the compose/build/design step. The house generators lay it out, the
// provenance block records who wrote what, and the validator lanes gate it
// exactly as they gate scripted output. No key → scripted substance, labeled.
import { callModel } from './providers.js';

const SHAPES = {
  brief: `{"stand":"<one-sentence stance for the lede>","verdict":"<2-3 sentences: the recommendation, stated before any evidence>","claims":[{"text":"<lead claim>","grade":"A|B|C","detail":"<1-2 sentences of support>","src":<number of the retrieved source this claim rests on, or 0 if none>,"source":{"title":"<if src is 0: the kind of source this would rest on, described honestly>","kind":"primary|analysis|field|press"}}, … exactly 3 to 5 claims],"refuted":["<claim commonly made that did not survive grading>", … 3],"moves":[{"move":"","commitment":"","reversibility":"High|Medium|Low","buys":""}, … 3],"tripwires":"<the two signals that should change the decision>","dissent":{"seat":"<name of the dissenting adviser>","text":"<the strongest recorded disagreement, 2-3 sentences>"}}`,
  deck: `{"sub":"<title-slide subtitle, one line>","slides":[{"n":"<beat label e.g. The problem>","h":"<one headline>","s":"<one supporting line, no lists>"}, … exactly 6 slides in this order: the problem, the shift, the mechanism, the proof, the economics, the ask],"one":"<the entire argument in one plain sentence>","close":"<the closing line to leave on screen>"}`,
  site: `{"brand":"<two-word brand>","headline":"<hero headline, ≤10 words>","sub":"<hero paragraph, ≤40 words>","primary":"<primary button label>","secondary":"<secondary link label>","strip":"<one-line strip under the hero>","why":[{"k":"<2-3 word kicker>","h":"<heading>","p":"<≤30 words>"}, … exactly 3],"closing":{"h":"<closing headline>","cta":"<button label>"}}`,
  mobile: `{"short":"<app name, ≤3 words>","screens":[{"tab":"<tab label ≤8 chars>","title":"<screen title>","body":"<one line on what this screen is for>","items":[{"b":"<item title>","s":"<one line of context>"}, … exactly 3],"cta":"<primary button label>"}, … exactly 4 screens]}`,
  analysis: `{"read":"<one-paragraph read: what the numbers would need to show and what the obvious wrong explanation is>","trend":"<headline for the 12-period trend chart>","segment":"<headline for the segment breakdown>","caveat":"<the caveats, explicit that the series is sample data until a connector supplies real numbers>"}`,
  design: `{"regions":[{"name":"<region name>","note":"<intent, content and state notes, one line>"}, … 5 to 7 regions in page order]}`,
};

const MIN = {
  brief: (c) => Array.isArray(c.claims) && c.claims.length >= 3 && c.verdict,
  deck: (c) => Array.isArray(c.slides) && c.slides.length >= 6,
  site: (c) => c.headline && Array.isArray(c.why) && c.why.length >= 3,
  mobile: (c) => Array.isArray(c.screens) && c.screens.length >= 4,
  analysis: (c) => c.read && c.trend && c.segment,
  design: (c) => Array.isArray(c.regions) && c.regions.length >= 5,
};

export const shapeFor = (mission) => (mission.variant === 'design' ? 'design' : mission.desk);

export function authorPrompt(mission) {
  const shape = SHAPES[shapeFor(mission)];
  const sources = (mission.sources || []).map((s, i) => `[${i + 1}] ${s.title} — ${s.url}\n    ${s.extract}`).join('\n');
  const positions = (mission.events || []).filter((e) => e.type === 'council.position' && e.text).map((e) => `- ${e.model || e.seat}: ${e.text}`).join('\n');
  return `You are the lead author on a ${mission.deskName.toLowerCase()} mission in Prajñā, an outcome exchange.\nGoal: "${mission.goal}"\nDeliverable: ${mission.deliverable}.\n${sources ? `Retrieved sources (cite by number; do not claim anything they do not support):\n${sources}\n` : ''}${positions ? `Panel positions to honour or answer:\n${positions}\n` : ''}Rules: write specifically for this goal, in plain confident prose. Never invent numbers, customers, results or quotes — describe what real proof would look like or write "evidence pending". No preamble, no markdown fences.\nReply with ONLY one JSON object of exactly this shape:\n${shape}`;
}

export function parseAuthored(text) {
  const s = String(text);
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(s.slice(start, end + 1));
}

export async function authorContent(mission, live, { revise } = {}) {
  const started = Date.now();
  const prompt = revise ? `${authorPrompt(mission)}\n\nREVISION REQUIRED. Your previous draft failed the house gate: ${revise}. Rewrite the whole object so it passes: drop or re-source every offending figure; never replace one invented number with another.` : authorPrompt(mission);
  const text = await callModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, prompt, maxTokens: 2600 });
  const content = parseAuthored(text);
  const ok = MIN[shapeFor(mission)];
  if (!ok || !ok(content)) throw new Error('the reply did not match the required shape');
  return { live: true, model: live.model.name, modelId: live.model.modelId, chars: text.length, ms: Date.now() - started, at: Date.now(), content, revisions: (mission.authored?.revisions || 0) + (revise ? 1 : 0) };
}

// Adviser critique: a live adviser reads the lead's draft before the gate and
// says pass or revise, with concrete issues. Strict JSON, like authoring.
export function critiquePrompt(mission, adviser) {
  return `You are ${adviser.name}, an adviser on the review panel for a ${mission.deskName.toLowerCase()} mission in Prajñā.\nGoal: "${mission.goal}"\nThe lead author's draft (JSON):\n${JSON.stringify(mission.authored.content).slice(0, 6000)}\n${(mission.sources || []).length ? `Retrieved sources: ${mission.sources.map((s, i) => `[${i + 1}] ${s.title}`).join('; ')}\n` : ''}CRITIQUE the draft against the goal only: unsupported claims, invented figures, missing dissent, weak or generic copy, anything a skeptical reader would refuse. Be specific and short.\nReply with ONLY one JSON object: {"verdict":"pass"|"revise","issues":["<one concrete issue, ≤25 words>", … 0 to 4]}`;
}
export async function critiqueContent(mission, live) {
  const started = Date.now();
  const text = await callModel({ provider: live.model.provider, key: live.key, baseUrl: live.baseUrl, modelId: live.model.modelId, prompt: critiquePrompt(mission, live.model), maxTokens: 500 });
  const c = parseAuthored(text);
  const verdict = c.verdict === 'revise' ? 'revise' : 'pass';
  const issues = Array.isArray(c.issues) ? c.issues.filter((x) => typeof x === 'string').slice(0, 4).map((x) => x.slice(0, 200)) : [];
  return { verdict, issues, model: live.model.name, modelId: live.model.modelId, ms: Date.now() - started };
}

// Generators call this: authored substance only when it is live and present.
export const authored = (mission) => (mission.authored && mission.authored.live && mission.authored.content ? mission.authored.content : null);
export const str = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);
