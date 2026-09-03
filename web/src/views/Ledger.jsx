// Artifacts: everything the house has ever delivered, with provenance.
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const KIND_LABEL = { brief: 'Decision brief', deck: 'Slide deck', site: 'Landing page', analysis: 'Analysis' };

export default function Ledger() {
  const s = useStore();
  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>Artifacts are unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening artifacts…</p></div>;

  return (
    <div className="page">
      <h1 className="pg-title">Artifacts</h1>
      <p className="lede">
        Every mission ends here or it didn't happen. Artifacts are first-class objects —
        downloadable, stamped with exactly how they were made and what they cost, and
        retained even when a review voids them.
      </p>
      <section className="board section-gap" aria-label="Artifacts">
        <div className="board-title">
          <span className="brd-sm">Delivered artifacts</span>
          <span className="count">{s.artifacts.length}</span>
        </div>
        <div className="board-rows">
          {s.artifacts.length === 0 && (
            <div className="board-empty">Nothing delivered yet. Open a mission — every delivery lands here.</div>
          )}
          {s.artifacts.map((a) => (
            <Link key={a.id} to={`/artifact/${a.id}`} className={`board-row${a.voided ? ' voided' : ''}`}>
              <span className={`sym tint-${a.tint}`}>{a.serial}</span>
              <span className="what">
                <b>{a.title.replace(/^VOID · /, '')}</b>
                <span>{KIND_LABEL[a.kind]}{a.partial ? ' · partial' : ''} · council: {a.council.join(' · ')}</span>
              </span>
              <span className="num">{a.cost.toFixed(1)} cr</span>
              <span className="num">{new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              {a.voided ? <span className="sflap KILLED">VOID</span> : a.partial ? <span className="sflap PAUSED_ATTENTION">PARTIAL</span> : <span className="sflap FILLED">DONE</span>}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
