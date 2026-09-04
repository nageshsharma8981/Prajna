// Release notes: every version, newest first, parsed from the README the
// house ships with. Plain text bodies; nothing rendered as HTML.
import { useEffect, useState } from 'react';

export default function Releases() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { fetch('/api/releases').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setData).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>Release notes unavailable: {err}.</p></div>;
  if (!data) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening the release notes…</p></div>;
  return (
    <div className="page">
      <h1 className="pg-title">Release notes</h1>
      <p className="lede">Running version <b>{data.current}</b>. {data.releases.length} versions on the record, newest first — every one verified before it shipped.</p>
      <div className="releases">
        {data.releases.map((r, i) => (
          <details key={r.version} className="release" open={i === 0}>
            <summary><span className="ver">{r.version}</span><b>{r.title}</b>{r.date && <span className="date">{r.date}</span>}</summary>
            <pre className="release-body">{r.body}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
