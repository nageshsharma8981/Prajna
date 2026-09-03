// The house playbook: skills the desks run. Installed skills shape every plan.
import { useStore } from '../lib/store.jsx';

export default function Skills() {
  const s = useStore();
  if (!s.ready) return <div className="page"><p style={{ color: 'var(--bone-faint)' }}>Opening the playbook…</p></div>;

  const installed = s.skills.filter((sk) => sk.install === 'installed');
  const available = s.skills.filter((sk) => sk.install !== 'installed');

  const Row = ({ sk }) => (
    <div className="board-row" style={{ cursor: 'default' }}>
      <span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>{sk.symbol}</span>
      <span className="what">
        <b>{sk.name}</b>
        <span>{sk.desk} · {sk.what}</span>
      </span>
      <button
        className={`toggle-btn${sk.install === 'installed' ? ' on' : ''}`}
        onClick={() => s.toggleSkill(sk.id)}
        aria-pressed={sk.install === 'installed'}
      >
        {sk.install === 'installed' ? 'On the desk' : 'Add to desk'}
      </button>
    </div>
  );

  return (
    <div className="page">
      <h1 className="pg-title">The playbook</h1>
      <p className="lede">
        Skills are standing rules the desks run by — graded citations, honest charts, one idea
        per slide. Install one and every future ticket's plan is written under it.
      </p>
      <section className="board section-gap">
        <div className="board-title"><span className="brd-sm">On the desks</span><span className="count">{installed.length}</span></div>
        <div className="board-rows">{installed.map((sk) => <Row key={sk.id} sk={sk} />)}</div>
      </section>
      <section className="board section-gap">
        <div className="board-title"><span className="brd-sm">In the drawer</span><span className="count">{available.length}</span></div>
        <div className="board-rows">{available.map((sk) => <Row key={sk.id} sk={sk} />)}</div>
      </section>
    </div>
  );
}
