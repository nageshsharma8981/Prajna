// Real retrieval for the research desk. Two engines: a BYOK Brave Search key
// (memory only, like every key) widens the sweep to the live web; the open
// Wikipedia API needs no key and always runs. Every source is recorded as-is
// (title, url, retrieved date, extract, engine). A live author may cite them;
// a scripted author never does, because scripted claims were not derived
// from them. Failures are reported per engine, not hidden.
import { store } from './store.js';
import { braveSearch } from './providers.js';
import { ws } from './workspace.js';

const TIMEOUT_MS = 9000;
const UA = 'Prajna/0.11 (contract-first agent workspace; research desk retrieval)';

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
  return String(goal).replace(/^(should we|can we|is it|what is|what are|state of|analy[sz]e|research|brief on|write a brief on)\s+/i, '').replace(/^(enter|build|launch|start)\s+(the\s+)?/i, '').replace(/[?.!]+$/, '').slice(0, 120);
}

async function wikipedia(q, limit, retrieved) {
  const base = 'https://en.wikipedia.org/w/api.php';
  const search = await get(`${base}?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${limit}&srprop=wordcount`);
  const hits = search?.query?.search || [];
  if (!hits.length) return [];
  const ids = hits.map((h) => h.pageid).join('|');
  const ex = await get(`${base}?action=query&prop=extracts|info&exintro=1&explaintext=1&exchars=700&inprop=url&pageids=${ids}&format=json`);
  const pages = ex?.query?.pages || {};
  return hits.map((h) => {
    const pg = pages[h.pageid] || {};
    return { title: h.title, url: pg.fullurl || `https://en.wikipedia.org/?curid=${h.pageid}`, kind: 'encyclopedia', engine: 'wikipedia', retrieved, extract: String(pg.extract || '').replace(/\s+/g, ' ').trim().slice(0, 700) };
  }).filter((s) => s.extract);
}

async function brave(q, limit, retrieved) {
  const k = store.keyFor('brave');
  if (!k) return null; // no key: engine not attempted
  if (!(ws().plugins || []).includes('web-search')) return null; // plugin off: the key is not used
  const hits = await braveSearch({ key: k.key, baseUrl: k.baseUrl, q, count: limit });
  return hits.map((h) => ({ title: h.title, url: h.url, kind: 'web', engine: 'brave', retrieved, age: h.age, extract: h.description.slice(0, 700) })).filter((s) => s.title && s.url);
}

export async function retrieve(goal, { limit = 5 } = {}) {
  const q = queryFor(goal);
  const retrieved = new Date().toISOString().slice(0, 10);
  const engines = {};
  const [b, w] = await Promise.allSettled([brave(q, limit, retrieved), wikipedia(q, store.keyFor('brave') ? 3 : limit, retrieved)]);
  let sources = [];
  if (b.status === 'fulfilled') { if (b.value) { engines.brave = { ok: true, count: b.value.length }; sources.push(...b.value); } }
  else engines.brave = { ok: false, error: String(b.reason?.message || b.reason).slice(0, 120) };
  if (w.status === 'fulfilled') { engines.wikipedia = { ok: true, count: w.value.length }; sources.push(...w.value); }
  else engines.wikipedia = { ok: false, error: String(w.reason?.message || w.reason).slice(0, 120) };
  if (!sources.length && Object.values(engines).every((e) => !e.ok)) throw new Error(Object.entries(engines).map(([k, e]) => `${k}: ${e.error}`).join('; '));
  const seen = new Set();
  sources = sources.filter((s) => { const u = s.url.replace(/\/$/, ''); if (seen.has(u)) return false; seen.add(u); return true; }).slice(0, 8).map((s, i) => ({ id: `src-${i + 1}`, ...s }));
  return { query: q, sources, engines };
}
