// Full-bleed artifact viewer with provenance in the top bar.
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import { BackIcon, OpenIcon, DownloadIcon } from '../components/icons.jsx';

export default function ArtifactView({ id }) {
  const s = useStore();
  const [retried, setRetried] = useState(false);
  const artifact = (s.artifacts || []).find((a) => a.id === id);

  // A just-delivered artifact may not be in the bootstrap snapshot yet:
  // refresh once, then show an honest not-found state.
  useEffect(() => {
    if (s.ready && !artifact && !retried) {
      setRetried(true);
      s.refresh();
    }
  }, [s.ready, artifact, retried, s]);

  const missing = s.ready && retried && !artifact;

  return (
    <div className="artifact-shell">
      <div className="artifact-bar">
        <Link to="/artifacts" className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} aria-label="Back to artifacts"><BackIcon /> Artifacts</Link>
        <div className="meta">
          <b>{artifact ? artifact.title : missing ? 'Artifact not found' : 'Artifact'}</b>
          <span>
            {artifact
              ? `${artifact.serial} · v${artifact.version}${artifact.voided ? ' · VOID' : artifact.partial ? ' · partial' : ''} · ${artifact.cost.toFixed(1)}cr · council: ${artifact.council.join(' · ')}`
              : missing ? 'no artifact with this id has been delivered — the link may be stale' : 'loading provenance…'}
          </span>
        </div>
        {artifact && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
            <a className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} href={`/api/artifacts/${id}/html?download=1`}>
              <DownloadIcon /> Download
            </a>
            <a className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} href={`/api/artifacts/${id}/html`} target="_blank" rel="noreferrer">
              <OpenIcon /> Open full tab
            </a>
          </span>
        )}
      </div>
      {missing ? (
        <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>Nothing delivered under “{id}”. <Link to="/artifacts">See all artifacts</Link>.</p></div>
      ) : (
        <iframe className="artifact-frame" sandbox="allow-scripts" src={`/api/artifacts/${id}/html`} title={artifact?.title || 'Artifact document'} />
      )}
    </div>
  );
}
