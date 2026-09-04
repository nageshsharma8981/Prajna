// Full-bleed artifact viewer with provenance in the top bar.
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link, navigate } from '../lib/router.jsx';
import { BackIcon, OpenIcon, DownloadIcon } from '../components/icons.jsx';

export default function ArtifactView({ id }) {
  const s = useStore();
  const [retried, setRetried] = useState(false);
  const artifact = (s.artifacts || []).find((a) => a.id === id);
  const [shareMsg, setShareMsg] = useState(null);
  const [note, setNote] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = artifact?.notes || [];
  const addNote = async () => {
    if (!note.trim()) return;
    const r = await fetch(`/api/artifacts/${id}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: note }) });
    if (r.ok) { setNote(''); s.refresh(); } else setShareMsg((await r.json().catch(() => ({}))).error || 'Note refused.');
  };
  const delNote = async (nid) => { await fetch(`/api/artifacts/${id}/notes/${nid}`, { method: 'DELETE' }); s.refresh(); };
  const amend = async (withNotes) => {
    const r = await fetch(`/api/missions/${artifact.missionId}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(withNotes ? { feedback: notes.map((n) => n.text) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { await s.refresh(); navigate(`/run/${j.id}`); } else setShareMsg(j.error || 'Fork refused.');
  };
  const share = async (method) => {
    const r = await fetch(`/api/artifacts/${id}/share`, { method });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setShareMsg(j.error || 'Refused.'); return; }
    if (j.path) { const link = `${location.origin}${j.path}`; try { await navigator.clipboard.writeText(link); setShareMsg(`Share link copied: ${link}`); } catch { setShareMsg(`Share link: ${link}`); } } else setShareMsg('Share link revoked.');
    s.refresh();
  };

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
              ? `${artifact.serial} · v${artifact.version}${artifact.supersedes ? ' (supersedes an earlier version)' : ''}${artifact.voided ? ' · VOID' : artifact.partial ? ' · partial' : ''} · ${artifact.cost.toFixed(1)}cr · panel: ${artifact.council.join(' · ')}`
              : missing ? 'no artifact with this id has been delivered — the link may be stale' : 'loading provenance…'}
          </span>
        </div>
        {artifact && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
            {artifact.supersedes && <Link className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} to={`/compare/${artifact.supersedes}/${artifact.id}`} title="Side by side with the version this one supersedes, and the notes that drove the change">Compare with v{artifact.version - 1}</Link>}
            <button className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} title="Notes for the next version — the lead author is written against them" onClick={() => setNotesOpen((v) => !v)}>Notes{notes.length ? ` (${notes.length})` : ''}</button>
            <button className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} title={notes.length ? 'New ticket on the same desk and panel, written against your notes — its delivery becomes the next version' : 'New ticket on the same desk and panel — its delivery becomes the next version'} onClick={() => amend(notes.length > 0)}>{notes.length ? 'Amend with notes' : 'Amend & re-run'}</button>
            <button className="btn-quiet" style={{ padding: '0.45rem 0.9rem' }} title="Public link to this delivery, provenance included; revoke any time" onClick={() => share(artifact?.shareToken ? 'DELETE' : 'POST')}>{artifact?.shareToken ? 'Revoke share' : 'Share'}</button>
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
        <>
          {shareMsg && <p role="status" className="share-msg">{shareMsg}</p>}
          {notesOpen && (
            <div className="notes-panel" role="group" aria-label="Notes for the next version">
              <ul>{notes.map((n) => <li key={n.id}><span>{n.text}</span><button onClick={() => delNote(n.id)} aria-label="Delete note">×</button></li>)}{notes.length === 0 && <li className="empty">No notes yet. Say what the next version must change; it is written against these and they go on its record.</li>}</ul>
              <div className="notes-add"><input className="key-input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} placeholder="e.g. Lead with the pilot, drop the third claim, cite the regulator" aria-label="New note" /><button className="btn-stamp attn-btn" onClick={addNote} disabled={!note.trim()}>Add note</button></div>
            </div>
          )}
          <iframe className="artifact-frame" sandbox="allow-scripts" src={`/api/artifacts/${id}/html`} title={artifact?.title || 'Artifact document'} />
        </>
      )}
    </div>
  );
}
