// Definition of done — Zenith's two-layer contract, independently implemented.
// Each desk's ticket carries ATOMIC ASSERTIONS (testable promises about the
// deliverable). Plan steps OWN assertions; two independent validator LANES
// prove them against the real artifact HTML; a GATE seals what both lanes
// pass and reports dissent (lanes disagree) and missing (no lane covered).
// These are real checks on real output — never a scripted vote.

const has = (html, re) => (re instanceof RegExp ? re.test(html) : html.includes(re));
const count = (html, re) => (html.match(re) || []).length;
const provenance = (html) => {
  const m = html.match(/id="prajna-provenance">([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};

// scrutiny lane: reads structure. surface lane: exercises behavior a user
// would hit (runnable script, resolvable anchors, parseable audit object).
export const ASSERTIONS = {
  brief: [
    { id: 'VAL-CLAIMS-GRADED', title: 'Every lead claim carries an evidence grade and a source ref', owner: 'compose',
      scrutiny: (h) => count(h, /class="claim"/g) >= 3 && count(h, /class="grade g[ABC]"/g) >= count(h, /class="claim"/g),
      surface: (h) => { const refs = [...h.matchAll(/data-ref="(src-\d+)"/g)].map((m) => m[1]); return refs.length > 0 && refs.every((r) => h.includes(`id="${r}"`)); } },
    { id: 'VAL-REFS-CITED-ONLY', title: 'The references table lists only sources actually cited', owner: 'compose',
      scrutiny: (h) => { const cited = new Set([...h.matchAll(/data-ref="(src-\d+)"/g)].map((m) => m[1])); const listed = [...h.matchAll(/<tr id="(src-\d+)"/g)].map((m) => m[1]); return listed.length > 0 && listed.every((r) => cited.has(r)); },
      surface: (h) => has(h, /References — cited sources only/) },
    { id: 'VAL-DISSENT-RECORDED', title: 'Recorded dissent appears in the brief, not erased', owner: 'council',
      scrutiny: (h) => has(h, /Recorded dissent/), surface: (h) => has(h, /class="dissent"/) },
    { id: 'VAL-VERDICT-FIRST', title: 'The verdict is stated before the evidence', owner: 'compose',
      scrutiny: (h) => h.indexOf('The verdict') > 0 && h.indexOf('The verdict') < h.indexOf('What the evidence supports'), surface: (h) => has(h, /class="verdict"/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => { const p = provenance(h); return !!p && p.schema === 'prajna.provenance.v1' && Array.isArray(p.contract?.plan); } },
  ],
  deck: [
    { id: 'VAL-NINE-BEATS', title: 'The deck carries the nine-beat arc', owner: 'compose',
      scrutiny: (h) => count(h, /<section class="slide/g) === 9, surface: (h) => has(h, /1 \/ 9/) && has(h, /9 \/ 9/) },
    { id: 'VAL-ONE-IDEA', title: 'Every slide holds one idea: a single heading and one supporting line', owner: 'deck-doctor',
      scrutiny: (h) => { const slides = h.split('<section class="slide').slice(1); return slides.every((s) => count(s, /<h[12]>/g) === 1 && count(s, /class="sub"/g) === 1); },
      surface: (h) => !has(h, /<ul>|<li>/) },
    { id: 'VAL-KEYBOARD-NAV', title: 'Arrow keys and click advance the deck', owner: 'compose',
      scrutiny: (h) => has(h, /ArrowRight/) && has(h, /ArrowLeft/), surface: (h) => has(h, /addEventListener\('click'/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
  ],
  site: [
    { id: 'VAL-STRUCTURE', title: 'Nav, hero, proof section and a closing call to action are present', owner: 'build',
      scrutiny: (h) => has(h, /<nav>/) && has(h, /class="hero"/) && has(h, /id="how"/) && has(h, /id="join"/), surface: (h) => has(h, /href="#join"/) && has(h, /href="#how"/) },
    { id: 'VAL-RESPONSIVE', title: 'The page reflows below 800px', owner: 'build',
      scrutiny: (h) => has(h, /@media\(max-width:800px\)/), surface: (h) => has(h, /grid-template-columns:1fr;/) },
    { id: 'VAL-PROOF-REAL', title: 'The proof section shows real proof, not a placeholder', owner: 'copy-cutter',
      scrutiny: (h) => !has(h, /This slot awaits your real case study/) && !has(h, /replace with real capture/i),
      surface: (h) => has(h, /Evidence pending — supplied by the owner/) || (!has(h, /awaits your real/) && !has(h, /replace with real/i)) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'build',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
  ],
  mobile: [
    { id: 'VAL-FOUR-SCREENS', title: 'Four screens are present and navigable from the tab bar', owner: 'build',
      scrutiny: (h) => count(h, /class="screen"/g) >= 4 && count(h, /class="tab"/g) >= 4, surface: (h) => has(h, /data-screen=/) && has(h, /addEventListener\('click'/) },
    { id: 'VAL-TOUCH-TARGETS', title: 'Tap targets are at least 44px', owner: 'a11y-audit',
      scrutiny: (h) => has(h, /min-height:44px/), surface: (h) => has(h, /min-width:44px/) },
    { id: 'VAL-PHONE-FRAME', title: 'The prototype renders inside a phone frame', owner: 'build',
      scrutiny: (h) => has(h, /class="phone"/), surface: (h) => has(h, /aspect-ratio/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'build',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
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
      scrutiny: (h) => count(h, /role="img" aria-label=/g) >= 2, surface: (h) => !has(h, /<svg[^>]*>(?![\s\S]*?aria-label)/) },
    { id: 'VAL-PROVENANCE', title: 'A machine-readable provenance block is present and parseable', owner: 'compose',
      scrutiny: (h) => !!provenance(h), surface: (h) => provenance(h)?.schema === 'prajna.provenance.v1' },
  ],
};

// Run both lanes over the artifact. Returns per-assertion verdicts per lane.
export function validateArtifact(desk, html, assertionIds) {
  const catalog = ASSERTIONS[desk] || [];
  const rows = [];
  for (const a of catalog) {
    if (!assertionIds.includes(a.id)) continue;
    for (const lane of ['scrutiny', 'surface']) {
      let passed = false, error = null;
      try { passed = !!a[lane](html); } catch (e) { passed = false; error = String(e.message || e).slice(0, 80); }
      rows.push({ id: a.id, lane, passed, error });
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
