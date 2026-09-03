// The floor: state an outcome, the house writes a ticket, you stamp it,
// the board runs it in the open.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { navigate, Link } from '../lib/router.jsx';
import StatusFlap from '../components/StatusFlap.jsx';

const MAX_ADVISERS = 4;

function Ticket({ mission, onFill, onVoid, busy, error }) {
  return (
    <div className={`ticket tint-${mission.tint} fade-up`} style={{ marginTop: '1.4rem' }}>
      <div className="ticket-band">
        <span className="desk">{mission.deskName}</span>
        <span className="serial">{mission.serial}</span>
      </div>
      <div className="stamp in" aria-hidden="true">Open</div>
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
          <div className="cell"><span className="k">Reserved on stamp</span><span className="v">{mission.contract.ceiling} cr · unspent returns</span></div>
        </div>
      </div>
      <div className="ticket-actions">
        <button className="btn-stamp" onClick={onFill} disabled={busy}>
          {busy ? 'Stamping…' : 'Stamp & run'}
        </button>
        <button className="btn-quiet" onClick={onVoid} disabled={busy}>Void ticket</button>
      </div>
      {error && <p role="alert" className="ticket-error">{error}</p>}
    </div>
  );
}

export default function Floor() {
  const s = useStore();
  const [goal, setGoal] = useState('');
  const [deskId, setDeskId] = useState(() => {
    const q = new URLSearchParams(location.search).get('desk');
    return q || 'brief';
  });
  const [lead, setLead] = useState('opus');
  const [advisers, setAdvisers] = useState(['gpt', 'deepseek']);
  const [ticket, setTicket] = useState(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [councilNote, setCouncilNote] = useState(null);
  const inputRef = useRef(null);
  const deskRefs = useRef([]);

  // Desk handoff from the palette rides the URL (?desk=…): honor it, focus
  // the goal, then strip it so a reload does not re-apply it.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('desk')) {
      inputRef.current?.focus();
      const url = new URL(location.href);
      url.searchParams.delete('desk');
      history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const desk = useMemo(() => (s.desks || []).find((d) => d.id === deskId) || (s.desks || [])[0], [s.desks, deskId]);

  if (s.error && !s.ready) {
    return (
      <div className="page">
        <p role="alert" style={{ color: 'var(--rose)' }}>The server is unreachable: {s.error}. Is Prajñā running on port 3005?</p>
        <button className="btn-quiet" onClick={s.refresh} style={{ marginTop: '1rem' }}>Try again</button>
      </div>
    );
  }
  if (!s.ready) {
    return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Opening your missions…</p></div>;
  }

  const toggleAdviser = (id) => {
    if (id === lead) return;
    setCouncilNote(null);
    setAdvisers((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      if (prev.length >= MAX_ADVISERS) {
        setCouncilNote(`The council seats ${MAX_ADVISERS} advisers plus the lead — unseat one before adding another.`);
        return prev;
      }
      return [...prev, id];
    });
  };
  const makeLead = (id) => {
    setCouncilNote(null);
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
    setBusy(true);
    setError(null);
    try {
      await s.launch(ticket.id);
      navigate(`/run/${ticket.id}`);
    } catch (e) {
      // The house names the problem; whether anything was spent is its call.
      setError(`The ticket was not stamped: ${e.message}`);
      setBusy(false);
    }
  };

  const voidTicket = async () => {
    setBusy(true);
    setError(null);
    try {
      await s.voidTicket(ticket.id);
      setTicket(null);
    } catch (e) {
      setError(`The ticket could not be voided: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Desk picker: a real radio group — arrow keys move, one tab stop.
  const onDeskKey = (e, idx) => {
    const n = s.desks.length;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % n;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + n) % n;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    setDeskId(s.desks[next].id);
    deskRefs.current[next]?.focus();
  };

  const open = s.missions.filter((m) => m.status === 'LIVE' || m.status === 'OPEN' || m.status.startsWith('PAUSED'));
  const delivered = s.missions.filter((m) => m.status === 'FILLED').slice(0, 6);

  return (
    <div className="page">
      {s.error && (
        <p role="status" className="soft-banner">Live updates paused — the server is unreachable ({s.error}). Your work here is kept.</p>
      )}
      <h1 className="pg-title">Open a mission</h1>
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
              {s.desks.map((d, i) => (
                <button
                  key={d.id}
                  ref={(el) => (deskRefs.current[i] = el)}
                  role="radio"
                  aria-checked={deskId === d.id}
                  tabIndex={deskId === d.id ? 0 : -1}
                  className={`desk-stub tint-${d.tint}${deskId === d.id ? ' on' : ''}`}
                  onClick={() => setDeskId(d.id)}
                  onKeyDown={(e) => onDeskKey(e, i)}
                >
                  <span className="code">{d.code} · {d.deliverable.toUpperCase()}</span>
                  <span className="nm" style={{ display: 'block' }}>{d.name}</span>
                  <span className="dl">{d.blurb}</span>
                </button>
              ))}
            </div>
            <div className="council-row">
              <span className="lbl" id="council-label">The council — tap a model to seat it as adviser; use its Lead button to make it lead</span>
              <div className="council-chips" role="group" aria-labelledby="council-label">
                {s.models.map((m) => {
                  const isLead = lead === m.id;
                  const isAdv = advisers.includes(m.id);
                  return (
                    <span key={m.id} className={`model-chip${isLead ? ' lead' : isAdv ? ' adv' : ''}`}>
                      <button
                        className="chip-main"
                        onClick={() => toggleAdviser(m.id)}
                        aria-pressed={isAdv}
                        disabled={isLead}
                        aria-label={isLead ? `${m.name} is the lead` : `${m.name} — ${isAdv ? 'seated as adviser; press to unseat' : 'not seated; press to seat as adviser'}`}
                        title={m.role}
                      >
                        <span className="sym" aria-hidden="true">{m.symbol}</span>
                        <span className="nm">{m.name}</span>
                      </button>
                      {isLead ? (
                        <span className="tag">Lead</span>
                      ) : (
                        <button className="chip-lead" onClick={() => makeLead(m.id)} aria-label={`Make ${m.name} the lead`} title="Make lead">Lead</button>
                      )}
                    </span>
                  );
                })}
              </div>
              <span className="council-note" role="status">
                {councilNote || `${1 + advisers.length} seats · lead synthesizes, advisers challenge, dissent is recorded — never erased.`}
              </span>
            </div>
          </div>
          <div className="orderpad-foot">
            <button className="btn-stamp" onClick={writeTicket} disabled={!goal.trim() || writing}>
              {writing ? 'Writing…' : 'Write ticket'}
            </button>
            {error && <span role="alert" style={{ color: 'var(--rose)', fontSize: '0.8rem' }}>{error}</span>}
            <span className="est">
              The ticket shows the full plan and price.<br />Nothing runs until you stamp it.
            </span>
          </div>
        </section>
      )}

      {ticket && <Ticket mission={ticket} onFill={fill} onVoid={voidTicket} busy={busy} error={error} />}

      <section className="board section-gap" aria-label="Mission board">
        <div className="board-title">
          <span className="brd-sm">Mission board</span>
          <span className="count">{open.length}</span>
        </div>
        <div className="board-rows">
          {open.length === 0 && (
            <div className="board-empty">The board is quiet. Write a ticket above to open your first mission.</div>
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

      <section className="board section-gap" aria-label="Delivered">
        <div className="board-title">
          <span className="brd-sm">Delivered</span>
          <span className="count">{delivered.length}</span>
        </div>
        <div className="board-rows">
          {delivered.length === 0 && <div className="board-empty">Nothing delivered yet — the first finished mission lands here.</div>}
          {delivered.map((m) => (
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
