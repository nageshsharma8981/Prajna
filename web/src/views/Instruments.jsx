// Connectors: the evidence sources a mission can draw on. Live OAuth wiring
// is on the roadmap; today a connector is queued as declared intent, and the
// copy says exactly that.
import { useStore } from '../lib/store.jsx';

export default function Connectors() {
  const s = useStore();
  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>The connector list is unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening the connector list…</p></div>;

  const queued = s.connectors.filter((c) => c.connected);
  const open = s.connectors.filter((c) => !c.connected);

  const Row = ({ c }) => (
    <div className="board-row" style={{ cursor: 'default' }}>
      <span className="sym" style={{ '--tint': c.connected ? 'var(--green)' : 'var(--flap-ink)' }} aria-hidden="true">
        {c.name.slice(0, 3).toUpperCase()}
      </span>
      <span className="what">
        <b>{c.name}</b>
        <span>{c.kind} · {c.what}</span>
      </span>
      <button
        className={`toggle-btn${c.connected ? ' on' : ''}`}
        onClick={() => s.toggleConnector(c.id).catch(() => {})}
        aria-pressed={c.connected}
        aria-label={`${c.name}: ${c.connected ? 'queued for connection — press to remove' : 'not connected — press to queue for connection'}`}
      >
        {c.connected ? 'Queued' : 'Connect'}
      </button>
    </div>
  );

  return (
    <div className="page">
      <h1 className="pg-title">Connectors</h1>
      <p className="lede">
        A mission is only as good as its evidence. Queue a connector here and it is recorded
        as a source the house should draw on. Live sign-in (OAuth) wiring is on the roadmap —
        until it lands, queued connectors are declared intent, not live data feeds.
      </p>
      <section className="board section-gap" aria-label="Queued connectors">
        <div className="board-title"><span className="brd-sm">Queued</span><span className="count">{queued.length}</span></div>
        <div className="board-rows">
          {queued.length === 0 && <div className="board-empty">No connectors queued yet.</div>}
          {queued.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </section>
      <section className="board section-gap" aria-label="Available connectors">
        <div className="board-title"><span className="brd-sm">Available</span><span className="count">{open.length}</span></div>
        <div className="board-rows">
          {open.length === 0 && <div className="board-empty">Every connector is queued.</div>}
          {open.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </section>
    </div>
  );
}
