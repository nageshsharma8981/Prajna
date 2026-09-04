// Connectors: real sign-in (OAuth) to the sources a mission can draw on.
// The unit is the PROVIDER — one Google sign-in covers five sources — so the
// page is a small set of provider boards, each with one state and one action.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const GLYPH = { google: 'G', slack: 'S', notion: 'N', github: 'GH' };

export default function Connectors() {
  const s = useStore();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const flash = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return { connected: q.get('connected'), as: q.get('as'), error: q.get('error') };
  }, []);
  useEffect(() => {
    if (flash.connected || flash.error) {
      const url = new URL(location.href);
      url.search = '';
      history.replaceState(null, '', url.pathname);
      s.refresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>Connectors are unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening connectors…</p></div>;

  const disconnect = async (provider, label) => {
    setBusy(provider); setErr(null);
    try {
      const r = await fetch(`/api/oauth/${provider}/disconnect`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Disconnect refused.');
      await s.refresh();
    } catch (e) { setErr(`${label}: ${e.message}`); } finally { setBusy(null); }
  };

  const providers = Object.entries(s.oauthApps || {}).map(([id, meta]) => {
    const covers = s.connectors.filter((c) => c.provider === id);
    const connected = covers.some((c) => c.connected);
    const account = covers.find((c) => c.account)?.account || meta.connectedAs;
    const state = connected ? 'LIVE' : meta.configured ? 'READY' : 'NEEDS APP';
    return { id, meta, covers, connected, account, state };
  });
  const unwired = s.connectors.filter((c) => !c.supported);
  const liveCount = providers.filter((p) => p.connected).length;

  return (
    <div className="page">
      <h1 className="pg-title">Connectors</h1>
      <p className="lede">
        Sign in once per provider and every mission gains live, read-only evidence from its sources —
        plus a delivery step (post to Slack, publish to Notion) that always holds for your approval.
        Sign-ins live in server memory for this session only; nothing is saved.
      </p>
      {flash.connected && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>Connected {s.oauthApps?.[flash.connected]?.label || flash.connected}{flash.as ? ` as ${flash.as}` : ''}.</p>}
      {flash.error && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>Connection failed: {flash.error}</p>}
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

      <div className="conn-legend" aria-label="Status legend">
        <span><span className="sflap LIVE">LIVE</span> signed in this session</span>
        <span><span className="sflap OPEN">READY</span> app loaded — one click to sign in</span>
        <span><span className="sflap QUEUED">NEEDS APP</span> add the provider's OAuth app under <Link to="/keys">Your keys</Link></span>
      </div>

      <section className="conn-grid section-gap" aria-label="Providers">
        {providers.map((p) => (
          <article key={p.id} className={`conn-card state-${p.state.replace(' ', '-')}`}>
            <header className="conn-head">
              <span className="conn-glyph" aria-hidden="true">{GLYPH[p.id] || p.meta.label.slice(0, 2).toUpperCase()}</span>
              <span className="conn-title">
                <b>{p.meta.label}</b>
                <span>{p.connected ? `signed in as ${p.account}` : p.meta.configured ? 'app loaded · not signed in' : 'no OAuth app loaded'}</span>
              </span>
              <span className={`sflap ${p.state === 'LIVE' ? 'LIVE' : p.state === 'READY' ? 'OPEN' : 'QUEUED'}`}>{p.state}</span>
            </header>
            <ul className="conn-covers">
              {p.covers.map((c) => (
                <li key={c.id} title={c.what}><b>{c.name}</b><span>{c.kind}</span></li>
              ))}
            </ul>
            <footer className="conn-foot">
              {p.connected ? (
                <button className="btn-quiet" onClick={() => disconnect(p.id, p.meta.label)} disabled={busy === p.id}>Disconnect</button>
              ) : p.meta.configured ? (
                <a className="btn-stamp attn-btn" href={`/api/oauth/${p.id}/start`}>Sign in with {p.meta.label}</a>
              ) : (
                <Link to="/keys" className="btn-quiet">Add {p.meta.label} app</Link>
              )}
              <span className="conn-hint">
                {p.connected ? 'evidence lines print on every mission' : p.meta.configured ? 'read-only scopes · revocable any time' : 'register the redirect URI shown under Your keys'}
              </span>
            </footer>
          </article>
        ))}
      </section>

      <section className="board section-gap" aria-label="Not wired yet">
        <div className="board-title"><span className="brd-sm">Not wired yet</span><span className="count">{unwired.length}</span></div>
        <div className="conn-unwired">
          {unwired.map((c) => (
            <span key={c.id} className="conn-unwired-chip" title={c.what}><b>{c.name}</b> · {c.kind}</span>
          ))}
        </div>
        <p className="conn-note">These sources have no sign-in provider in this build yet. They are listed, not pretended.</p>
      </section>

      <p className="conn-summary" role="status">{liveCount} of {providers.length} providers live this session.</p>
    </div>
  );
}
