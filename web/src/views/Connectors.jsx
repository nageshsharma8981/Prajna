// Connectors catalog: search, filter, popular row, connected accounts, and
// every category. Real sign-in where a provider is wired; honest otherwise.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import { SearchIcon, FilterIcon } from '../components/icons.jsx';

export default function Connectors() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [err, setErr] = useState(null);
  const flash = useMemo(() => { const p = new URLSearchParams(location.search); return { connected: p.get('connected'), as: p.get('as'), error: p.get('error') }; }, []);
  useEffect(() => { if (flash.connected || flash.error) { history.replaceState(null, '', location.pathname); s.refresh(); } }, []); // eslint-disable-line
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening connectors…</p></div>;

  const all = s.connectors || [];
  const cats = ['all', ...new Set(all.map((c) => c.category))];
  const needle = q.trim().toLowerCase();
  const visible = all.filter((c) => (cat === 'all' || c.category === cat) && (!needle || `${c.name} ${c.category} ${c.what}`.toLowerCase().includes(needle)));
  const popular = all.filter((c) => c.popular);
  const connected = all.filter((c) => c.connected);
  const byCat = {};
  for (const c of visible) (byCat[c.category] ||= []).push(c);

  const disconnect = async (c) => {
    const r = await fetch(`/api/oauth/${c.provider}/disconnect`, { method: 'POST' });
    if (!r.ok) setErr('Disconnect refused.'); else s.refresh();
  };
  const Action = ({ c, small }) => c.connected
    ? <button className={`toggle-btn on${small ? ' sm' : ''}`} onClick={() => disconnect(c)}>Connected</button>
    : c.supported && c.appConfigured
      ? <a className={`btn-stamp attn-btn${small ? ' sm' : ''}`} href={`/api/oauth/${c.provider}/start`}>Connect</a>
      : c.supported
        ? <Link to="/keys" className={`toggle-btn${small ? ' sm' : ''}`} title="Add the provider's OAuth app under Your keys">Connect</Link>
        : <button className={`toggle-btn${small ? ' sm' : ''}`} onClick={() => setErr(`${c.name}: no sign-in provider is wired for this connector yet, it is listed, not pretended.`)}>Connect</button>;

  return (
    <div className="page">
      <h1 className="pg-title">Connectors</h1>
      <p className="lede">Manage app connections for missions.</p>
      {flash.connected && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>Connected{flash.as ? ` as ${flash.as}` : ''}.</p>}
      {flash.error && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>Connection failed: {flash.error}</p>}
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

      <div className="search-row">
        <label className="search"><SearchIcon /><input placeholder="Search apps…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search connectors" /></label>
        <button className="ic round" onClick={() => setShowFilter((v) => !v)} aria-label="Filter by category" aria-expanded={showFilter}><FilterIcon /></button>
      </div>
      {showFilter && (
        <div className="cat-row">{cats.map((c) => <button key={c} className={`cat-chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c === 'all' ? 'All' : c}</button>)}</div>
      )}

      {!needle && cat === 'all' && (
        <section className="section-gap">
          <h2 className="h2">Popular connectors</h2>
          <p className="sub">Start with the apps most teams connect first.</p>
          <div className="pop-grid">
            {popular.map((c) => (
              <div key={c.id} className="pop-tile">
                <span className="tile-ic" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="tile-nm">{c.name}</span>
                <Action c={c} small />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section-gap">
        <h2 className="h2">Connected accounts</h2>
        <div className="dashed">{connected.length === 0 ? 'No connected accounts yet.' : connected.map((c) => <span key={c.id} className="conn-unwired-chip"><b>{c.name}</b> · {c.account}</span>)}</div>
      </section>

      {Object.entries(byCat).map(([category, items]) => (
        <section key={category} className="section-gap">
          <h2 className="h2">{category}</h2>
          <div className="cat-grid">
            {items.map((c) => (
              <div key={c.id} className="cat-item">
                <span className="tile-ic" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="what"><b>{c.name}</b><span>{c.what}</span><span className="src">{c.supported ? 'Sign-in wired' : 'Catalog'}</span></span>
                <Action c={c} small />
              </div>
            ))}
          </div>
        </section>
      ))}
      {visible.length === 0 && <p className="board-empty">Nothing matches “{q}”.</p>}
    </div>
  );
}
