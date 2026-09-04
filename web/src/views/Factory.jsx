// Factory: CLI · Community · Skills · Assets · Projects
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link, navigate } from '../lib/router.jsx';
import Skills from './Skills.jsx';

const TABS = [['cli', 'CLI'], ['community', 'Community'], ['skills', 'Skills'], ['assets', 'Assets'], ['projects', 'Projects']];

const SHOWCASE = [
  { id: 'sc1', title: 'The Renaissance — when humanity dared to dream', kind: 'deck', by: 'house', prompt: 'A nine-beat deck on the Renaissance for an international presentation competition', mode: 'deck' },
  { id: 'sc2', title: 'Climate metrics dashboard', kind: 'site', by: 'house', prompt: 'Design an interactive climate metrics dashboard site', mode: 'website' },
  { id: 'sc3', title: 'Who wins the enterprise agent market?', kind: 'brief', by: 'house', prompt: 'State of AI agent platforms — who wins the enterprise?', mode: 'research' },
  { id: 'sc4', title: 'Fitness tracker — tappable prototype', kind: 'mobile', by: 'house', prompt: 'Build a mobile app for a fitness tracker', mode: 'mobile' },
];

export default function Factory({ tab }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening the factory…</p></div>;
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
      <h1 className="pg-title">Factory</h1>
      <nav className="tabs-row" aria-label="Factory sections">
        {TABS.map(([id, label]) => <Link key={id} to={`/factory/${id}`} className={`tab-link${t === id ? ' on' : ''}`} aria-current={t === id ? 'page' : undefined}>{label}</Link>)}
      </nav>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

      {t === 'cli' && (
        <section className="section-gap">
          <p className="lede">Run Prajñā from your terminal — the same engine, the same contracts. The CLI talks to this workspace over the API.</p>
          <div className="board" style={{ marginTop: '1rem' }}>
            <div className="board-title"><span className="brd-sm">Install</span></div>
            <pre className="code">npx prajna-cli login --workspace {location.origin}
npx prajna-cli run --mode research "Should we enter the EU home-battery market?"
npx prajna-cli tape PJ-4215        # stream a mission's tape
npx prajna-cli artifacts --download latest</pre>
            <p className="conn-note">The CLI package publishes with the first public release; until then, every command above maps 1:1 to the HTTP API documented in the README. Keys are read from your environment and never sent anywhere but the provider.</p>
          </div>
        </section>
      )}

      {t === 'community' && (
        <section className="section-gap">
          <p className="lede">Real use cases made with Prajñā — prompts and model choices visible, one click to clone into your own chat.</p>
          {submit && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>Submissions open with the first public release: featured work earns 200 credits. Your delivered artifacts are listed under Assets.</p>}
          <div className="showcase-grid">
            {SHOWCASE.map((sc) => (
              <article key={sc.id} className={`showcase tint-${sc.kind === 'deck' ? 'rose' : sc.kind === 'site' ? 'blue' : sc.kind === 'brief' ? 'amber' : 'green'}`}>
                <div className="showcase-art" aria-hidden="true" />
                <b>{sc.title}</b>
                <span>{sc.kind} · by {sc.by} · prompt visible</span>
                <p className="mono">“{sc.prompt}”</p>
                <button className="btn-stamp attn-btn" onClick={() => clone(sc)}>Clone into a chat</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {t === 'skills' && <Skills embedded />}

      {t === 'assets' && (
        <section className="board section-gap" aria-label="Assets">
          <div className="board-title"><span className="brd-sm">Your assets</span><span className="count">{s.artifacts.length}</span></div>
          <div className="board-rows">
            {s.artifacts.length === 0 && <div className="board-empty">Nothing delivered yet.</div>}
            {s.artifacts.map((a) => (
              <Link key={a.id} to={`/artifact/${a.id}`} className="board-row">
                <span className={`sym tint-${a.tint}`}>{a.serial}</span>
                <span className="what"><b>{a.title.replace(/^VOID · /, '')}</b><span>{a.kind} · v{a.version} · {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                <span className="num">{a.cost.toFixed(1)} cr</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {t === 'projects' && (
        <section className="section-gap">
          <div className="board">
            <div className="board-title"><span className="brd-sm">Projects</span><span className="count">{(s.projects || []).length}</span></div>
            <div className="board-rows">
              {(s.projects || []).map((p) => (
                <div key={p.id} className="board-row" style={{ cursor: 'default' }}>
                  <span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>{p.name.slice(0, 3).toUpperCase()}</span>
                  <span className="what"><b>{p.name}</b><span>{p.chatIds.length} chats · created {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                  {p.id !== 'p_default' && <button className="toggle-btn" onClick={async () => { await fetch(`/api/projects/${p.id}`, { method: 'DELETE' }); s.refresh(); }}>Delete</button>}
                </div>
              ))}
              <div className="key-add" style={{ gridTemplateColumns: '1fr auto' }}>
                <input className="key-input" placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
                <button className="btn-stamp attn-btn" onClick={addProject} disabled={!name.trim()}>Create project</button>
              </div>
            </div>
          </div>
          <p className="conn-note" style={{ padding: '0.8rem 0' }}>Missions and their contracts live under <Link to="/missions">Missions</Link>.</p>
        </section>
      )}
    </div>
  );
}
