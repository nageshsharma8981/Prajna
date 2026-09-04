// The house rules, accepted before anything else: Terms and Conditions, the
// Privacy and GDPR Policy and the AI Disclaimer, read here and accepted
// together. Acceptance is recorded on the server with its version and time.
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Consent() {
  const s = useStore();
  const [legal, setLegal] = useState(null);
  const [tab, setTab] = useState('terms');
  const [read, setRead] = useState({ terms: false, privacy: false, ai: false });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { fetch('/api/legal').then((r) => r.json()).then(setLegal).catch((e) => setErr(e.message)); }, []);
  const all = read.terms && read.privacy && read.ai;
  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accept: true, version: legal.version, name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The house did not record the acceptance.');
      if (name.trim()) await fetch('/api/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      await s.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!legal) return <div className="gate"><div className="gate-card"><p role="status">Opening the house rules…</p>{err && <p role="alert" className="key-err">{err}</p>}</div></div>;
  const doc = legal.docs[tab];
  return (
    <div className="gate consent">
      <div className="gate-card consent-card">
        <img className="logo-img" src="/logo.png" alt="Prajñā" width="180" height="60" />
        <h1>Before you enter</h1>
        <p>Read the three documents below and accept them to open the workspace. Version {legal.version}. They are also at <a href="/legal/terms" target="_blank" rel="noreferrer">/legal</a>.</p>
        <div className="consent-tabs" role="tablist">
          {Object.values(legal.docs).map((d) => <button key={d.id} role="tab" aria-selected={tab === d.id} className={`tab-link${tab === d.id ? ' on' : ''}`} onClick={() => setTab(d.id)}>{d.title}{read[d.id] ? ' ✓' : ''}</button>)}
        </div>
        <div className="consent-doc" role="tabpanel" aria-label={doc.title} dangerouslySetInnerHTML={{ __html: doc.html }} />
        <label className="consent-check"><input type="checkbox" checked={read[tab]} onChange={(e) => setRead({ ...read, [tab]: e.target.checked })} /> I have read and accept the {doc.title}</label>
        <div className="consent-foot">
          <input className="key-input" placeholder="Your name (optional, goes on the acceptance record)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
          <button className="btn-stamp attn-btn" disabled={!all || busy} onClick={accept} title={all ? 'Record acceptance and open the workspace' : 'Tick all three documents first'}>Accept all three and enter</button>
        </div>
        {err && <p role="alert" className="key-err">{err}</p>}
        <p className="conn-hint">Acceptance is recorded with the version, the time and, if given, your name. A new version of the rules will ask again.</p>
      </div>
    </div>
  );
}
