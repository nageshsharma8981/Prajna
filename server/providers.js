// BYOK provider adapters — zero dependencies, plain fetch. A user's own key
// makes a panel seat LIVE: its position on the tape is a real model call.
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
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    },
  },
};

export async function callModel({ provider, key, baseUrl, modelId, prompt, maxTokens }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider "${provider}".`);
  if (!key) throw new Error(`No key on file for ${p.label}.`);
  const text = await p.call({ key, baseUrl, modelId, prompt, maxTokens });
  if (!text) throw new Error(`${p.label} returned an empty reply.`);
  return text;
}

// A cheap round-trip that proves the key + model id actually work.
export async function testKey({ provider, key, baseUrl, modelId }) {
  const started = Date.now();
  const text = await callModel({ provider, key, baseUrl, modelId, prompt: 'Reply with the single word: ready', maxTokens: 8 });
  return { ok: true, ms: Date.now() - started, sample: text.slice(0, 40) };
}

export function maskKey(key) {
  if (!key) return null;
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}
