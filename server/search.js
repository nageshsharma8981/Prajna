// Search inside the record. Not titles: the words themselves, in delivered
// artifacts, in the tape of every run (archived tapes included), in the
// decisions and their justifications, in the sources on the table, and in
// conversations. Every hit says where it was found and shows the line.
import fs from 'node:fs';
import path from 'node:path';
import { store, DATA_DIR } from './store.js';
import { ws } from './workspace.js';

const SNIP = 110;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const stripHtml = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Artifact text is re-read only when its file changed; a search over a full
// house should not re-strip every delivery every keystroke.
const cache = new Map();
function artifactText(a) {
  let stamp = 0;
  try { stamp = fs.statSync(path.join(DATA_DIR, 'artifacts', `${a.id}.html`)).mtimeMs; } catch { /* gone; treat as empty */ }
  const hit = cache.get(a.id);
  if (hit && hit.stamp === stamp) return hit.text;
  const text = clean(stripHtml(store.artifactHtml(a.id) || '')).slice(0, 60000);
  cache.set(a.id, { stamp, text });
  return text;
}

function snippet(text, terms) {
  const hay = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = hay.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return clean(text).slice(0, SNIP * 2);
  const from = Math.max(0, at - SNIP / 2);
  return `${from > 0 ? '…' : ''}${clean(text.slice(from, from + SNIP * 2))}${from + SNIP * 2 < text.length ? '…' : ''}`;
}
const has = (text, terms) => { const hay = String(text).toLowerCase(); return terms.every((t) => hay.includes(t)); };

// Everything one mission has to say, as one searchable string plus the parts
// that make a good "where".
function missionFields(m) {
  const full = store.missionFull(m.id) || m;
  const events = full.events || [];
  return [
    { where: 'the ticket', text: `${m.serial} ${m.subject || ''} ${m.goal || ''} ${m.deskName || ''} ${full.contract?.why || ''} ${(full.contract?.plan || []).map((p) => p.title).join(' ')}` },
    { where: 'the narrative', text: full.narrative || '' },
    { where: 'the tape', text: events.map((e) => e.detail || e.text || e.note || e.prompt || '').filter(Boolean).join(' · ') },
    { where: 'a decision', text: (full.attention || []).map((a) => `${a.kind}: ${a.prompt || ''} ${a.decision ? `→ ${a.decision}, "${a.justification}"` : '(open)'}`).join(' · ') },
    { where: 'the sources', text: (full.sources || []).map((s) => `${s.title || ''} ${s.url || ''} ${s.extract || ''}`).join(' · ') },
    { where: 'recorded dissent', text: full.dissent ? `${full.dissent.model}: ${full.dissent.text}` : '' },
    { where: 'the gate', text: (full.validations || []).flatMap((v) => (v.rows || []).filter((r) => !r.passed).map((r) => `${r.id} ${r.lane}: ${r.detail || 'failed'}`)).join(' · ') },
  ].filter((f) => f.text);
}

export function search(query, { limit = 24 } = {}) {
  const terms = String(query || '').toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 1).slice(0, 6);
  if (!terms.length) return { query: String(query || ''), terms: [], hits: [], scanned: null };
  const hits = [];
  const missions = store.missions();
  for (const m of missions) {
    for (const f of missionFields(m)) {
      if (!has(f.text, terms)) continue;
      hits.push({ kind: 'mission', id: m.id, serial: m.serial, title: m.subject || m.goal, where: f.where, status: m.status, at: m.filledAt || m.launchedAt || m.createdAt, to: `/run/${m.id}`, snippet: snippet(f.text, terms) });
      break; // one hit per mission, at the most telling place it was found
    }
  }
  const artifacts = store.artifacts();
  for (const a of artifacts) {
    const text = `${a.title} ${artifactText(a)}`;
    if (!has(text, terms)) continue;
    hits.push({ kind: 'artifact', id: a.id, serial: a.serial, title: a.title, where: `the ${a.kind} delivered, v${a.version}`, at: a.createdAt, to: `/artifact/${a.id}`, snippet: snippet(text, terms) });
  }
  for (const c of ws().chats || []) {
    const text = `${c.title} ${(c.messages || []).map((x) => x.text || '').join(' · ')}`;
    if (!has(text, terms)) continue;
    hits.push({ kind: 'chat', id: c.id, title: c.title, where: 'a conversation', at: c.updatedAt || c.createdAt, to: `/c/${c.id}`, snippet: snippet(text, terms) });
  }
  hits.sort((a, b) => (b.at || 0) - (a.at || 0));
  return { query: String(query), terms, hits: hits.slice(0, limit), total: hits.length, scanned: { missions: missions.length, artifacts: artifacts.length, chats: (ws().chats || []).length } };
}
