// Instruments: connectors that give missions real evidence to trade on.
import { useStore } from '../lib/store.jsx';

export default function Instruments() {
  const s = useStore();
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }}>Opening the instrument list…</p></div>;

  const seated = s.connectors.filter((c) => c.connected);
  const open = s.connectors.filter((c) => !c.connected);

  const Row = ({ c }) => (
    <div className="board-row" style={{ cursor: 'default' }}>
      <span className="sym" style={{ '--tint': c.connected ? 'var(--green)' : 'var(--flap-ink)' }}>
        {c.name.slice(0, 3).toUpperCase()}
      </span>
      <span className="what">
        <b>{c.name}</b>
        <span>{c.kind} · {c.what}</span>
      </span>
      <button
        className={`toggle-btn${c.connected ? ' on' : ''}`}
        onClick={() => s.toggleConnector(c.id)}
        aria-pressed={c.connected}
      >
        {c.connected ? 'Seated' : 'Take seat'}
      </button>
    </div>
  );

  return (
    <div className="page">
      <h1 className="pg-title">Instruments</h1>
      <p className="lede">
        A mission is only as good as its evidence. Seat a connector and its data becomes
        tradable — cited in briefs, charted in analyses, always with provenance attached.
      </p>
      <section className="board section-gap">
        <div className="board-title"><span className="brd-sm">Seated</span><span className="count">{seated.length}</span></div>
        <div className="board-rows">
          {seated.length === 0 && <div className="board-empty">No instruments seated yet.</div>}
          {seated.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </section>
      <section className="board section-gap">
        <div className="board-title"><span className="brd-sm">Seats open</span><span className="count">{open.length}</span></div>
        <div className="board-rows">{open.map((c) => <Row key={c.id} c={c} />)}</div>
      </section>
    </div>
  );
}
