// The house playbook: skills the desks run. A skill on the desk is a real
// plan step on every future ticket; take it off and the step disappears.
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Skills({ embedded } = {}) {
  const s = useStore();
  const [err, setErr] = useState(null);
  if (s.error && !s.ready) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>The playbook is unreachable: {s.error}.</p></div>;
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening the playbook…</p></div>;

  const installed = s.skills.filter((sk) => sk.install === 'installed');
  const available = s.skills.filter((sk) => sk.install !== 'installed');

  const Row = ({ sk }) => (
    <div className="board-row" style={{ cursor: 'default' }}>
      <span className="sym" style={{ '--tint': 'var(--flap-ink)' }} aria-hidden="true">{sk.symbol}</span>
      <span className="what">
        <b>{sk.name}</b>
        <span>{sk.desk} · {sk.what}</span>
      </span>
      <button
        className={`toggle-btn${sk.install === 'installed' ? ' on' : ''}`}
        onClick={() => s.toggleSkill(sk.id).catch((e) => setErr(`${sk.name}: ${e.message}`))}
        aria-pressed={sk.install === 'installed'}
        aria-label={`${sk.name}: ${sk.install === 'installed' ? 'on the desk — press to remove' : 'in the drawer — press to add to the desk'}`}
      >
        {sk.install === 'installed' ? 'On the desk' : 'Add to desk'}
      </button>
    </div>
  );

  return (
    <div className="page">
      <h1 className="pg-title">The playbook</h1>
      {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}
      <p className="lede">
        Skills are standing rules the desks run by — graded citations, honest charts, one idea
        per slide. A skill on the desk becomes a plan step on every future ticket; take it off
        and that step is gone from the next contract you write.
      </p>
      <section className="board section-gap" aria-label="Skills on the desks">
        <div className="board-title"><span className="brd-sm">On the desks</span><span className="count">{installed.length}</span></div>
        <div className="board-rows">
          {installed.length === 0 && <div className="board-empty">Nothing on the desks — add a skill from the drawer below and the next ticket's plan picks it up.</div>}
          {installed.map((sk) => <Row key={sk.id} sk={sk} />)}
        </div>
      </section>
      <section className="board section-gap" aria-label="Skills in the drawer">
        <div className="board-title"><span className="brd-sm">In the drawer</span><span className="count">{available.length}</span></div>
        <div className="board-rows">
          {available.length === 0 && <div className="board-empty">The drawer is empty — every skill is on a desk.</div>}
          {available.map((sk) => <Row key={sk.id} sk={sk} />)}
        </div>
      </section>
    </div>
  );
}
