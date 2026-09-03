// The floor: state an outcome, the house writes a ticket, you stamp it filled,
// the board runs it in the open.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { navigate, Link } from '../lib/router.jsx';
import StatusFlap from '../components/StatusFlap.jsx';

function Ticket({ mission, onFill, onVoid, filling }) {
  return (
    <div className={`ticket tint-${mission.tint} fade-up`} style={{ marginTop: '1.4rem' }}>
      <div className="ticket-band">
        <span className="desk">{mission.deskName}</span>
        <span className="serial">{mission.serial}</span>
      </div>
      <div className="stamp in">Open</div>
      <div className="ticket-inner">
        <p className="ticket-goal">{mission.goal}</p>
        <p className="ticket-deliv">deliverable: {mission.deliverable.toLowerCase()} · council of {mission.councilNames.length}: {mission.councilNames.join(', ')}</p>
        <ol className="ticket-plan">
          {mission.contract.plan.map((p, i) => (
            <li key={p.id}>
              <span className="n">{i + 1}</span>
              <span className="t">{p.title}</span>
              <span className="c">~{p.cost}cr</span>
            </li>
          ))}
        </ol>
        <div className="ticket-tally">
          <div className="cell"><span className="k">Estimate</span><span className="v">{mission.contract.estimate} cr</span></div>
          <div className="cell"><span className="k">Hard ceiling</span><span className="v">{mission.contract.ceiling} cr</span></div>
          <div className="cell"><span className="k">Refund rule</span><span className="v">stops at ceiling</span></div>
        </div>
      </div>
      <div className="ticket-actions">
        <button className="btn-stamp" onClick={onFill} disabled={filling}>
          {filling ? 'Filling…' : 'Fill order — run it'}
        </button>
        <button className="btn-quiet" onClick={onVoid} disabled={filling}>Void ticket</button>
      </div>
    </div>
  );
}

export default function Floor() {
  const s = useStore();
  const [goal, setGoal] = useState('');
  const [deskId, setDeskId] = useState('brief');
  const [lead, setLead] = useState('opus');
  const [advisers, setAdvisers] = useState(['gpt', 'deepseek']);
  const [ticket, setTicket] = useState(null);
  const [writing, setWriting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onDesk = (e) => {
      setDeskId(e.detail);
      inputRef.current?.focus();
    };
    addEventListener('praxis:desk', onDesk);
    return () => removeEventListener('praxis:desk', onDesk);
  }, []);

  const desk = useMemo(() => (s.desks || []).find((d) => d.id === deskId), [s.desks, deskId]);

  if (!s.ready) {
    return <div className="page"><p style={{ color: 'var(--bone-faint)' }}>Opening the hall…</p></div>;
  }
  if (s.error) {
    return <div className="page"><p style={{ color: 'var(--rose)' }}>The hall is unreachable: {s.error}. Is the server running on port 3005?</p></div>;
  }

  const toggleAdviser = (id) => {
    if (id === lead) return;
    setAdvisers((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id].slice(0, 4)));
  };
  const makeLead = (id) => {
    setLead(id);
    setAdvisers((prev) => prev.filter((a) => a !== id));
  };

  const writeTicket = async () => {
    if (!goal.trim() || writing) return;
    setWriting(true);
    setError(null);
    try {
      const m = await s.writeTicket({ goal, deskId, lead, advisers });
      setTicket(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setWriting(false);
    }
  };

  const fill = async () => {
    setFilling(true);
    setError(null);
    try {
      await s.launch(ticket.id);
      navigate(`/run/${ticket.id}`);
    } catch (e) {
      setError(`The order could not be filled: ${e.message}. Nothing was spent — try again.`);
      setFilling(false);
    }
  };

  const open = s.missions.filter((m) => m.status === 'LIVE' || m.status === 'OPEN');
  const fills = s.missions.filter((m) => m.status === 'FILLED').slice(0, 6);

  return (
    <div className="page">
      <h1 className="pg-title">Open a position</h1>
      <p className="lede">
        State the outcome you want. The house writes a ticket — the plan and the price —
        before a single credit is spent. Nothing runs until you stamp it.
      </p>

      {!ticket && (
        <section className="orderpad fade-up" aria-label="Order pad">
          <div className="orderpad-head">
            <span className="brd-sm">Order pad</span>
            <span className="brd-sm" style={{ color: 'var(--bone-faint)' }}>{desk?.deliverable}</span>
          </div>
          <div className="orderpad-body">
            <textarea
              ref={inputRef}
              className="goal-input"
              rows={2}
              placeholder={desk?.placeholder}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) writeTicket();
              }}
              aria-label="Mission goal"
            />
            <div className="samples">
              {desk?.samples.map((sample) => (
                <button key={sample} className="sample-chip" onClick={() => setGoal(sample)}>{sample}</button>
              ))}
            </div>
            <div className="desk-row" role="radiogroup" aria-label="Desk">
              {s.desks.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={deskId === d.id}
                  className={`desk-stub tint-${d.tint}${deskId === d.id ? ' on' : ''}`}
                  onClick={() => setDeskId(d.id)}
                >
                  <span className="code">{d.code} · {d.deliverable.toUpperCase()}</span>
                  <span className="nm" style={{ display: 'block' }}>{d.name}</span>
                  <span className="dl">{d.blurb}</span>
                </button>
              ))}
            </div>
            <div className="council-row">
              <span className="lbl">The council — click to advise, double-click to lead</span>
              <div className="council-chips">
                {s.models.map((m) => {
                  const isLead = lead === m.id;
                  const isAdv = advisers.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      className={`model-chip${isLead ? ' lead' : isAdv ? ' adv' : ''}`}
                      onClick={() => toggleAdviser(m.id)}
                      onDoubleClick={() => makeLead(m.id)}
                      onKeyDown={(e) => {
                        if (e.key.toLowerCase() === 'l') {
                          e.preventDefault();
                          e.stopPropagation();
                          makeLead(m.id);
                        }
                      }}
                      aria-pressed={isLead || isAdv}
                      aria-label={`${m.name} — ${isLead ? 'lead' : isAdv ? 'adviser' : 'not seated'}. Enter toggles adviser, L makes lead.`}
                      title={`${m.role} · click to advise, double-click or press L to lead`}
                    >
                      <span className="sym">{m.symbol}</span>
                      <span className="nm">{m.name}</span>
                      {isLead && <span className="tag">Lead</span>}
                    </button>
                  );
                })}
              </div>
              <span className="council-note">
                {(1 + advisers.length)} seats · lead synthesizes, advisers challenge, dissent is recorded — never erased.
                Keyboard: Enter seats an adviser, L makes it lead.
              </span>
            </div>
          </div>
          <div className="orderpad-foot">
            <button className="btn-stamp" onClick={writeTicket} disabled={!goal.trim() || writing}>
              {writing ? 'Writing…' : 'Write ticket'}
            </button>
            {error && <span style={{ color: 'var(--rose)', fontSize: '0.8rem' }}>{error}</span>}
            <span className="est">
              The ticket shows the full plan and price.<br />Nothing runs until you approve it.
            </span>
          </div>
        </section>
      )}

      {ticket && <Ticket mission={ticket} onFill={fill} onVoid={() => setTicket(null)} filling={filling} />}
      {ticket && error && (
        <p role="alert" style={{ color: 'var(--rose)', fontSize: '0.85rem', margin: '0.8rem 0 0' }}>{error}</p>
      )}

      <section className="board section-gap" aria-label="Positions board">
        <div className="board-title">
          <span className="brd-sm">Positions board</span>
          <span className="count">{open.length}</span>
        </div>
        <div className="board-rows">
          {open.length === 0 && (
            <div className="board-empty">The board is quiet. Write a ticket above to open your first position.</div>
          )}
          {open.map((m) => (
            <Link key={m.id} to={`/run/${m.id}`} className="board-row">
              <span className={`sym tint-${m.tint}`}>{m.serial}</span>
              <span className="what">
                <b>{m.subject}</b>
                <span>{m.deskName} · council of {m.councilNames.length}</span>
              </span>
              <span className="num">{m.spent.toFixed(1)} / {m.contract.ceiling} cr</span>
              <StatusFlap status={m.status} />
            </Link>
          ))}
        </div>
      </section>

      <section className="board section-gap" aria-label="Recent fills">
        <div className="board-title">
          <span className="brd-sm">Recent fills</span>
          <span className="count">{fills.length}</span>
        </div>
        <div className="board-rows">
          {fills.map((m) => (
            <Link key={m.id} to={m.artifactId ? `/artifact/${m.artifactId}` : `/run/${m.id}`} className="board-row">
              <span className={`sym tint-${m.tint}`}>{m.serial}</span>
              <span className="what">
                <b>{m.subject}</b>
                <span>{m.deliverable} · {m.spent.toFixed(1)}cr · {new Date(m.filledAt || m.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </span>
              <span className="num">{m.councilNames.join(' · ')}</span>
              <StatusFlap status="FILLED" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
