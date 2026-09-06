// What the house remembers about a person, for that person. A memory is a
// line the person told the house to keep ("I write for a pharma R&D
// audience", "British spelling", "never say leverage"), and it goes to the
// author of every delivery that person asks for, as "about the person
// asking". It belongs to the visitor who left it: nobody else in the house
// can read it, the owner included, it is never a key, and any of it can be
// forgotten. Beside what they told the house sits what the house has
// noticed on its own record, derived when asked and never stored: how many
// deliveries, on which desks, the latest brief, the look their decks wear.
import crypto from 'node:crypto';
import { ws } from './workspace.js';
import { store } from './store.js';

const list = (id) => { const v = id && ws().visitors && ws().visitors[id]; return v && Array.isArray(v.memories) ? v.memories : []; };
export function memoriesFor(id) { return list(id).map((m) => ({ ...m })); }
export function remember(id, text, from = 'you') {
  const v = id && ws().visitors && ws().visitors[id];
  if (!v || !v.name) throw new Error('Sign in with a name first; a memory belongs to the person who leaves it.');
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!t) throw new Error('Write the memory first.');
  const ms = list(id);
  if (ms.some((m) => m.text.toLowerCase() === t.toLowerCase())) throw new Error('The house already remembers that.');
  if (ms.length >= 40) throw new Error('Forty memories at most; forget one first.');
  const m = { id: crypto.randomBytes(4).toString('hex'), text: t, at: Date.now(), from };
  v.memories = [...ms, m];
  return m;
}
export function forget(id, memId) {
  const v = id && ws().visitors && ws().visitors[id];
  if (!v) return false;
  const before = list(id).length;
  v.memories = list(id).filter((m) => m.id !== memId);
  return v.memories.length < before;
}
export function forgetAll(id) { const v = id && ws().visitors && ws().visitors[id]; if (v) v.memories = []; }

// Derived from the record, never stored, and only about this person's own asks.
export function noticed(id) {
  if (!id) return [];
  const mine = store.missions().filter((m) => m.askerId === id);
  if (!mine.length) return [];
  const out = [];
  const byDesk = {};
  for (const m of mine) { const d = String(m.deskName || m.desk || 'desk').toLowerCase(); byDesk[d] = (byDesk[d] || 0) + 1; }
  const desks = Object.entries(byDesk).sort((a, b) => b[1] - a[1]);
  out.push(`You have asked for ${mine.length} ${mine.length === 1 ? 'delivery' : 'deliveries'} here: ${desks.map(([d, n]) => `${n} on the ${d}`).join(', ')}.`);
  const last = mine.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (last) out.push(`Your latest brief: “${String(last.goal || '').slice(0, 120)}”.`);
  const looks = {};
  for (const m of mine) if (m.look && m.look.mood) looks[m.look.mood] = (looks[m.look.mood] || 0) + 1;
  const top = Object.entries(looks).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(`Your decks mostly wear one look: ${top[0]}.`);
  const notes = mine.reduce((n, m) => n + ((m.lineage && m.lineage.feedback) || []).length, 0);
  if (notes) out.push(`You have sent ${notes} note${notes === 1 ? '' : 's'} back on earlier versions; the author reads them.`);
  return out;
}
export const memoryCount = (mission) => list(mission && mission.askerId).length;
export function memoryBrief(mission) {
  const id = mission && mission.askerId;
  if (!id) return '';
  const told = list(id), seen = noticed(id);
  if (!told.length && !seen.length) return '';
  return `\nAbout the person asking (what they told the house to remember, then what the house has noticed; honour it unless the goal says otherwise, never at the cost of honesty about evidence):\n${told.map((m) => `- ${m.text}`).join('\n')}${told.length && seen.length ? '\n' : ''}${seen.map((s) => `- ${s}`).join('\n')}\n`;
}
