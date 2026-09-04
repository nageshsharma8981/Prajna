// Home / New chat: greeting, composer, promos.
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { navigate, Link } from '../lib/router.jsx';
import Composer from '../components/Composer.jsx';
import { MediaIcon, SparkIcon, ArrowIcon } from '../components/icons.jsx';

export default function Home() {
  const s = useStore();
  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>The server is unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening…</p></div>;

  const first = (s.profile?.name || 'there').split(' ')[0];
  // First run: a fresh workspace gets three steps and a one-minute sample.
  const forced = new URLSearchParams(location.search).get('welcome') === '1';
  let dismissed = false; try { dismissed = localStorage.getItem('prajna-welcome') === 'seen'; } catch { /* no storage */ }
  const [hidden, setHidden] = useState(false);
  const showWelcome = !hidden && (forced || ((s.chats || []).length === 0 && !dismissed));
  const dismiss = () => { try { localStorage.setItem('prajna-welcome', 'seen'); } catch { /* no storage */ } setHidden(true); };
  const [sampling, setSampling] = useState(false);
  const sample = async () => {
    setSampling(true);
    try {
      const goal = 'Should a neighbourhood coffee roaster add a subscription — a fast brief';
      const r = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'research', title: goal.slice(0, 60) }) });
      const chat = await r.json();
      await fetch(`/api/chats/${chat.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: goal, mode: 'research', depth: 'fast' }) });
      dismiss(); await s.refresh(); navigate(`/c/${chat.id}`);
    } catch { setSampling(false); }
  };
  const initial = new URLSearchParams(location.search).get('mode') || 'chat';

  const send = async (payload) => {
    const r = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: payload.mode, title: payload.text.slice(0, 60) }) });
    const chat = await r.json();
    if (payload.mode === 'chat') {
      // Hand the first message to the thread so the reply streams there.
      sessionStorage.setItem(`prajna-pending-${chat.id}`, JSON.stringify(payload));
      await s.refresh();
      navigate(`/c/${chat.id}`);
      return;
    }
    const r2 = await fetch(`/api/chats/${chat.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r2.json().catch(() => ({}));
    if (!r2.ok) throw new Error(j.error || 'The house refused the message.');
    await s.refresh();
    navigate(`/c/${chat.id}`);
  };

  return (
    <div className={`home${showWelcome ? ' with-welcome' : ''}`}>
      <aside className="promos" aria-label="Featured">
        <Link to="/media" className="promo"><span className="promo-ic"><MediaIcon /></span><span>Create videos<br />and photos</span><ArrowIcon /></Link>
        <Link to="/?mode=chat" className="promo"><span className="promo-ic"><SparkIcon /></span><span>Try the companion —<br />a mind by your side</span><ArrowIcon /></Link>
      </aside>
      <div className="home-center">
        {showWelcome && (
          <section className="welcome" aria-label="Welcome">
            <div className="welcome-head"><span className="k">First run</span><button className="x" onClick={dismiss} aria-label="Dismiss welcome">×</button></div>
            <h2>Every request becomes a contract. Every run is watched. Every delivery carries its evidence.</h2>
            <ol className="welcome-steps">
              <li><b>Ask for an outcome.</b> Pick a mode below — website, mobile app, deck, research, analysis — and say what you want. The house writes a ticket: the plan and the price, before anything runs.</li>
              <li><b>Watch it run.</b> Every step, panel position and cost prints on the tape. When the gate refuses or the ceiling is hit, the decision comes to you, with a justification on the record.</li>
              <li><b>Take the delivery.</b> The artifact carries its provenance: who wrote what, which sources, what was sealed, what you decided. Amend it with notes, compare versions, or hand over the audit bundle.</li>
            </ol>
            <div className="welcome-actions">
              <button className="btn-stamp attn-btn" onClick={sample} disabled={sampling}>{sampling ? 'Writing the ticket…' : 'Run a one-minute sample'}</button>
              <Link to="/keys" className="btn-quiet">Load a key so seats go live</Link>
              <span className="conn-hint">Without a key the house runs in its scripted voice and labels every sample as such.</span>
            </div>
          </section>
        )}
        <h1 className="greet">Hey <em>{first}</em><br /><span>What's on your mind today?</span></h1>
        <Composer onSend={send} initialMode={initial} />
      </div>
      <section className="feature-cards" aria-label="Community">
        <Link to="/factory/community" className="feature-card">
          <div><b>Real values,<br />real work</b><p>Explore real use cases made with Prajñā.</p></div>
          <div className="feature-art" aria-hidden="true"><span className="fa-slab" /><span className="fa-slab two" /><span className="fa-slab three" /></div>
        </Link>
        <Link to="/factory/community?submit=1" className="feature-card">
          <div><b>Submit your work<br />&amp; earn credits</b><p>Prajñā features your work and grants credits.</p></div>
          <div className="feature-art coin" aria-hidden="true"><span className="fa-coin" /><span className="fa-coin two" /></div>
        </Link>
      </section>
      <p className="disclaimer">Prajñā outputs may contain errors or omissions. Prajñā does not train models on your workspace data.</p>
    </div>
  );
}
