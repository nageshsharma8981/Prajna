// Home / New chat: greeting, composer, promos.
import { useStore } from '../lib/store.jsx';
import { navigate, Link } from '../lib/router.jsx';
import Composer from '../components/Composer.jsx';
import { MediaIcon, SparkIcon, ArrowIcon } from '../components/icons.jsx';

export default function Home() {
  const s = useStore();
  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>The server is unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening…</p></div>;

  const first = (s.profile?.name || 'there').split(' ')[0];
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
    <div className="home">
      <aside className="promos" aria-label="Featured">
        <Link to="/media" className="promo"><span className="promo-ic"><MediaIcon /></span><span>Create videos<br />and photos</span><ArrowIcon /></Link>
        <Link to="/?mode=chat" className="promo"><span className="promo-ic"><SparkIcon /></span><span>Try the companion —<br />a mind by your side</span><ArrowIcon /></Link>
      </aside>
      <div className="home-center">
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
