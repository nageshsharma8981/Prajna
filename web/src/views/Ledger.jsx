// The ledger: every artifact the house has ever filled, with provenance.
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const KIND_LABEL = { brief: 'Decision brief', deck: 'Slide deck', site: 'Landing page', analysis: 'Analysis' };

export default function Ledger() {
  const s = useStore();
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }}>Opening the ledger…</p></div>;

  return (
    <div className="page">
      <h1 className="pg-title">The ledger</h1>
      <p className="lede">
        Every mission ends here or it didn't happen. Artifacts are first-class objects —
        versioned, exportable, and stamped with exactly how they were made and what they cost.
      </p>
      <section className="board section-gap" aria-label="Artifacts">
        <div className="board-title">
          <span className="brd-sm">Filled artifacts</span>
          <span className="count">{s.artifacts.length}</span>
        </div>
        <div className="board-rows">
          {s.artifacts.length === 0 && (
            <div className="board-empty">Nothing in the ledger yet. Open a position on the floor — every fill lands here.</div>
          )}
          {s.artifacts.map((a) => (
            <Link key={a.id} to={`/artifact/${a.id}`} className="board-row">
              <span className={`sym tint-${a.tint}`}>{a.serial}</span>
              <span className="what">
                <b>{a.title}</b>
                <span>{KIND_LABEL[a.kind]} · v{a.version} · council: {a.council.join(' · ')}</span>
              </span>
              <span className="num">{a.cost.toFixed(1)} cr</span>
              <span className="num">{new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
