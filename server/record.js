// Ask the record. A chat thread that started missions can be asked about
// them, "why did this cost more than the estimate?", "what did the gate
// refuse?", "which sources were used?", and the answer comes from the
// mission record, never from a guess. A live model gets the record in its
// prompt with an instruction to answer only from it; without a live model the
// house answers deterministically from the narrative and the ledger.
import { store } from './store.js';

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

export function recordContext(chat, limit = 7000) {
  const ms = missionsOfChat(chat);
  if (!ms.length) return '';
  let text = ms.map(digest).join('\n\n');
  if (text.length > limit) text = text.slice(0, limit) + '\n[record truncated]';
  return text;
}

// Deterministic answers when no live model is loaded. Returns null when the
// question is not about the record, so the caller can fall through.
const TOPICS = [
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
  const targets = serialAsked ? missions.filter((m) => m.serial.toLowerCase() === serialAsked.toLowerCase()) : [missions.at(-1)];
  const answers = targets.map((m) => {
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
