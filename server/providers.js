// BYOK provider adapters, zero dependencies, plain fetch. A user's own key
// makes a panel model LIVE: its position on the tape is a real model call.
// Keys never leave the server; failures fall back to the scripted voice and
// are recorded on the tape, never hidden.

const TIMEOUT_MS = 25000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

async function readJson(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

// Brave Search: a BYOK web-search key widens the research desk's retrieval
// beyond the open encyclopedia. Same rule as model keys: memory only.
export async function braveSearch({ key, baseUrl, q, count = 5 }) {
  const base = (baseUrl || 'https://api.search.brave.com').replace(/\/$/, '');
  const r = await withTimeout(fetch(`${base}/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}&text_decorations=0`, {
    headers: { accept: 'application/json', 'x-subscription-token': key },
  }), TIMEOUT_MS, 'Brave Search');
  const j = await readJson(r);
  if (!r.ok) throw new Error(j?.message || j?.error?.detail || `Brave ${r.status}`);
  return (j.web?.results || []).map((x) => ({ title: x.title, url: x.url, description: String(x.description || '').replace(/<[^>]+>/g, ''), age: x.age || x.page_age || null }));
}

// Hosted image generation on the user's own key. OpenAI-compatible hosts
// (gpt-image-1 by default) and Gemini image models. Returns bytes + mime.
export async function generateImage({ provider, key, baseUrl, modelId, prompt, size = '1024x1024' }) {
  if (!key) throw new Error('No key on file for that provider.');
  if (provider === 'openai') {
    const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const r = await withTimeout(fetch(`${base}/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId || 'gpt-image-1', prompt, n: 1, size }),
    }), 120000, 'Image generation');
    const j = await readJson(r);
    if (!r.ok) throw new Error(j?.error?.message || j?.raw || `HTTP ${r.status}`);
    const d = j.data?.[0] || {};
    if (d.b64_json) return { bytes: Buffer.from(d.b64_json, 'base64'), mime: 'image/png', model: modelId || 'gpt-image-1' };
    if (d.url) { const img = await withTimeout(fetch(d.url), 60000, 'Image download'); return { bytes: Buffer.from(await img.arrayBuffer()), mime: img.headers.get('content-type') || 'image/png', model: modelId || 'gpt-image-1' }; }
    throw new Error('The provider returned no image.');
  }
  if (provider === 'google') {
    const model = modelId || 'gemini-2.5-flash-image';
    const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
    }), 120000, 'Gemini image');
    const j = await readJson(r);
    if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
    const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!part) throw new Error('Gemini returned no image part.');
    return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType || 'image/png', model };
  }
  throw new Error(`${PROVIDERS[provider]?.label || provider} does not generate images.`);
}

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    hint: 'Console key (sk-ant-…). Models: claude-opus-5, claude-sonnet-5, claude-haiku-4-5-20251001.',
    async call({ key, modelId, prompt, maxTokens = 400 }) {
      const r = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelId, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      }), TIMEOUT_MS, 'Anthropic');
      const j = await readJson(r);
      if (!r.ok) throw new Error(j?.error?.message || `Anthropic ${r.status}`);
      lastUsage = { prompt: j.usage?.input_tokens ?? null, completion: j.usage?.output_tokens ?? null };
      return (j.content || []).map((c) => c.text || '').join('').trim();
    },
  },
  openai: {
    label: 'OpenAI-compatible',
    hint: 'Works for OpenAI, DeepSeek, Groq, Together, Ollama… set the base URL for non-OpenAI hosts (e.g. https://api.deepseek.com/v1).',
    async call({ key, modelId, prompt, baseUrl, maxTokens = 400 }) {
      const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const r = await withTimeout(fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      }), TIMEOUT_MS, 'OpenAI-compatible');
      const j = await readJson(r);
      if (!r.ok) throw new Error(j?.error?.message || j?.raw || `HTTP ${r.status}`);
      lastUsage = { prompt: j.usage?.prompt_tokens ?? null, completion: j.usage?.completion_tokens ?? null };
      return (j.choices?.[0]?.message?.content || '').trim();
    },
  },
  google: {
    label: 'Google Gemini',
    hint: 'AI Studio key. Models: gemini-2.5-pro, gemini-2.5-flash (or newer ids).',
    async call({ key, modelId, prompt, maxTokens = 400 }) {
      const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      }), TIMEOUT_MS, 'Gemini');
      const j = await readJson(r);
      if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
      lastUsage = { prompt: j.usageMetadata?.promptTokenCount ?? null, completion: j.usageMetadata?.candidatesTokenCount ?? null };
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    },
  },
  brave: {
    label: 'Brave Search',
    kind: 'search',
    hint: 'Web-search key (api.search.brave.com). Not a model: it widens the research desk\'s retrieval beyond the open encyclopedia.',
    async call() { throw new Error('Brave Search is a search key, not a model.'); },
  },
};

// Streaming variants: same adapters, token deltas delivered to onDelta as
// they arrive. Returns the full text. A 90s wall clock bounds the stream.
async function readSse(r, onEvent) {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try { onEvent(JSON.parse(data)); } catch { /* keep-alive or partial */ }
    }
  }
}

const STREAMERS = {
  async anthropic({ key, modelId, prompt, maxTokens, onDelta, signal }) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelId, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error((await readJson(r))?.error?.message || `Anthropic ${r.status}`);
    let text = '';
    await readSse(r, (e) => { const d = e.type === 'content_block_delta' ? e.delta?.text : ''; if (d) { text += d; onDelta(d); } });
    return text;
  },
  async openai({ key, modelId, prompt, baseUrl, maxTokens, onDelta, signal }) {
    const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const r = await fetch(`${base}/chat/completions`, { method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error((await readJson(r))?.error?.message || `HTTP ${r.status}`);
    let text = '';
    await readSse(r, (e) => { const d = e.choices?.[0]?.delta?.content; if (d) { text += d; onDelta(d); } });
    return text;
  },
  async google({ key, modelId, prompt, maxTokens, onDelta, signal }) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, { method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }) });
    if (!r.ok) throw new Error((await readJson(r))?.error?.message || `Gemini ${r.status}`);
    let text = '';
    await readSse(r, (e) => { const d = (e.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''); if (d) { text += d; onDelta(d); } });
    return text;
  },
};

export async function streamModel({ provider, key, baseUrl, modelId, prompt, maxTokens = 900, onDelta = () => {} }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider "${provider}".`);
  if (!key) throw new Error(`No key on file for ${p.label}.`);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const text = await STREAMERS[provider]({ key, baseUrl, modelId, prompt, maxTokens, onDelta, signal: ctl.signal });
    if (!text) throw new Error(`${p.label} returned an empty reply.`);
    return text;
  } finally { clearTimeout(t); }
}

// What the provider itself said the last call used. Never estimated: when a
// provider reports nothing, the house records nothing rather than guessing.
let lastUsage = null;
export function takeUsage() { const u = lastUsage; lastUsage = null; return u && (u.prompt !== null || u.completion !== null) ? u : null; }

export async function callModel({ provider, key, baseUrl, modelId, prompt, maxTokens }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider "${provider}".`);
  if (p.kind === 'search') throw new Error(`${p.label} is a search key, not a model.`);
  if (!key) throw new Error(`No key on file for ${p.label}.`);
  lastUsage = null;
  const text = await p.call({ key, baseUrl, modelId, prompt, maxTokens });
  if (!text) throw new Error(`${p.label} returned an empty reply.`);
  return text;
}

// A cheap round-trip that proves the key + model id actually work.
export async function testKey({ provider, key, baseUrl, modelId }) {
  const started = Date.now();
  if (PROVIDERS[provider]?.kind === 'search') {
    const hits = await braveSearch({ key, baseUrl, q: 'outcome exchange', count: 1 });
    return { ok: true, ms: Date.now() - started, sample: hits[0] ? hits[0].title.slice(0, 40) : 'no results', modelId: 'web search' };
  }
  const text = await callModel({ provider, key, baseUrl, modelId, prompt: 'Reply with the single word: ready', maxTokens: 8 });
  return { ok: true, ms: Date.now() - started, sample: text.slice(0, 40) };
}

export function maskKey(key) {
  if (!key) return null;
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}
