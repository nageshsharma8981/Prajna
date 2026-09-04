// Real retrieval for the research desk. No key needed: the open Wikipedia
// API supplies titled, linked, dated sources with extracts. Everything that
// comes back is recorded as-is (title, url, retrieved date, extract) and can
// be cited by a live author — a scripted author never cites them, because
// scripted claims were not derived from them. Failures are reported, not
// hidden.
const TIMEOUT_MS = 9000;
const UA = 'Prajna/0.9 (outcome exchange; research desk retrieval)';

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Strip question framing so the search engine sees the subject.
export function queryFor(goal) {
  return String(goal).replace(/^(should we|can we|is it|what is|what are|state of|analy[sz]e|research|brief on|write a brief on)\s+/i, '').replace(/[?.!]+$/, '').slice(0, 120);
}

export async function retrieve(goal, { limit = 5 } = {}) {
  const q = queryFor(goal);
  const base = 'https://en.wikipedia.org/w/api.php';
  const search = await get(`${base}?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${limit}&srprop=wordcount`);
  const hits = search?.query?.search || [];
  if (!hits.length) return { query: q, sources: [] };
  const ids = hits.map((h) => h.pageid).join('|');
  const ex = await get(`${base}?action=query&prop=extracts|info&exintro=1&explaintext=1&exchars=700&inprop=url&pageids=${ids}&format=json`);
  const pages = ex?.query?.pages || {};
  const retrieved = new Date().toISOString().slice(0, 10);
  const sources = hits.map((h, i) => {
    const pg = pages[h.pageid] || {};
    return {
      id: `src-${i + 1}`, title: h.title, url: pg.fullurl || `https://en.wikipedia.org/?curid=${h.pageid}`,
      kind: 'encyclopedia', retrieved, words: h.wordcount || null,
      extract: String(pg.extract || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    };
  }).filter((s) => s.extract);
  return { query: q, sources };
}
