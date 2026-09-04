// Ask the record. A chat thread that started missions can be asked about
// them, "why did this cost more than the estimate?", "what did the gate
// refuse?", "which sources were used?", and the answer comes from the
// mission record, never from a guess. A live model gets the record in its
// prompt with an instruction to answer only from it; without a live model the
// house answers deterministically from the narrative and the ledger.
import { store } from './store.js';
import { missionDelta } from './delta.js';
import { ws } from './workspace.js';

// The house answers about money and schedule from the ledger, the missions
// and the standing orders. Deterministic; nothing here is generated.
const n0 = (x) => Number(x || 0).toFixed(0);
const MONEY = /\b(spen[dt]|cost|credits?|balance|reserve[d]?|budget|bill|paid|settled|expensive|costliest|cheapest)\b/i;
const SCHEDULE = /\b(schedul|standing order|repeat|recurring|next run|what.s (planned|due|coming))/i;
const PERIOD = (q) => (/\b(today)\b/i.test(q) ? ['today', 1] : /\b(this week|week|7 days|seven days)\b/i.test(q) ? ['this week', 7] : /\b(month|30 days)\b/i.test(q) ? ['the last 30 days', 30] : null);
export function houseAnswer(question) {
  const q = String(question || '');
  if (SCHEDULE.test(q)) {
    const orders = ws().standingOrders || [];
    if (!orders.length) return 'Nothing is scheduled: no standing orders. Make one from a delivered run with Repeat.';
    const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `${orders.length} standing order${orders.length === 1 ? '' : 's'}: ${orders.map((o) => `${o.serial} (${o.goal.slice(0, 50)}) ${o.cadence}${o.cap ? `, cap ${o.cap} cr a month` : ''}${o.paused ? ', paused' : `, next ${when(o.nextAt)}`}${o.runs?.[0] ? `, last ${o.runs[0].skipped ? `skipped: ${o.runs[0].skipped}` : `ran as ${o.runs[0].serial}`}` : ''}`).join('; ')}.`;
  }
  if (!MONEY.test(q)) return null;
  // A question about one mission, named or the latest, belongs to that mission's record.
  if (/PJ-\d+/i.test(q) || /\b(last|latest|most recent|previous)\b[^.]*\b(delivery|run|mission|ticket)\b/i.test(q)) return null;
  const w = store.workspace();
  const period = PERIOD(q);
  const ms = store.missions();
  const done = ms.filter((m) => m.status === 'FILLED' || m.status === 'KILLED');
  const inPeriod = period ? done.filter((m) => (m.filledAt || m.createdAt || 0) >= Date.now() - period[1] * 86400000) : done;
  const settled = (m) => (m.settlement?.settled ?? m.spent) || 0;
  const total = inPeriod.reduce((a, m) => a + settled(m), 0);
  const delivered = inPeriod.filter((m) => m.status === 'FILLED');
  const top = [...inPeriod].sort((a, b) => settled(b) - settled(a))[0];
  const cheapest = [...delivered].sort((a, b) => settled(a) - settled(b))[0];
  const parts = [];
  parts.push(period ? `${period[0][0].toUpperCase() + period[0].slice(1)} the house settled ${n0(total)} credits across ${delivered.length} deliver${delivered.length === 1 ? 'y' : 'ies'}${inPeriod.length - delivered.length ? ` and ${inPeriod.length - delivered.length} stopped run${inPeriod.length - delivered.length === 1 ? '' : 's'}` : ''}.` : `To date the house has settled ${n0(w.spent)} credits across ${delivered.length} deliveries.`);
  if (/costliest|expensive|most/i.test(q) && top) parts.push(`The costliest was ${top.serial}, ${top.subject || top.goal}, at ${n0(settled(top))} cr.`);
  else if (/cheapest|least/i.test(q) && cheapest) parts.push(`The cheapest delivery was ${cheapest.serial}, ${cheapest.subject || cheapest.goal}, at ${n0(settled(cheapest))} cr.`);
  else if (top) parts.push(`The costliest was ${top.serial} at ${n0(settled(top))} cr.`);
  parts.push(`Balance ${n0(w.credits)} credits, ${n0(w.reserved)} reserved against ${ms.filter((m) => m.status === 'LIVE' || String(m.status).startsWith('PAUSED')).length} run${ms.filter((m) => m.status === 'LIVE' || String(m.status).startsWith('PAUSED')).length === 1 ? '' : 's'} in flight.`);
  return parts.join(' ') + ' Every figure is from the credit ledger under Payment and Invoices.';
}


const n = (x) => Number(x || 0).toFixed(1);

export function missionsOfChat(chat) {
  const ids = [...new Set((chat.messages || []).map((m) => m.missionId).filter(Boolean))];
  return ids.map((id) => store.missionFull(id)).filter(Boolean);
}

// Compact, factual digest of one mission for a model prompt.
export function digest(m) {
  const plan = (m.contract?.plan || []).map((p, i) => `${i + 1}. ${p.title} [${p.tool}, ${p.cost} cr, ${p.status}]`).join('\n');
  const gates = (m.events || []).filter((e) => e.type === 'gate').map((g) => `round ${g.round}: ${g.cleared ? 'cleared' : `refused ${[...(g.failed || []), ...(g.dissenting || [])].join(', ')}`}`).join('; ');
  const details = (m.validations || []).flatMap((v) => v.rows.filter((r) => !r.passed && r.detail).map((r) => `${r.id} (${r.lane}): ${r.detail}`)).slice(0, 6).join('; ');
  const decisions = (m.attention || []).filter((a) => a.decision).map((a) => `${a.kind} → ${a.decision}, "${a.justification}"`).join('; ');
  const sources = (m.sources || []).map((s, i) => `[${i + 1}] ${s.title} (${s.engine || s.kind})`).join('; ');
  const critiques = (m.critiques || []).map((c) => `${c.model}: ${c.verdict}${(c.issues || []).length ? `, ${c.issues.join(' / ')}` : ''}`).join('; ');
  return [
    `MISSION ${m.serial} (${m.deskName}), status ${m.status}${m.partial ? ', partial' : ''}${m.voided ? ', voided' : ''}`,
    `Goal: ${m.goal}`,
    m.narrative ? `Narrative: ${m.narrative}` : null,
    (() => { const d = missionDelta(m); return d && d.lines.length ? `Since last run (v${d.parent.version}, ${d.parent.serial}): ${d.lines.join(' ')}` : null; })(),
    `Credits: estimate ${m.contract?.estimate}, ceiling ${m.contract?.ceiling}, spent ${n(m.spent)}${m.settlement ? `, settled ${n(m.settlement.settled)}, released ${n(m.settlement.released)}` : ''}`,
    `Plan:\n${plan}`,
    m.contract?.why ? `Why this plan: ${m.contract.why}` : null,
    gates ? `Gate: ${gates}` : null,
    details ? `Gate findings: ${details}` : null,
    decisions ? `Owner decisions: ${decisions}` : null,
    m.authored ? `Authoring: ${m.authored.live ? `live by ${m.authored.model}` : `scripted (live model ${m.authored.model} failed: ${m.authored.error})`}` : 'Authoring: scripted (no live model)',
    critiques ? `Adviser critiques: ${critiques}` : null,
    sources ? `Sources: ${sources}` : 'Sources: none',
    m.review ? `Terminal review: ${m.review.verdict}${(m.review.gaps || []).length ? `, ${m.review.gaps.map((g) => `${g.id}: ${g.description}`).join('; ')}` : ''}` : null,
    m.artifactId ? `Artifact: ${m.artifactId}${m.lineage ? ` (version ${m.lineage.version}, supersedes ${m.lineage.parentSerial})` : ''}` : 'Artifact: none',
  ].filter(Boolean).join('\n');
}

// What the record offers a question: the thread's missions, any mission the
// question names by serial (from any thread), and, when it asks about the
// last or latest delivery, the three most recent deliveries in the house.
const RECENT = /\b(last|latest|recent|newest|most recent|today|yesterday|this week)\b/i;
export function missionsFor(chat, text = '') {
  const named = [...new Set((String(text).match(/PJ-\d+/gi) || []).map((s) => s.toUpperCase()))];
  const all = store.missions();
  const byName = named.map((s) => all.find((m) => m.serial === s)).filter(Boolean).map((m) => store.missionFull(m.id));
  const thread = missionsOfChat(chat);
  const recent = RECENT.test(text) ? all.filter((m) => m.status === 'FILLED').sort((a, b) => (b.filledAt || 0) - (a.filledAt || 0)).slice(0, 3).map((m) => store.missionFull(m.id)) : [];
  const seen = new Set(); const out = [];
  for (const m of [...byName, ...thread, ...recent]) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
  return out;
}
export function recordContext(chat, limit = 7000, question = '') {
  const ms = missionsFor(chat, question);
  if (!ms.length) return '';
  let text = ms.map(digest).join('\n\n');
  if (text.length > limit) text = text.slice(0, limit) + '\n[record truncated]';
  return text;
}

// Deterministic answers when no live model is loaded. Returns null when the
// question is not about the record, so the caller can fall through.
const TOPICS = [
  { re: /\b(chang|since last|last time|last run|previous (run|version)|what.s new|different)/i, pick: /^$/, delta: true },
  { re: /\b(cost|credit|spend|spent|estimate|ceiling|settle|price|expensive|over budget|cheap)/i, pick: /(credit|estimate|ceiling|settle|reserved)/i },
  { re: /\b(gate|refus|fail|assert|valid|seal|patch|risk)/i, pick: /(gate|lane|sealed|assertion|accepted risk)/i },
  { re: /\b(source|cite|citation|evidence|retriev|sweep|attach)/i, pick: /(source|sweep|attached|table)/i },
  { re: /\b(panel|adviser|advisor|council|dissent|critique|who (wrote|spoke)|model|seat)/i, pick: /(panel|dissent|wrote the substance|critique|revision|spoke live|house voice|scripted)/i },
  { re: /\b(decid|decision|approv|justif|ceiling|raise|skip)/i, pick: /(owner|chose|raised|approved|skipped|decision)/i },
  { re: /\b(review|gap|reviewer)/i, pick: /(reviewer|gap)/i },
  { re: /\b(version|amend|supersede|note|change[sd]?|previous)/i, pick: /(version|supersed|note|edited)/i },
  { re: /\b(deliver|artifact|output|result|what did (you|it) (make|produce))/i, pick: /(Delivered|artifact)/i },
];
export function answerFromRecord(question, missions) {
  if (!missions.length) return null;
  const q = String(question || '');
  const wantsAll = /\b(what happened|summar|explain|walk me through|tell me about|how did it go|overview|recap)\b/i.test(q);
  const topic = TOPICS.find((t) => t.re.test(q));
  if (!wantsAll && !topic) return null;
  const serialAsked = (q.match(/PJ-\d+/i) || [])[0];
  const targets = serialAsked ? missions.filter((m) => m.serial.toLowerCase() === serialAsked.toLowerCase()) : RECENT.test(q) ? [[...missions].filter((m) => m.status === 'FILLED').sort((a, b) => (b.filledAt || 0) - (a.filledAt || 0))[0] || missions.at(-1)] : [missions.at(-1)];
  if (!targets[0]) return null;
  const answers = targets.map((m) => {
    if (topic?.delta) { const d = missionDelta(m); return d && d.lines.length ? `${m.serial} against v${d.parent.version} (${d.parent.serial}): ${d.lines.join(' ')}` : `${m.serial} has no earlier version to compare with; it is v1.`; }
    const sentences = (m.narrative || '').split(/(?<=\.)\s+/).filter(Boolean);
    if (!sentences.length) return `${m.serial} has no narrative yet, it is ${m.status.toLowerCase()}${m.status === 'LIVE' || m.status.startsWith('PAUSED') ? '; the tape is still being written' : ''}.`;
    if (wantsAll || !topic) return sentences.join(' ');
    let picked = sentences.filter((s) => topic.pick.test(s));
    if (topic.re.source.includes('source') && (m.sources || []).length) picked.push(`On the table: ${m.sources.map((s, i) => `[${i + 1}] ${s.title}`).join('; ')}.`);
    if (!picked.length) picked = [`The record of ${m.serial} does not speak to that. ${sentences[0]}`];
    return picked.join(' ');
  });
  return `From the record: ${answers.join('\n\n')}`;
}
