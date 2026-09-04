// Composing without a model. When no key is loaded the house cannot form a
// judgement, and it says so. What it can do honestly is report: if real
// sources are on the table, every claim in the brief is a quotation from
// one of them, carrying its address and the date it was read. Nothing is
// invented, nothing is graded, and the absence of judgement is stated in
// the lede rather than hidden behind sample prose.
const STOP = new Set(['should', 'would', 'could', 'about', 'their', 'there', 'which', 'while', 'these', 'those', 'where', 'what', 'when', 'with', 'from', 'into', 'that', 'this', 'have', 'been', 'were', 'will', 'they', 'them', 'than', 'then', 'your', 'ours', 'over', 'under', 'does', 'make', 'more', 'most', 'much', 'many', 'enter', 'market']);
const words = (s) => String(s || '').toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
const keywords = (goal) => [...new Set(words(goal).filter((w) => !STOP.has(w)))];

// Sentences long enough to stand alone, short enough to quote, and actually
// sentences: a page begins with its own title and headings, and a heading
// quoted as a finding would be a lie about what the source says.
function sentences(text) {
  // Line breaks are where a heading ends, so split on them before sentences;
  // collapsing them first would glue a heading onto the first real sentence.
  return String(text || '').split(/\n+/)
    .flatMap((line) => line.trim().split(/(?<=[.!?])\s+(?=[A-Z(])/))
    .map((x) => x.replace(/[^\S\n]+/g, ' ').trim())
    .filter((x) => x.length >= 60 && x.length <= 320 && /[a-z]/.test(x));
}
function headingish(sentence, title) {
  const w = sentence.split(/\s+/);
  if (w.length < 10) return true;
  if (w.filter((x) => /^[A-Z]/.test(x)).length / w.length > 0.5) return true; // a run of Title Case
  const t = String(title || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return !!(t.length > 8 && sentence.toLowerCase().includes(t.slice(0, Math.min(30, t.length))));
}

// Every quotable sentence in the house, tagged with the source it came from
// and how well it answers the question.
function candidates(mission, keys) {
  const out = [];
  (mission.sources || []).forEach((s, i) => {
    const seen = new Set();
    for (const text of sentences(s.text || s.extract)) {
      if (headingish(text, s.title)) continue;
      const key = text.slice(0, 40).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const low = text.toLowerCase();
      out.push({ text, src: i + 1, source: s, score: keys.reduce((a, k) => a + (low.includes(k) ? 1 : 0), 0) });
    }
  });
  return out.sort((a, b) => b.score - a.score);
}

// The research desk only: a deck or a landing page cannot be quoted together
// out of sources, but a brief can, and that is exactly what a brief is for.
export function composeBrief(mission) {
  const keys = keywords(mission.goal);
  const all = candidates(mission, keys);
  if (!all.length) return null;
  // One quotation from each source first, so no single page speaks for the
  // brief; then the next best, up to five. The gate wants three graded claims,
  // and fewer than three quotations is not a brief, so the house declines.
  const picked = [], usedSrc = new Set();
  for (const c of all) if (!usedSrc.has(c.src)) { picked.push(c); usedSrc.add(c.src); }
  for (const c of all) { if (picked.length >= 5) break; if (!picked.includes(c)) picked.push(c); }
  if (picked.length < 3) return null;
  const claims = picked.slice(0, 5).map((c) => ({
    text: c.text.length > 200 ? `${c.text.slice(0, 197)}…` : c.text,
    grade: 'C',
    detail: `Quoted from ${c.source.title}${c.source.url ? `, ${c.source.url}` : ''}, read ${c.source.retrieved}. The house did not weigh this: no model was loaded, so it is reported, not graded.`,
    src: c.src,
  }));
  const named = [...new Set(picked.map((c) => c.source.title))].slice(0, 3).join('; ');
  return {
    stand: `No model was loaded for this run, so the house forms no judgement: this brief reports what ${usedSrc.size} source${usedSrc.size === 1 ? '' : 's'} on the table say about the question.`,
    verdict: `The house cannot recommend a course of action without a model to weigh the evidence, and it will not pretend otherwise. What follows is quoted from ${named}, each claim carrying the address it came from and the date it was read. Load a key under Your keys and amend this ticket to get a graded judgement with dissent on the record.`,
    claims,
    refuted: [],
    moves: [],
    tripwires: 'No tripwires are set here: nothing in this brief was judged, only quoted.',
    dissent: { seat: 'the house', text: 'No panel weighed this brief, so there is no dissent to carry. That absence is itself on the record.' },
    composedFrom: usedSrc.size,
  };
}

export function composeFor(mission) {
  return mission.desk === 'brief' ? composeBrief(mission) : null;
}
