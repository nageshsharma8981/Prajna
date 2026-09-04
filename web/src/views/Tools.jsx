import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Tools() {
  const s = useStore();
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [err, setErr] = useState(null); const [adding, setAdding] = useState(false);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening tools…</p></div>;
  const toggle = async (id) => { const r = await fetch(`/api/tools/${id}/toggle`, { method: 'POST' }); if (!r.ok) setErr('Refused.'); else s.refresh(); };
  const addMcp = async () => {
    setErr(null);
    const r = await fetch('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'Refused.'); return; }
    setName(''); setUrl(''); setAdding(false); s.refresh();
  };
  const notes = { 'task-agent': 'Wired: on, the companion may start a mission from conversation (a live model directive, or a plain request without a key); off, it only talks and says why.', media: 'Wired: on, the media studio generates locally and on your OpenAI or Google key; off, generation is refused and the studio says so.', browser: 'Not wired yet: the house has no headless browser; this switch records the intent.' };
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="pg-title">Tools</h1>
        <button className="ic" style={{ marginLeft: 'auto' }} onClick={() => setAdding((v) => !v)} aria-label="Add MCP tool" title="Add MCP tool">+</button>
      </div>
      <p className="lede">Configure built-in tools and connected MCP tools for missions.</p>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}
      <div className="tool-list section-gap">
        {(s.toolCatalog || []).map((t) => {
          const on = !!(s.tools || {})[t.id];
          return (
            <div key={t.id} className="tool-row">
              <span className="tool-ic" aria-hidden="true">{t.name.slice(0, 1)}</span>
              <span className="what"><b>{t.name}</b><span>{t.what}</span><span className="effect">{notes[t.id]}</span></span>
              <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={t.name} onClick={() => toggle(t.id)}><span /></button>
            </div>
          );
        })}
        {(s.mcp || []).map((m) => (
          <div key={m.id} className="tool-row">
            <span className="tool-ic" aria-hidden="true">M</span>
            <span className="what"><b>{m.name}</b><span className="mono">{m.url}</span><span className="effect">{m.status}</span></span>
            <button className="toggle-btn" onClick={async () => { await fetch(`/api/mcp/${m.id}`, { method: 'DELETE' }); s.refresh(); }}>Remove</button>
          </div>
        ))}
        {adding && (
          <div className="tool-row" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.6rem' }}>
            <input className="key-input" placeholder="Tool name" value={name} onChange={(e) => setName(e.target.value)} aria-label="MCP tool name" />
            <input className="key-input" placeholder="https://your-mcp-server/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="MCP server URL" />
            <button className="btn-stamp attn-btn" onClick={addMcp} disabled={!name || !url}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}
