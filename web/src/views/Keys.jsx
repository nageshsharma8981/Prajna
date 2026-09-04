// Your keys (BYOK): bring your own provider keys and your own models. A model
// whose provider has a key goes LIVE: its panel position is a real model
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
    try { const r = await send(`/api/keys/${id}`, 'PUT', { key, baseUrl }); setMsg(meta.kind === 'search' ? `Loaded as ${r.masked} for this session (not saved to disk). The research desk now sweeps the live web through ${meta.label} until the server restarts.` : `Loaded as ${r.masked} for this session (not saved to disk). Models on ${meta.label} are live until the server restarts.`); setKey(''); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await send(`/api/keys/${id}/test`, 'POST', { key: key || undefined, baseUrl: baseUrl || undefined }); setMsg(meta.kind === 'search' ? `Live: ${meta.label} answered in ${r.ms}ms (first hit “${r.sample}”).` : `Live: ${r.modelId} answered in ${r.ms}ms (“${r.sample}”).`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await send(`/api/keys/${id}`, 'DELETE'); setMsg(meta.kind === 'search' ? 'Key removed. Retrieval falls back to the open encyclopedia.' : 'Key removed. Models on this provider are scripted again.'); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="key-card" role="group" aria-label={`${meta.label} key`}>
      <div className="key-head">
        <b>{meta.label}</b>
        <span className={`sflap ${saved ? 'LIVE' : 'QUEUED'}`}>{saved ? 'LIVE' : 'NO KEY'}</span>{meta.kind === 'search' && <span className="beta">search</span>}
      </div>
      <p className="key-hint">{meta.hint}</p>
      {saved && <p className="key-saved">In memory this session: <code>{saved.masked}</code>{saved.baseUrl ? <> · base URL <code>{saved.baseUrl}</code></> : null}</p>}
      <div className="key-form">
        <input type="password" autoComplete="off" className="key-input" placeholder={saved ? 'Replace key…' : 'Paste key…'} value={key} onChange={(e) => setKey(e.target.value)} aria-label={`${meta.label} API key`} />
        {id === 'openai' && (
          <input className="key-input" placeholder="Base URL (optional, e.g. https://api.deepseek.com/v1)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label="Base URL" />
        )}
        <div className="key-actions">
          <button className="btn-stamp attn-btn" onClick={save} disabled={busy || !key}>Use key this session</button>
          <button className="btn-quiet" onClick={test} disabled={busy || (!key && !saved)} title={houseSeat ? `Pings ${houseSeat.modelId}` : ''}>Test</button>
          {saved && <button className="btn-quiet" onClick={remove} disabled={busy}>Remove</button>}
        </div>
      </div>
      {msg && <p className="key-msg" role="status">{msg}</p>}
      {err && <p className="key-err" role="alert">{err}</p>}
    </div>
  );
}

function OAuthAppCard({ id, app, onChange }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await send(`/api/oauth/${id}/app`, 'PUT', { clientId, clientSecret: secret }); setMsg('Loaded for this session. Connect from the Connectors page.'); setClientId(''); setSecret(''); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await send(`/api/oauth/${id}/app`, 'DELETE'); setMsg('App removed; its connections are gone too.'); await onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="key-card" role="group" aria-label={`${app.label} OAuth app`}>
      <div className="key-head"><b>{app.label}</b><span className={`sflap ${app.configured ? 'LIVE' : 'QUEUED'}`}>{app.connectedAs ? 'CONNECTED' : app.configured ? 'APP LOADED' : 'NO APP'}</span></div>
      <p className="key-hint">Covers {app.covers.join(', ')}. Register at: {app.console}</p>
      <p className="key-saved">Redirect URI to register: <code>{app.redirectUri}</code></p>
      {app.configured && <p className="key-saved">Client id in memory: <code>{app.clientId}</code>{app.connectedAs ? <> · connected as <code>{app.connectedAs}</code></> : null}</p>}
      <div className="key-form">
        <input className="key-input" placeholder="Client id" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label={`${app.label} client id`} autoComplete="off" />
        <input className="key-input" type="password" placeholder="Client secret" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label={`${app.label} client secret`} autoComplete="off" />
        <div className="key-actions">
          <button className="btn-stamp attn-btn" onClick={save} disabled={busy || !clientId || !secret}>Use app this session</button>
          {app.configured && <button className="btn-quiet" onClick={remove} disabled={busy}>Remove</button>}
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
        Bring your own keys and your own models. Any panel model whose provider has a key here goes
        <b> live</b>: its position on the tape is a real model call, billed to your provider, not to
        house credits. <b>Keys are never saved.</b> They are held in the server's memory for this
        session only, never written to disk, never sent back to the browser, and gone the moment the
        server restarts, you re-enter them when you need them.
      </p>

      <section className="section-gap" aria-label="Provider keys">
        <div className="key-grid">
          {Object.entries(s.providers || {}).map(([id, meta]) => (
            <ProviderCard key={id} id={id} meta={meta} saved={s.keys?.[id]} models={s.models} onChange={s.refresh} />
          ))}
        </div>
      </section>

      <section className="section-gap" aria-label="Connector sign-in apps">
        <h2 className="pg-title" style={{ fontSize: '1.1rem' }}>Connector sign-in apps</h2>
        <p className="lede">
          Connectors sign in with real OAuth. Each provider needs an app you register once in its
          developer console; paste its client id and secret here (memory only, never saved) and set
          the redirect URI shown. Then Connect on the Connectors page.
        </p>
        <div className="key-grid" style={{ marginTop: '1rem' }}>
          {Object.entries(s.oauthApps || {}).map(([id, app]) => <OAuthAppCard key={id} id={id} app={app} onChange={s.refresh} />)}
        </div>
      </section>

      <section className="board section-gap" aria-label="Your models">
        <div className="board-title"><span className="brd-sm">Your models</span><span className="count">{custom.length}</span></div>
        <div className="board-rows">
          {custom.length === 0 && <div className="board-empty">No custom models yet. Add any model your provider serves, it appears on the panel picker like a house model.</div>}
          {custom.map((m) => (
            <div key={m.id} className="board-row" style={{ cursor: 'default' }}>
              <span className="sym" style={{ '--tint': m.live ? 'var(--green)' : 'var(--flap-ink)' }} aria-hidden="true">{m.symbol}</span>
              <span className="what"><b>{m.name}</b><span>{m.house} · {m.modelId}{m.baseUrl ? ` · ${m.baseUrl}` : ''} · {m.live ? 'live, key on file' : 'no key for this provider yet'}</span></span>
              <button className="toggle-btn" onClick={() => removeModel(m.id)} aria-label={`Remove ${m.name}`}>Remove</button>
            </div>
          ))}
          <div className="key-add">
            <input className="key-input" placeholder="Display name (e.g. Qwen 3 235B)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Model display name" />
            <select className="key-input" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
              {Object.entries(s.providers || {}).filter(([, meta]) => meta.kind !== 'search').map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
            </select>
            <input className="key-input" placeholder="Model id (exactly as the API expects)" value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label="Model id" />
            {provider === 'openai' && <input className="key-input" placeholder="Base URL (optional)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label="Base URL" />}
            <button className="btn-stamp attn-btn" onClick={addModel} disabled={busy || !name || !modelId}>Add model</button>
          </div>
          {err && <p className="key-err" role="alert" style={{ padding: '0 1.4rem 1rem' }}>{err}</p>}
        </div>
      </section>
    </div>
  );
}
