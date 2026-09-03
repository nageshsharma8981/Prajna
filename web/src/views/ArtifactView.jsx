// Full-bleed artifact viewer with provenance in the top bar.
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import { BackIcon, OpenIcon } from '../components/icons.jsx';

export default function ArtifactView({ id }) {
  const s = useStore();
  const artifact = (s.artifacts || []).find((a) => a.id === id);

  return (
    <div className="artifact-shell">
      <div className="artifact-bar">
        <Link to="/ledger" className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} aria-label="Back to ledger"><BackIcon /> Ledger</Link>
        <div className="meta">
          <b>{artifact ? artifact.title : 'Artifact'}</b>
          <span>
            {artifact
              ? `${artifact.serial} · v${artifact.version} · ${artifact.cost.toFixed(1)}cr · council: ${artifact.council.join(' · ')}`
              : 'loading provenance…'}
          </span>
        </div>
        <a
          className="btn-quiet"
          style={{ marginLeft: 'auto', padding: '0.45rem 0.9rem' }}
          href={`/api/artifacts/${id}/html`}
          target="_blank"
          rel="noreferrer"
        >
          <OpenIcon /> Open full tab
        </a>
      </div>
      <iframe className="artifact-frame" src={`/api/artifacts/${id}/html`} title={artifact?.title || 'Artifact'} />
    </div>
  );
}
