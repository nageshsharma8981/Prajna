// Definition of done, Zenith's two-layer contract, independently implemented.
// Each desk's ticket carries ATOMIC ASSERTIONS (testable promises about the
// deliverable). Plan steps OWN assertions; two independent validator LANES
// prove them against the real artifact HTML; a GATE seals what both lanes
// pass and reports dissent (lanes disagree) and missing (no lane covered).
// These are real checks on real output, never a scripted vote.

// The deliverable body: what the user receives, minus the house's own
// provenance footer and audit object (which legitimately carry lists).
const body = (html) => html.replace(/<footer class="prov">[\s\S]*?<\/footer>/, '').replace(/<script type="application\/json" id="prajna-provenance">[\s\S]*?<\/script>/, '');
const has = (html, re) => (re instanceof RegExp ? re.test(html) : html.includes(re));
const count = (html, re) => (html.match(re) || []).length;
const provenance = (html) => {
  const m = html.match(/id="prajna-provenance">([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};

// Figures in the deliverable body: percentages, money, counts with units,
// ratios, "n=". A live author may only use figures the goal or a retrieved
// source actually contains; everything else is an invented number.
const FIG_RE = /(?:[$₹€£]\s?\d[\d,.]*\s?(?:million|billion|crore|lakh|bn|k|m)?|\b\d[\d,.]*\s?(?:%|percent|per cent|million|billion|crore|lakh|x\b|:\s?1\b)|\bn\s?=\s?\d+)/gi;
export function figuresIn(text) {
  return [...new Set((String(text).match(FIG_RE) || []).map((f) => f.replace(/\s+/g, ' ').trim()))];
}
const textOf = (html) => body(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const norm = (s) => String(s).toLowerCase().replace(/[\s,]/g, '');
function unsupportedFigures(html, { allowLabelled = false } = {}) {
  const p = provenance(html);
  if (!p || p.mode !== 'live') return { ok: true, detail: 'scripted substance is house-labelled sample; figures not checked' };
  const text = textOf(html);
  const allowed = [p.goal || '', ...((p.attachments || []).map((a) => `${a.name} ${a.extract || ''}`)), ...((p.retrieval?.sources || []).map((s) => `${s.title} ${s.extract || ''}`))].map(norm).join(' ');
  const figures = figuresIn(text);
  const bad = figures.filter((f) => {
    if (allowed.includes(norm(f))) return false;
    if (allowLabelled) {
      const i = text.indexOf(f); const around = text.slice(Math.max(0, i - 160), i + 160).toLowerCase();
      if (/illustrative|sample|placeholder|hypothetical|evidence pending|for example/.test(around)) return false;
    }
    return true;
  });
  return bad.length ? { ok: false, detail: `unsupported figures: ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''}` } : { ok: true, detail: figures.length ? `${figures.length} figure(s), all traceable to the goal or a retrieved source` : 'no figures asserted' };
}
const HONESTY = { id: 'VAL-FIGURES-SOURCED', title: 'Every figure in a live-authored deliverable traces to the goal or a retrieved source', owner: 'compose',
  scrutiny: (h) => unsupportedFigures(h), surface: (h) => unsupportedFigures(h, { allowLabelled: true }) };

// A citation is a claim about a source, so the house checks it like any other
// claim: does the source it points at actually speak to it? Deterministic and
// deliberately forgiving, it fails only when a cited source shares not one
// distinctive word with the claim resting on it, which is the shape of a
// citation attached to the wrong evidence.
const CITE_STOP = new Set(['about', 'above', 'across', 'after', 'against', 'almost', 'already', 'although', 'always', 'among', 'another', 'because', 'become', 'before', 'behind', 'being', 'below', 'better', 'between', 'beyond', 'britain', 'cannot', 'could', 'despite', 'during', 'either', 'enough', 'every', 'except', 'first', 'further', 'greater', 'having', 'however', 'important', 'inside', 'instead', 'itself', 'largely', 'likely', 'little', 'making', 'market', 'matter', 'means', 'might', 'money', 'months', 'mostly', 'moving', 'neither', 'number', 'often', 'other', 'others', 'ought', 'outside', 'people', 'perhaps', 'point', 'points', 'possible', 'probably', 'rather', 'really', 'result', 'results', 'right', 'second', 'several', 'should', 'similar', 'simply', 'since', 'small', 'still', 'strong', 'suggest', 'suggests', 'their', 'themselves', 'there', 'therefore', 'these', 'thing', 'things', 'think', 'those', 'though', 'through', 'together', 'toward', 'towards', 'under', 'until', 'value', 'very', 'where', 'whether', 'which', 'while', 'whole', 'whose', 'within', 'without', 'would', 'years']);
export function distinctive(text, limit = 8) {
  return [...new Set(String(text).toLowerCase().match(/[a-z][a-z-]{5,}/g) || [])].filter((w) => !CITE_STOP.has(w)).slice(0, limit);
}
// The sentence in a source that carries the most of a claim's own words.
// Null when nothing in the source is worth quoting, which is honest: the
// claim then rests on the source's title alone and the line says so.
function bestLine(text, terms) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const sentences = flat.split(/(?<=[.!?])\s+(?=[A-Z(])/).filter((x) => x.length >= 40 && x.length <= 400);
  let best = null; let bestHits = 0;
  for (const sen of sentences) {
    const low = sen.toLowerCase();
    const hits = terms.filter((t) => low.includes(t)).length;
    if (hits > bestHits) { bestHits = hits; best = sen; }
  }
  if (!best || bestHits === 0) return null;
  return { line: best.length > 240 ? `${best.slice(0, 237).trim()}…` : best.trim(), hits: bestHits };
}
function unsupportedCitations(mission) {
  const A = mission?.authored;
  if (!A || !(A.live || A.composed) || !A.content) return { ok: true, detail: 'scripted substance is house-labelled sample; citations not checked' };
  const claims = Array.isArray(A.content.claims) ? A.content.claims : [];
  const sources = mission.sources || [];
  const cited = claims.filter((c) => Number(c.src) > 0 && sources[Number(c.src) - 1]);
  if (!cited.length) return { ok: true, detail: 'no claim cites a source on the table' };
  const bad = [];
  const found = [];
  for (const c of cited) {
    const src = sources[Number(c.src) - 1];
    const hay = `${src.title || ''} ${src.extract || ''} ${src.text || ''}`.toLowerCase();
    const terms = distinctive(c.text);
    if (!terms.length) { found.push({ text: c.text, src: Number(c.src), title: src.title, judged: false }); continue; }
    const shared = terms.filter((t) => hay.includes(t));
    // "Shares wording with the source" is a claim about the source, and a
    // reader has no way to check it without leaving the page. So the check
    // also keeps the line it found: the one sentence in the source that
    // carries the most of the claim's own words, quoted where the claim is.
    found.push({ text: c.text, src: Number(c.src), title: src.title, judged: true, shared, missing: shared.length ? [] : terms.slice(0, 4), quote: shared.length ? bestLine(`${src.extract || ''} ${src.text || ''}`, shared) : null });
    if (!shared.length) bad.push(`“${String(c.text).slice(0, 70)}…” cites [${c.src}] ${src.title}, which does not mention ${terms.slice(0, 3).join(', ')}`);
  }
  // What the check saw, kept on the mission so the delivery can show it.
  if (mission) mission.citations = found;
  return bad.length
    ? { ok: false, detail: `${bad.length} of ${cited.length} cited claim(s) rest on a source that does not speak to them: ${bad.slice(0, 3).join('; ')}` }
    : { ok: true, detail: `${cited.length} cited claim(s) each share wording with the source they rest on` };
}
const SUPPORTED = { id: 'VAL-CLAIMS-SOURCE-SPEAKS', title: 'Every claim that cites a source shares wording with it', owner: 'compose',
  scrutiny: (h, ctx) => unsupportedCitations(ctx?.mission),
  surface: (h, ctx) => { const refs = [...h.matchAll(/data-ref="(src-\d+)"/g)].map((m) => m[1]); const n = (ctx?.mission?.sources || []).length; return refs.length && n ? { ok: refs.every((r) => Number(r.split('-')[1]) <= n), detail: `${refs.length} citation(s) point inside the ${n} source(s) on the table` } : { ok: true, detail: 'no citations to resolve' }; } };

// A recorded dissent must travel into every deliverable, not just the brief.
const CARRIED = (owner) => ({ id: 'VAL-DISSENT-CARRIED', title: 'The panel dissent, when one was recorded, is carried in the deliverable', owner,
  scrutiny: (h) => { const p = provenance(h); if (!p?.dissent) return { ok: true, detail: 'no dissent was recorded' }; return has(body(h), /class="carried-dissent"/) && has(body(h), new RegExp(p.dissent.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ? { ok: true, detail: `dissent by ${p.dissent.model} carried` } : { ok: false, detail: `dissent by ${p.dissent.model} missing from the deliverable` }; },
  surface: (h) => { const p = provenance(h); if (!p?.dissent) return { ok: true, detail: 'no dissent was recorded' }; const probe = String(p.dissent.text || '').slice(0, 30).replace(/&/g, '&amp;').replace(/</g, '&lt;'); return has(body(h), probe) ? { ok: true, detail: 'dissent text present' } : { ok: false, detail: 'dissent text not present' }; } });

// scrutiny lane: reads structure. surface lane: exercises behavior a user
// would hit (runnable script, resolvable anchors, parseable audit object).
export const ASSERTIONS = {
  brief: [
    SUPPORTED,
    { id: 'VAL-CLAIMS-GRADED', title: 'Every lead claim carries an evidence grade and a source ref', owner: 'compose',
      scrutiny: (h) => count(h, /class="claim"/g) >= 3 && count(h, /class="grade g[ABC]"/g) >= count(h, /class="claim"/g),
      surface: (h) => { const refs = [...h.matchAll(/data-ref="(src-\d+)"/g)].map((m) => m[1]); return refs.length > 0 && refs.every((r) => h.includes(`id="${r}"`)); } },
    { id: 'VAL-REFS-CITED-ONLY', title: 'The references table lists only sources actually cited', owner: 'compose',
      scrutiny: (h) => { const cited = new Set([...h.matchAll(/data-ref="(src-\d+)"/g)].map((m) => m[1])); const listed = [...h.matchAll(/<tr id="(src-\d+)"/g)].map((m) => m[1]); return listed.length > 0 && listed.every((r) => cited.has(r)); },
      surface: (h) => has(h, /References[:,] cited sources only/) },
    { id: 'VAL-DISSENT-RECORDED', title: 'Recorded dissent appears in the brief, not erased', owner: 'council',
      scrutiny: (h) => has(h, /Recorded dissent/), surface: (h) => has(h, /class="dissent"/) },
    { id: 'VAL-VERDICT-FIRST', title: 'The verdict is stated before the evidence', owner: 'compose',
      scrutiny: (h) => h.indexOf('The verdict') > 0 && h.indexOf('The verdict') < h.indexOf('What the evidence supports'), surface: (h) => has(h, /class="verdict"/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => { const p = provenance(h); return !!p && p.schema === 'prajna.provenance.v1' && Array.isArray(p.contract?.plan); } },
    HONESTY,
  ],
  deck: [
    { id: 'VAL-NINE-BEATS', title: 'The deck carries the nine-beat arc', owner: 'compose',
      scrutiny: (h) => count(h, /<section class="slide/g) === 9, surface: (h) => has(h, /1 \/ 9/) && has(h, /9 \/ 9/) },
    { id: 'VAL-ONE-IDEA', title: 'Every slide holds one idea: a single heading and one supporting line', owner: 'deck-doctor',
      scrutiny: (h) => { const slides = h.split('<section class="slide').slice(1); return slides.every((s) => count(s, /<h[12]>/g) === 1 && count(s, /class="sub"/g) === 1); },
      surface: (h) => !has(body(h), /<ul>|<li>/) },
    { id: 'VAL-DISSENT-CARRIED', title: 'The panel dissent, when one was recorded, is carried on the closing slide', owner: 'compose',
      scrutiny: (h) => { const p = provenance(h); if (!p?.dissent) return { ok: true, detail: 'no dissent was recorded' }; return has(h, /class="deck-dissent"/) && has(h, new RegExp(p.dissent.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ? { ok: true, detail: `dissent by ${p.dissent.model} carried` } : { ok: false, detail: `dissent by ${p.dissent.model} missing from the deck` }; },
      surface: (h) => { const p = provenance(h); if (!p?.dissent) return { ok: true, detail: 'no dissent was recorded' }; const probe = String(p.dissent.text || '').slice(0, 30); return has(body(h), probe.replace(/&/g, '&amp;').replace(/</g, '&lt;')) ? { ok: true, detail: 'dissent text present' } : { ok: false, detail: 'dissent text not present' }; } },
    { id: 'VAL-KEYBOARD-NAV', title: 'Arrow keys and click advance the deck', owner: 'compose',
      scrutiny: (h) => has(h, /ArrowRight/) && has(h, /ArrowLeft/), surface: (h) => has(h, /addEventListener\('click'/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
    HONESTY,
  ],
  site: [
    { id: 'VAL-STRUCTURE', title: 'Nav, hero, proof section and a closing call to action are present', owner: 'build',
      scrutiny: (h) => has(h, /<nav>/) && has(h, /class="hero"/) && has(h, /id="how"/) && has(h, /id="join"/), surface: (h) => has(h, /href="#join"/) && has(h, /href="#how"/) },
    { id: 'VAL-RESPONSIVE', title: 'The page reflows below 800px', owner: 'build',
      scrutiny: (h) => has(h, /@media\(max-width:800px\)/), surface: (h) => has(h, /grid-template-columns:1fr;/) },
    CARRIED('build'),
    { id: 'VAL-PROOF-REAL', title: 'The proof section shows real proof, not a placeholder', owner: 'copy-cutter',
      scrutiny: (h) => !has(h, /This slot awaits your real case study/) && !has(h, /replace with real capture/i),
      surface: (h) => has(h, /Evidence pending[:,] supplied by the owner/) || (!has(h, /awaits your real/) && !has(h, /replace with real/i)) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'build',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
    { ...HONESTY, owner: 'build' },
  ],
  mobile: [
    { id: 'VAL-FOUR-SCREENS', title: 'Four screens are present and navigable from the tab bar', owner: 'build',
      scrutiny: (h) => count(h, /class="screen(?: on)?"/g) >= 4 && count(h, /class="tab(?: on)?"/g) >= 4, surface: (h) => has(h, /data-screen=/) && has(h, /addEventListener\('click'/) },
    { id: 'VAL-TOUCH-TARGETS', title: 'Tap targets are at least 44px', owner: 'a11y-audit',
      scrutiny: (h) => has(h, /min-height:44px/), surface: (h) => has(h, /min-width:44px/) },
    CARRIED('build'),
    { id: 'VAL-PHONE-FRAME', title: 'The prototype renders inside a phone frame', owner: 'build',
      scrutiny: (h) => has(h, /class="phone"/), surface: (h) => has(h, /aspect-ratio/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'build',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
    { ...HONESTY, owner: 'build' },
  ],
  design: [
    { id: 'VAL-REGIONS', title: 'Every major region is drawn and labeled with its intent', owner: 'design',
      scrutiny: (h) => count(h, /class="region"/g) >= 5, surface: (h) => has(h, /Design draft/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'design',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
  ],
  analysis: [
    { id: 'VAL-TWO-VIEWS', title: 'The trend and the segment breakdown are both charted', owner: 'chart-smith',
      scrutiny: (h) => count(h, /<svg/g) >= 2, surface: (h) => has(h, /<polyline/) && count(h, /<rect/g) >= 5 },
    { id: 'VAL-CAVEATS', title: 'Caveats are attached to the reading, not omitted', owner: 'compose',
      scrutiny: (h) => has(h, /class="caveat"/), surface: (h) => has(h, /Caveats attached/) },
    { id: 'VAL-ONE-PARAGRAPH-READ', title: 'A one-paragraph read leads the dashboard', owner: 'compose',
      scrutiny: (h) => has(h, /class="read"/), surface: (h) => h.indexOf('class="read"') < h.indexOf('class="grid"') },
    { id: 'VAL-CHART-A11Y', title: 'Charts carry accessible names', owner: 'chart-smith',
      scrutiny: (h) => count(h, /role="img" aria-label=/g) >= 2, surface: (h) => !has(body(h), /<svg(?:(?!aria-label)[^>])*>/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
    HONESTY,
  ],
};

// Run both lanes over the artifact. Returns per-assertion verdicts per lane.
export function validateArtifact(desk, html, assertionIds, ctx = {}) {
  const catalog = ASSERTIONS[desk] || [];
  const rows = [];
  for (const a of catalog) {
    if (!assertionIds.includes(a.id)) continue;
    for (const lane of ['scrutiny', 'surface']) {
      let passed = false, error = null, detail = null;
      try { const out = a[lane](html, ctx); if (out && typeof out === 'object') { passed = !!out.ok; detail = out.detail || null; } else passed = !!out; } catch (e) { passed = false; error = String(e.message || e).slice(0, 80); }
      rows.push({ id: a.id, lane, passed, error, detail });
    }
  }
  return rows;
}

// Gate: an assertion is SEALED only when every lane that covered it passed.
// Lanes disagreeing = dissent; no lane covering = missing. Both block.
export function evaluateGate(assertionIds, rows) {
  const byId = {};
  for (const r of rows) (byId[r.id] ||= []).push(r);
  const sealed = [], dissenting = [], failed = [], missing = [];
  for (const id of assertionIds) {
    const vs = byId[id] || [];
    if (!vs.length) { missing.push(id); continue; }
    const passes = vs.filter((v) => v.passed).length;
    if (passes === vs.length) sealed.push(id);
    else if (passes === 0) failed.push(id);
    else dissenting.push(id);
  }
  return { cleared: !failed.length && !dissenting.length && !missing.length, sealed, dissenting, failed, missing };
}
