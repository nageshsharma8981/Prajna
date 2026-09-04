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

// The analysis desk, composed from the file the owner attached. Nothing here
// is estimated, extrapolated or interpreted: every figure is arithmetic over
// the rows as supplied, and the read says plainly that no model weighed them.
const n2 = (x) => (Math.abs(Number(x)) >= 1000 ? Math.round(Number(x)).toLocaleString('en-GB') : String(Math.round(Number(x) * 100) / 100));
export function composeAnalysis(mission) {
  const d = mission.data || mission.contract?.data;
  if (!d || !d.series || !Array.isArray(d.series.points) || d.series.points.length < 2 || !d.stats) return null;
  const pts = d.series.points, st = d.stats, col = d.series.column, by = d.series.labelColumn;
  const first = pts[0], last = pts.at(-1);
  const change = st.first === 0 ? null : Math.round(((st.last - st.first) / Math.abs(st.first)) * 1000) / 10;
  const top = [...pts].sort((a, b) => b.value - a.value)[0];
  const bottom = [...pts].sort((a, b) => a.value - b.value)[0];
  const read = [
    `${d.name} holds ${d.rows} row${d.rows === 1 ? '' : 's'} across ${d.columns.length} column${d.columns.length === 1 ? '' : 's'}, and this analysis plots ${col}${by ? ` by ${by}` : ''}.`,
    `${col} runs from ${n2(st.first)}${first.label ? ` at ${first.label}` : ''} to ${n2(st.last)}${last.label ? ` at ${last.label}` : ''}${change === null ? '' : `, a change of ${change > 0 ? '+' : ''}${change}%`}.`,
    `The highest point is ${n2(st.max)}${top.label ? ` at ${top.label}` : ''} and the lowest ${n2(st.min)}${bottom.label ? ` at ${bottom.label}` : ''}; the mean across ${pts.length} point${pts.length === 1 ? '' : 's'} is ${n2(st.mean)} and they sum to ${n2(st.sum)}.`,
    'No model was loaded for this run, so the house formed no view of what any of it means. These are the numbers as they are in your file, counted, not interpreted.',
  ].join(' ');
  let segment = `No segment column was found in ${d.name}, so there is nothing to break down.`;
  if (d.segments && d.segments.items?.length) {
    const items = d.segments.items, total = items.reduce((a, x) => a + x.value, 0) || 1;
    const share = (v) => Math.round((v / total) * 1000) / 10;
    segment = `${d.segments.column}: ${items[0].name} is largest at ${n2(items[0].value)}, ${share(items[0].value)}% of the ${n2(total)} total${items.length > 1 ? `, and ${items.at(-1).name} smallest at ${n2(items.at(-1).value)}, ${share(items.at(-1).value)}%` : ''}.`;
  }
  return {
    read,
    trend: `${col}${by ? ` by ${by}` : ''}, ${pts.length} point${pts.length === 1 ? '' : 's'} from ${d.name}`,
    segment,
    caveat: `Every figure here is arithmetic over ${d.name} exactly as you attached it: ${d.rows} rows, nothing estimated, nothing extrapolated, no series generated by the house. What the numbers mean was not judged, because no model was loaded to judge it. Load a key under Your keys and amend this ticket for a read with a cause and a recommendation.`,
    composedFrom: d.rows,
  };
}

// What the house did, in its own words, so the tape and the provenance say
// the true thing for the desk that was composed.
export function composeFor(mission) {
  if (mission.desk === 'brief') {
    const content = composeBrief(mission);
    return content && { content, via: 'the house, quoting the sources',
      log: `No model is loaded, so the house composed the brief from the ${content.composedFrom} real source(s) on the table: every claim is a quotation with its address, nothing invented, nothing graded.` };
  }
  if (mission.desk === 'analysis') {
    const content = composeAnalysis(mission);
    const name = (mission.data || mission.contract?.data)?.name;
    return content && { content, via: 'the house, counting the rows',
      log: `No model is loaded, so the house composed the read from ${name}: ${content.composedFrom} rows counted, every figure arithmetic over your file, nothing estimated and nothing interpreted.` };
  }
  return null;
}
