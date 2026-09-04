// Compare two versions of a delivery side by side, with the notes that
// drove the change and what the ledger says differed between the runs.
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import { BackIcon } from '../components/icons.jsx';

function summary(m, a) {
  if (!m || !a) return null;
  const as = m.contract?.assertions || [];
  return {
    mode: m.authored?.live ? `live · ${m.authored.model}` : (m.seats || []).some((s) => s.live) ? 'hybrid' : 'scripted',
    sealed: `${as.filter((x) => x.status === 'SEALED').length}/${as.length}`,
    cost: `${(m.settlement?.settled ?? m.spent ?? 0).toFixed(1)} cr`,
    patches: (m.patches || []).length,
    risks: (m.acceptedRisks || []).length,
    rounds: (m.validations || []).length,
    sources: (m.sources || []).length,
    delivered: a.createdAt ? new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–',
  };
}

export default function Compare({ leftId, rightId }) {
  const s = useStore();
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening…</p></div>;
  const left = s.artifacts.find((a) => a.id === leftId);
  const right = s.artifacts.find((a) => a.id === rightId);
  if (!left || !right) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>One of these deliveries is not on the books. <Link to="/artifacts">See all artifacts</Link>.</p></div>;
  const lm = s.missions.find((m) => m.id === left.missionId);
  const rm = s.missions.find((m) => m.id === right.missionId);
  const notes = rm?.lineage?.feedback || [];
  const L = summary(lm, left), R = summary(rm, right);
  const rows = [['Mode', 'mode'], ['Assertions sealed', 'sealed'], ['Validation rounds', 'rounds'], ['Patches', 'patches'], ['Accepted risks', 'risks'], ['Sources on the table', 'sources'], ['Settled', 'cost'], ['Delivered', 'delivered']];
  return (
    <div className="artifact-shell compare">
      <div className="artifact-bar">
        <Link to={`/artifact/${right.id}`} className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} aria-label="Back to the newer version"><BackIcon /> v{right.version}</Link>
        <div className="meta">
          <b>{right.title.replace(/^VOID · /, '')}</b>
          <span>{left.serial} v{left.version} → {right.serial} v{right.version}{notes.length ? ` · written against ${notes.length} note${notes.length === 1 ? '' : 's'}` : ' · amended without notes'}</span>
        </div>
      </div>
      <div className="compare-strip">
        <div className="compare-notes">
          <span className="k">Notes that drove v{right.version}</span>
          {notes.length ? <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p>No notes were left on v{left.version}; the amendment re-ran the same goal.</p>}
        </div>
        <table className="compare-table" aria-label="What the ledger says changed">
          <thead><tr><th /><th>v{left.version}</th><th>v{right.version}</th></tr></thead>
          <tbody>{rows.map(([label, k]) => <tr key={k} className={L && R && String(L[k]) !== String(R[k]) ? 'diff' : ''}><td>{label}</td><td>{L ? String(L[k]) : '–'}</td><td>{R ? String(R[k]) : '–'}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="compare-frames">
        <figure><figcaption>v{left.version} · {left.serial}</figcaption><iframe className="artifact-frame" sandbox="allow-scripts" src={`/api/artifacts/${left.id}/html`} title={`Version ${left.version}`} /></figure>
        <figure><figcaption>v{right.version} · {right.serial}</figcaption><iframe className="artifact-frame" sandbox="allow-scripts" src={`/api/artifacts/${right.id}/html`} title={`Version ${right.version}`} /></figure>
      </div>
    </div>
  );
}
