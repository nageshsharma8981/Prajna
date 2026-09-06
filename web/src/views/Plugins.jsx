import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Plugins() {
  const s = useStore();
  const [err, setErr] = useState(null);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening the toolroom…</p></div>;
  const toggle = async (id) => {
    const r = await fetch(`/api/plugins/${id}/toggle`, { method: 'POST' });
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Refused.'); return; }
    s.refresh();
  };
  return (
    <div className="page">
      <h1 className="pg-title">Toolroom</h1>
      <p className="lede">Fittings that change what a mission can do. Enable one and the plans the house writes change; the effect is named on each card, not implied.</p>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}
      <div className="plugin-grid section-gap">
        {(s.pluginCatalog || []).map((p) => {
          const on = (s.plugins || []).includes(p.id);
          return (
            <article key={p.id} className={`plugin-card${on ? ' on' : ''}`}>
              <header><b>{p.name}</b><span className="by">by {p.by}</span></header>
              <p>{p.what}</p>
              <p className="effect"><span className={`badge ${/^Wired/.test(p.effect) ? 'live' : ''}`}>{/^Wired/.test(p.effect) ? 'WIRED' : 'INTENT'}</span> {p.effect}</p>
              <button className={`toggle-btn${on ? ' on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>{on ? 'Enabled' : 'Enable'}</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
