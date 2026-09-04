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

// The Browser tool: read the pages a ticket names. Server-side fetch, no
// scripts run, one megabyte and eight seconds per page, three pages at most,
// and never a private address unless a test says so. Each page becomes a
// source like any other: title, address, date read, extract, word count.
const PAGE_LIMIT = 3, PAGE_BYTES = 1024 * 1024, PAGE_MS = 8000;
export function urlsIn(text) {
  return [...new Set((String(text || '').match(/https?:\/\/[^\s<>"')\]]+/g) || []).map((u) => u.replace(/[.,;:!?]+$/, '')))].slice(0, PAGE_LIMIT);
}
function privateHost(h) {
  h = h.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h) || /^fc|^fd|^fe80/i.test(h);
}
const strip = (html) => String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, ' ').replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
export async function readPage(url, { allowLocal = process.env.PRAJNA_ALLOW_LOCAL_PAGES === '1' } = {}) {
  let u; try { u = new URL(url); } catch { return { url, error: 'not a valid address' }; }
  if (!/^https?:$/.test(u.protocol)) return { url, error: 'only http and https are read' };
  if (!allowLocal && privateHost(u.hostname)) return { url, error: 'private addresses are never read' };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), PAGE_MS);
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) return { url, error: `HTTP ${r.status}` };
    const type = String(r.headers.get('content-type') || '');
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return { url, error: `not a text page (${type.split(';')[0] || 'unknown type'})` };
    const raw = (await r.text()).slice(0, PAGE_BYTES);
    const title = (raw.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || u.hostname;
    const text = /text\/plain/.test(type) ? raw.trim() : strip(raw);
    const words = text.split(/\s+/).filter(Boolean).length;
    return { title, url: u.href, kind: 'page', engine: 'page', retrieved: new Date().toISOString().slice(0, 10), extract: text.replace(/\s+/g, ' ').slice(0, 700), text: text.slice(0, 20000), words };
  } catch (e) { return { url, error: e.name === 'AbortError' ? 'took longer than eight seconds' : String(e.message || e).slice(0, 80) }; }
  finally { clearTimeout(t); }
}
export async function readPages(urls) { return Promise.all(urlsIn(urls.join(' ')).map((u) => readPage(u))); }

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
