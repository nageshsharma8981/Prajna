// The canvas: a landing page edited in place. What comes back from the page
// is data, never markup: the new text for a marked element, the order of a
// marked group, the id of a look. The house applies it to the page it keeps,
// escaping every character, and the page becomes its next version with a
// provenance row that says a hand changed it. A page that took markup from
// a browser would let a guest plant a script the owner then opens on the
// house's own origin; a page that takes words cannot.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = /^[a-z][a-z0-9_.-]{0,39}$/i;

export const SITE_LOOKS = [
  { id: 'meadow', name: 'Meadow, deep green on pale sage', ink: '#101c16', ground: '#eef1ea', acc: '#1d5c3a', acc2: '#dbe8d2' },
  { id: 'midnight', name: 'Midnight, blue on cool white', ink: '#0b1020', ground: '#eef1f8', acc: '#1f6fd6', acc2: '#d9e6fb' },
  { id: 'terracotta', name: 'Terracotta, clay on sand', ink: '#3a2418', ground: '#f6efe4', acc: '#c65a2e', acc2: '#f3dccb' },
  { id: 'ink', name: 'Ink, black on paper', ink: '#111111', ground: '#f7f5ef', acc: '#111111', acc2: '#e6e2d6' },
  { id: 'plum', name: 'Plum, violet on lilac', ink: '#22102e', ground: '#f4eff7', acc: '#6a2c91', acc2: '#e6d6f0' },
];
export const rootLine = (l) => `:root{--ink:${l.ink};--ground:${l.ground};--acc:${l.acc};--acc2:${l.acc2}}`;

export function applyEdits(html, body) {
  let out = String(html || '');
  if (!body || typeof body !== 'object') throw new Error('Send the edits as an object.');
  const text = body.text && typeof body.text === 'object' ? body.text : {};
  let texts = 0;
  for (const [k, v] of Object.entries(text)) {
    if (!KEY.test(k)) throw new Error(`Not an editable key: ${String(k).slice(0, 40)}`);
    if (typeof v !== 'string') throw new Error(`The text for ${k} must be a string.`);
    const clean = v.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!clean) throw new Error(`The text for ${k} cannot be empty.`);
    const re = new RegExp(`(<([a-z0-9]+)(?:\\s[^>]*)?\\sdata-edit="${k.replace(/[.]/g, '\\.')}"[^>]*>)([\\s\\S]*?)(</\\2>)`, 'i');
    if (!re.test(out)) throw new Error(`Nothing on the page is marked ${k}.`);
    out = out.replace(re, (_, open, tag, inner, close) => `${open}${esc(clean)}${close}`);
    texts += 1;
  }
  let ordered = false;
  if (body.order != null) {
    if (!Array.isArray(body.order) || !body.order.every((k) => typeof k === 'string' && KEY.test(k))) throw new Error('The order must be a list of keys.');
    const blocks = [...out.matchAll(/<div data-edit-group="([\w-]+)" data-edit-key="([\w-]+)">[\s\S]*?<\/div>/g)];
    const keys = blocks.map((b) => b[2]);
    if (!blocks.length) throw new Error('Nothing on the page can be reordered.');
    if (body.order.length !== keys.length || new Set(body.order).size !== keys.length || !body.order.every((k) => keys.includes(k))) throw new Error(`The order must name each of ${keys.join(', ')} once.`);
    if (body.order.some((k, i) => k !== keys[i])) {
      const first = blocks[0].index, last = blocks.at(-1).index + blocks.at(-1)[0].length;
      const by = Object.fromEntries(blocks.map((b) => [b[2], b[0]]));
      out = out.slice(0, first) + body.order.map((k) => by[k]).join('\n  ') + out.slice(last);
      ordered = true;
    }
  }
  let look = null;
  if (body.look != null) {
    look = SITE_LOOKS.find((l) => l.id === body.look) || null;
    if (!look) throw new Error(`No look called ${String(body.look).slice(0, 30)}. The looks are ${SITE_LOOKS.map((l) => l.id).join(', ')}.`);
    if (!/:root\{--ink:[^}]*\}/.test(out)) throw new Error('This page has no look to change.');
    out = out.replace(/:root\{--ink:[^}]*\}/, rootLine(look));
  }
  const count = texts + (ordered ? 1 : 0) + (look ? 1 : 0);
  const summary = [texts ? `${texts} text${texts === 1 ? '' : 's'}` : null, ordered ? 'the order' : null, look ? `the look “${look.name}”` : null].filter(Boolean).join(', ');
  return { html: out, count, summary };
}

// The provenance row for the hand: one row, replaced on each edit, so the
// page says what version it is and who last changed it by hand.
export function stampEdit(html, { version, summary, by, at = Date.now() }) {
  const row = `<div class="prov-row edited"><span>Edited by hand</span><strong>v${version} · ${esc(summary)} · ${new Date(at).toISOString().slice(0, 10)} by ${esc(by)}</strong></div>`;
  const stripped = String(html).replace(/<div class="prov-row edited">[\s\S]*?<\/div>/, '');
  if (!stripped.includes('<footer class="prov">')) return stripped;
  return stripped.replace('<footer class="prov">', `<footer class="prov">${row}`);
}
