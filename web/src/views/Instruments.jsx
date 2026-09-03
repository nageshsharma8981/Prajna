// Connectors: real sign-in (OAuth) to the sources a mission can draw on.
// A connected source contributes live, read-only evidence lines on the tape
// and can carry an external delivery step (which holds for your approval).
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

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

  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>The connector list is unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening the connector list…</p></div>;

  const disconnect = async (provider, name) => {
    setBusy(provider); setErr(null);
    try {
      const r = await fetch(`/api/oauth/${provider}/disconnect`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Disconnect refused.');
      await s.refresh();
    } catch (e) { setErr(`${name}: ${e.message}`); } finally { setBusy(null); }
  };

  const connected = s.connectors.filter((c) => c.connected);
  const ready = s.connectors.filter((c) => !c.connected && c.supported && c.appConfigured);
  const needsApp = s.connectors.filter((c) => !c.connected && c.supported && !c.appConfigured);
  const unsupported = s.connectors.filter((c) => !c.supported);

  const Row = ({ c }) => (
    <div className="board-row" style={{ cursor: 'default' }}>
      <span className="sym" style={{ '--tint': c.connected ? 'var(--green)' : 'var(--flap-ink)' }} aria-hidden="true">{c.name.slice(0, 3).toUpperCase()}</span>
      <span className="what">
        <b>{c.name}</b>
        <span>
          {c.kind} · {c.what}
          {c.connected && c.account ? <> · <b style={{ color: 'var(--green)' }}>connected as {c.account}</b></> : null}
          {!c.supported ? ' · no sign-in provider wired in this build yet' : null}
          {c.supported && !c.appConfigured && !c.connected ? <> · needs a {s.oauthApps?.[c.provider]?.label} OAuth app — <Link to="/keys">add it under Your keys</Link></> : null}
        </span>
      </span>
      {c.connected ? (
        <button className="toggle-btn on" onClick={() => disconnect(c.provider, c.name)} disabled={busy === c.provider} aria-label={`Disconnect ${c.name}`}>Disconnect</button>
      ) : c.supported && c.appConfigured ? (
        <a className="toggle-btn" href={`/api/oauth/${c.provider}/start`} aria-label={`Connect ${c.name} with ${s.oauthApps?.[c.provider]?.label} sign-in`}>Connect</a>
      ) : c.supported ? (
        <Link to="/keys" className="toggle-btn" style={{ opacity: 0.8 }}>Needs app</Link>
      ) : (
        <span className="toggle-btn" style={{ opacity: 0.5, cursor: 'default' }}>Not wired</span>
      )}
    </div>
  );

  return (
    <div className="page">
      <h1 className="pg-title">Connectors</h1>
      <p className="lede">
        A mission is only as good as its evidence. Connect a source with a real sign-in and it does two
        things: it contributes live, read-only evidence lines on the tape of every mission, and it can
        carry a delivery step (post to Slack, publish to Notion) — which always holds for your approval.
        Tokens live only in server memory for this session and are never saved.
      </p>
      {flash.connected && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>Connected {s.oauthApps?.[flash.connected]?.label || flash.connected}{flash.as ? ` as ${flash.as}` : ''}.</p>}
      {flash.error && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>Connection failed: {flash.error}</p>}
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

      <section className="board section-gap" aria-label="Connected sources">
        <div className="board-title"><span className="brd-sm">Connected</span><span className="count">{connected.length}</span></div>
        <div className="board-rows">
          {connected.length === 0 && <div className="board-empty">Nothing connected in this session. Add a provider app under Your keys, then Connect below.</div>}
          {connected.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </section>
      <section className="board section-gap" aria-label="Ready to connect">
        <div className="board-title"><span className="brd-sm">Ready to connect</span><span className="count">{ready.length}</span></div>
        <div className="board-rows">
          {ready.length === 0 && <div className="board-empty">No provider app loaded yet — Google covers Gmail, Drive, Calendar, Sheets and YouTube with one app.</div>}
          {ready.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </section>
      <section className="board section-gap" aria-label="Needs a provider app">
        <div className="board-title"><span className="brd-sm">Needs a provider app</span><span className="count">{needsApp.length}</span></div>
        <div className="board-rows">{needsApp.map((c) => <Row key={c.id} c={c} />)}</div>
      </section>
      <section className="board section-gap" aria-label="Not wired yet">
        <div className="board-title"><span className="brd-sm">Not wired yet</span><span className="count">{unsupported.length}</span></div>
        <div className="board-rows">{unsupported.map((c) => <Row key={c.id} c={c} />)}</div>
      </section>
    </div>
  );
}
