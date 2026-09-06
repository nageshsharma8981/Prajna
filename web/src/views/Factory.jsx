// Factory: CLI · Community · Skills · Assets · Projects
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link, navigate } from '../lib/router.jsx';
import Skills from './Skills.jsx';

const TABS = [['cli', 'Terminal'], ['community', 'Showroom'], ['skills', 'Crafts'], ['assets', 'Deliveries'], ['projects', 'Folders']];

const SHOWCASE = [
  { id: 'sc1', title: 'The Renaissance: when humanity dared to dream', kind: 'deck', by: 'house', prompt: 'A nine-beat deck on the Renaissance for an international presentation competition', mode: 'deck' },
  { id: 'sc2', title: 'Climate metrics dashboard', kind: 'site', by: 'house', prompt: 'Design an interactive climate metrics dashboard site', mode: 'website' },
  { id: 'sc3', title: 'Who wins the enterprise agent market?', kind: 'brief', by: 'house', prompt: 'State of AI agent platforms, who wins the enterprise?', mode: 'research' },
  { id: 'sc4', title: 'Fitness tracker: tappable prototype', kind: 'mobile', by: 'house', prompt: 'Build a mobile app for a fitness tracker', mode: 'mobile' },
];

export default function Factory({ tab }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [proven, setProven] = useState(null);
  useEffect(() => { if (tab === 'community') fetch('/api/proven').then((r) => r.json()).then((j) => setProven(j.proven || [])).catch(() => setProven([])); }, [tab]);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening the foundry…</p></div>;
  const t = TABS.some(([id]) => id === tab) ? tab : 'cli';
  const submit = new URLSearchParams(location.search).get('submit');

  const clone = async (sc) => {
    const r = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: sc.mode, title: sc.title }) });
    const chat = await r.json();
    const r2 = await fetch(`/api/chats/${chat.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: sc.prompt, mode: sc.mode }) });
    if (!r2.ok) { setErr((await r2.json().catch(() => ({}))).error || 'Refused.'); return; }
    await s.refresh(); navigate(`/c/${chat.id}`);
  };
  const addProject = async () => {
    if (!name.trim()) return;
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    if (r.ok) { setName(''); s.refresh(); }
  };

  return (
    <div className="page">
      <h1 className="pg-title">Foundry</h1>
      <nav className="tabs-row" aria-label="Foundry sections">
        {TABS.map(([id, label]) => <Link key={id} to={`/factory/${id}`} className={`tab-link${t === id ? ' on' : ''}`} aria-current={t === id ? 'page' : undefined}>{label}</Link>)}
      </nav>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

      {t === 'cli' && (
        <section className="section-gap">
          <p className="lede">Run Prajñā from your terminal, the same engine, the same contracts. The CLI talks to this workspace over the API.</p>
          <div className="board" style={{ marginTop: '1rem' }}>
            <div className="board-title"><span className="brd-sm">Install</span></div>
            <pre className="code">git clone https://github.com/nageshsharma8981/Prajna && cd Prajna && npm link   # installs the `prajna` command
prajna login {location.origin}{'\n'}prajna run research "Should we enter the EU home-battery market?" --fast
prajna run website "A landing page for a Bengaluru coffee roaster" --auto --out ./deliveries
prajna status · prajna tape &lt;mission-id&gt; · prajna artifacts · prajna get &lt;artifact-id&gt;{'\n'}prajna repeat PJ-4516 weekly · prajna standing · prajna check · prajna repair</pre>
            <p className="conn-note">Zero dependencies, Node 22+. <code>run</code> streams the tape, stops at every decision the house raises (or takes the first option with <code>--auto</code>, on the record), and saves the delivered artifact with its provenance block. The session file holds only the workspace URL and a server-minted session cookie, never the access code, never a provider key.</p>
          </div>
        </section>
      )}

      {t === 'community' && (
        <section className="section-gap">
          <p className="lede">The showroom: real deliveries made here, the brief and the bench visible, one click to run the same brief yourself.</p>
          <div className="board" style={{ marginBottom: '1.2rem' }} aria-label="Proven briefs">
            <div className="board-title"><span className="brd-sm">Proven in this house</span><span className="count">{proven ? proven.length : '…'}</span></div>
            <p className="conn-note" style={{ padding: '0.4rem 1rem 0.6rem' }}>Ranked by the record, not by likes: briefs that delivered, cleared the gate first time, settled at their estimate, and were asked for again. One click puts the brief on its desk.</p>
            <div className="board-rows">
              {proven && proven.length === 0 && <div className="board-rows"><div className="board-empty">Nothing proven yet: a brief earns its place by delivering.</div></div>}
              {(proven || []).map((b) => (
                <div key={b.use} className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <span className={`sym tint-${b.desk === 'deck' ? 'rose' : b.desk === 'site' ? 'blue' : b.desk === 'brief' ? 'amber' : 'green'}`}>{b.latest.serial}</span>
                  <span className="what"><b>“{b.goal}”</b><span>{b.deskName} · {b.runs} {b.runs === 1 ? 'run' : 'runs'} · {b.why.join(' · ')}{b.look ? ` · look: ${b.look}` : ''} · {b.cost} cr</span></span>
                  <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn-stamp attn-btn" style={{ margin: 0, padding: '0.4rem 0.8rem' }} onClick={() => navigate(b.use)}>Use this brief</button>
                    <Link className="btn-quiet" style={{ margin: 0, padding: '0.4rem 0.8rem' }} to={`/artifact/${b.latest.artifactId}`}>Open the latest</Link>
                    {b.latest.record && <a className="btn-quiet" style={{ margin: 0, padding: '0.4rem 0.8rem' }} href={b.latest.record} target="_blank" rel="noreferrer">Replay</a>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {submit && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>Submit any fully delivered artifact from <Link to="/factory/assets">Deliveries</Link>: it goes public with its provenance block and the house grants 200 credits (demo grant).</p>}
          <div className="showcase-grid">
            {(s.showcase || []).map((sc) => (
              <article key={sc.id} className={`showcase tint-${sc.kind === 'deck' ? 'rose' : sc.kind === 'site' ? 'blue' : sc.kind === 'brief' ? 'amber' : 'green'}`}>
                <div className="showcase-art" aria-hidden="true" />
                <b>{sc.title}</b>
                <span>{sc.kind} · by {sc.by} · {sc.provenance.mode} run · {sc.provenance.sealed}/{sc.provenance.assertions} sealed{sc.provenance.patches ? ` · ${sc.provenance.patches} patched` : ''}</span>
                <p className="mono">“{sc.prompt}”</p>
                <div style={{ display: 'flex', gap: '0.5rem', margin: '0 1rem', flexWrap: 'wrap' }}>
                  <button className="btn-stamp attn-btn" style={{ margin: 0 }} onClick={() => clone(sc)}>Run this brief</button>
                  <a className="btn-quiet" style={{ margin: 0, padding: '0.4rem 0.8rem' }} href={`/s/${sc.shareToken}`} target="_blank" rel="noreferrer">Open (public)</a>
                  {sc.recordToken && <a className="btn-quiet" style={{ margin: 0, padding: '0.4rem 0.8rem' }} href={`/r/${sc.recordToken}`} target="_blank" rel="noreferrer" title="The whole session as a replay: the ask, the three phases, the tape, the delivery">Replay (public)</a>}
                  <button className="btn-quiet" style={{ margin: 0, padding: '0.4rem 0.8rem' }} onClick={async () => { await fetch(`/api/showcase/${sc.id}`, { method: 'DELETE' }); s.refresh(); }}>Withdraw</button>
                </div>
              </article>
            ))}
            {SHOWCASE.map((sc) => (
              <article key={sc.id} className={`showcase tint-${sc.kind === 'deck' ? 'rose' : sc.kind === 'site' ? 'blue' : sc.kind === 'brief' ? 'amber' : 'green'}`}>
                <div className="showcase-art" aria-hidden="true" />
                <b>{sc.title}</b>
                <span>{sc.kind} · by {sc.by} · prompt visible</span>
                <p className="mono">“{sc.prompt}”</p>
                <button className="btn-stamp attn-btn" onClick={() => clone(sc)}>Run this brief</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {t === 'skills' && <Skills embedded />}

      {t === 'assets' && (
        <section className="board section-gap" aria-label="Assets">
          <div className="board-title"><span className="brd-sm">Your deliveries</span><span className="count">{s.artifacts.length}</span></div>
          <div className="board-rows">
            {s.artifacts.length === 0 && <div className="board-empty">Nothing delivered yet.</div>}
            {s.artifacts.map((a) => (
              <Link key={a.id} to={`/artifact/${a.id}`} className="board-row">
                <span className={`sym tint-${a.tint}`}>{a.serial}</span>
                <span className="what"><b>{a.title.replace(/^VOID · /, '')}</b><span>{a.kind} · v{a.version} · {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                <span className="num">{a.cost.toFixed(1)} cr</span>
                {(() => { const m = s.missions.find((x) => x.id === a.missionId); const listed = (s.showcase || []).some((x) => x.artifactId === a.id); const ok = m && m.status === 'FILLED' && !a.partial && !a.voided; return listed ? <span className="toggle-btn on">On showcase</span> : ok ? <button className="toggle-btn" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); setErr(null); const r = await fetch('/api/showcase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ artifactId: a.id }) }); const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Refused.'); s.refresh(); }}>Submit to community</button> : null; })()}
              </Link>
            ))}
          </div>
        </section>
      )}

      {t === 'projects' && (
        <section className="section-gap">
          <div className="board">
            <div className="board-title"><span className="brd-sm">Folders</span><span className="count">{(s.projects || []).length}</span></div>
            <div className="board-rows">
              {(s.projects || []).map((p) => (
                <div key={p.id} className="board-row" style={{ cursor: 'default' }}>
                  <span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>{p.name.slice(0, 3).toUpperCase()}</span>
                  <span className="what"><b>{p.name}</b><span>{p.chatIds.length} chats · created {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                  {p.id !== 'p_default' && <button className="toggle-btn" onClick={async () => { await fetch(`/api/projects/${p.id}`, { method: 'DELETE' }); s.refresh(); }}>Delete</button>}
                </div>
              ))}
              <div className="key-add" style={{ gridTemplateColumns: '1fr auto' }}>
                <input className="key-input" placeholder="New folder name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Folder name" />
                <button className="btn-stamp attn-btn" onClick={addProject} disabled={!name.trim()}>Create folder</button>
              </div>
            </div>
          </div>
          <p className="conn-note" style={{ padding: '0.8rem 0' }}>Missions and their contracts live under <Link to="/missions">Missions</Link>.</p>
        </section>
      )}
    </div>
  );
}
