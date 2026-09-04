import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Plugins() {
  const s = useStore();
  const [err, setErr] = useState(null);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening plugins…</p></div>;
  const toggle = async (id) => {
    const r = await fetch(`/api/plugins/${id}/toggle`, { method: 'POST' });
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Refused.'); return; }
    s.refresh();
  };
  return (
    <div className="page">
      <h1 className="pg-title">Plugins</h1>
      <p className="lede">Extend what missions can do. Enabling a plugin changes the plans the house writes — the effect is named on each card, not implied.</p>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}
      <div className="plugin-grid section-gap">
        {(s.pluginCatalog || []).map((p) => {
          const on = (s.plugins || []).includes(p.id);
          return (
            <article key={p.id} className={`plugin-card${on ? ' on' : ''}`}>
              <header><b>{p.name}</b><span className="by">by {p.by}</span></header>
              <p>{p.what}</p>
              <p className="effect">{p.effect}</p>
              <button className={`toggle-btn${on ? ' on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>{on ? 'Enabled' : 'Enable'}</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
