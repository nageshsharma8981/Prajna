// Your keys (BYOK): bring your own provider keys and your own models. A seat
// whose provider has a key goes LIVE — its panel position is a real model
// call billed to you, not to house credits. Keys stay on this machine.
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

async function send(url, method, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request refused (${r.status}).`);
  return j;
}

function ProviderCard({ id, meta, saved, models, onChange }) {
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const houseSeat = models.find((m) => m.provider === id);

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await send(`/api/keys/${id}`, 'PUT', { key, baseUrl }); setMsg(`Saved as ${r.masked}. Seats on ${meta.label} are now live.`); setKey(''); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await send(`/api/keys/${id}/test`, 'POST', { key: key || undefined, baseUrl: baseUrl || undefined }); setMsg(`Live: ${r.modelId} answered in ${r.ms}ms (“${r.sample}”).`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await send(`/api/keys/${id}`, 'DELETE'); setMsg('Key removed. Seats on this provider are scripted again.'); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="key-card" role="group" aria-label={`${meta.label} key`}>
      <div className="key-head">
        <b>{meta.label}</b>
        <span className={`sflap ${saved ? 'LIVE' : 'QUEUED'}`}>{saved ? 'LIVE' : 'NO KEY'}</span>
      </div>
      <p className="key-hint">{meta.hint}</p>
      {saved && <p className="key-saved">On file: <code>{saved.masked}</code>{saved.baseUrl ? <> · base URL <code>{saved.baseUrl}</code></> : null}</p>}
      <div className="key-form">
        <input type="password" autoComplete="off" className="key-input" placeholder={saved ? 'Replace key…' : 'Paste key…'} value={key} onChange={(e) => setKey(e.target.value)} aria-label={`${meta.label} API key`} />
        {id === 'openai' && (
          <input className="key-input" placeholder="Base URL (optional, e.g. https://api.deepseek.com/v1)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label="Base URL" />
        )}
        <div className="key-actions">
          <button className="btn-stamp attn-btn" onClick={save} disabled={busy || !key}>Save key</button>
          <button className="btn-quiet" onClick={test} disabled={busy || (!key && !saved)} title={houseSeat ? `Pings ${houseSeat.modelId}` : ''}>Test</button>
          {saved && <button className="btn-quiet" onClick={remove} disabled={busy}>Remove</button>}
        </div>
      </div>
      {msg && <p className="key-msg" role="status">{msg}</p>}
      {err && <p className="key-err" role="alert">{err}</p>}
    </div>
  );
}

export default function Keys() {
  const s = useStore();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [modelId, setModelId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>Keys are unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening your keys…</p></div>;

  const custom = s.models.filter((m) => m.custom);
  const addModel = async () => {
    setBusy(true); setErr(null);
    try { await send('/api/models', 'POST', { name, provider, modelId, baseUrl }); setName(''); setModelId(''); setBaseUrl(''); await s.refresh(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const removeModel = async (id) => {
    try { await send(`/api/models/${id}`, 'DELETE'); await s.refresh(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page">
      <h1 className="pg-title">Your keys</h1>
      <p className="lede">
        Bring your own keys and your own models. Any panel seat whose provider has a key here goes
        <b> live</b>: its position on the tape is a real model call, billed to your provider — not to
        house credits. Keys are stored only on this machine, never shown again in full, and never sent
        to the browser.
      </p>

      <section className="section-gap" aria-label="Provider keys">
        <div className="key-grid">
          {Object.entries(s.providers || {}).map(([id, meta]) => (
            <ProviderCard key={id} id={id} meta={meta} saved={s.keys?.[id]} models={s.models} onChange={s.refresh} />
          ))}
        </div>
      </section>

      <section className="board section-gap" aria-label="Your models">
        <div className="board-title"><span className="brd-sm">Your models</span><span className="count">{custom.length}</span></div>
        <div className="board-rows">
          {custom.length === 0 && <div className="board-empty">No custom seats yet. Add any model your provider serves — it appears on the panel picker like a house seat.</div>}
          {custom.map((m) => (
            <div key={m.id} className="board-row" style={{ cursor: 'default' }}>
              <span className="sym" style={{ '--tint': m.live ? 'var(--green)' : 'var(--flap-ink)' }} aria-hidden="true">{m.symbol}</span>
              <span className="what"><b>{m.name}</b><span>{m.house} · {m.modelId}{m.baseUrl ? ` · ${m.baseUrl}` : ''} · {m.live ? 'live — key on file' : 'no key for this provider yet'}</span></span>
              <button className="toggle-btn" onClick={() => removeModel(m.id)} aria-label={`Remove ${m.name}`}>Remove</button>
            </div>
          ))}
          <div className="key-add">
            <input className="key-input" placeholder="Display name (e.g. Qwen 3 235B)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Model display name" />
            <select className="key-input" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
              {Object.entries(s.providers || {}).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
            </select>
            <input className="key-input" placeholder="Model id (exactly as the API expects)" value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label="Model id" />
            {provider === 'openai' && <input className="key-input" placeholder="Base URL (optional)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label="Base URL" />}
            <button className="btn-stamp attn-btn" onClick={addModel} disabled={busy || !name || !modelId}>Add seat</button>
          </div>
          {err && <p className="key-err" role="alert" style={{ padding: '0 1.4rem 1rem' }}>{err}</p>}
        </div>
      </section>
    </div>
  );
}
