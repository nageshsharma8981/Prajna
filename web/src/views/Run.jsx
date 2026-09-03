// The run deck: the ticket on the left, the live tape in the open, LED
// telemetry above. Everything the agent does is on the record.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useStore } from '../lib/store.jsx';
import StatusFlap from '../components/StatusFlap.jsx';
import SplitFlap from '../components/SplitFlap.jsx';
import { OpenIcon, BackIcon } from '../components/icons.jsx';

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Run({ id }) {
  const store = useStore();
  const [mission, setMission] = useState(null);
  const [events, setEvents] = useState([]);
  const [now, setNow] = useState(Date.now());
  const feedRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    setMission(null);
    setEvents([]);
    const es = new EventSource(`/api/missions/${id}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'snapshot') {
        setMission(ev.mission);
        setEvents(ev.mission.events || []);
      } else {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'run.launched') {
          setMission((m) => (m ? { ...m, status: 'LIVE', launchedAt: ev.at } : m));
        }
        if (ev.type === 'step.status') {
          setMission((m) => {
            if (!m) return m;
            const plan = m.contract.plan.map((p) => (p.id === ev.stepId ? { ...p, status: ev.status } : p));
            return { ...m, status: 'LIVE', contract: { ...m.contract, plan } };
          });
        }
        if (ev.type === 'cost') setMission((m) => (m ? { ...m, spent: ev.total } : m));
        if (ev.type === 'artifact.ready') setMission((m) => (m ? { ...m, artifactId: ev.artifactId } : m));
        if (ev.type === 'run.done') {
          setMission((m) => (m ? { ...m, status: 'FILLED', filledAt: ev.at } : m));
          store.refresh();
        }
      }
    };
    return () => es.close();
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  const stepTitle = useMemo(() => {
    const map = {};
    mission?.contract.plan.forEach((p, i) => (map[p.id] = `${i + 1} · ${p.title}`));
    return map;
  }, [mission]);

  if (!mission) {
    return <div className="page"><p style={{ color: 'var(--bone-faint)' }}>Pulling the ticket…</p></div>;
  }

  const live = mission.status === 'LIVE';
  const filled = mission.status === 'FILLED';
  const elapsed = mission.launchedAt ? (filled && mission.filledAt ? mission.filledAt - mission.launchedAt : now - mission.launchedAt) : 0;
  const stepsFilled = mission.contract.plan.filter((p) => p.status === 'FILLED').length;
  const artifact = filled || mission.artifactId ? (store.artifacts || []).find((a) => a.id === mission.artifactId) : null;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/" className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} aria-label="Back to the floor"><BackIcon /> Floor</Link>
        <SplitFlap text={mission.serial} size="0.9rem" />
        <StatusFlap status={mission.status} />
      </div>

      <div className="telemetry" role="status" aria-label="Run telemetry">
        <div className="cell"><span className="k">Spent</span><span className="v">{mission.spent.toFixed(1)}<small> cr</small></span></div>
        <div className="cell"><span className="k">Ceiling</span><span className="v">{mission.contract.ceiling}<small> cr</small></span></div>
        <div className="cell"><span className="k">Elapsed</span><span className="v">{fmtElapsed(elapsed)}</span></div>
        <div className="cell"><span className="k">Steps</span><span className={`v${filled ? ' ok' : ''}`}>{stepsFilled}<small> / {mission.contract.plan.length}</small></span></div>
      </div>

      <div className="deckgrid">
        <aside className={`ticket tint-${mission.tint}`} aria-label="Mission contract">
          <div className="ticket-band">
            <span className="desk">{mission.deskName}</span>
            <span className="serial">{mission.serial}</span>
          </div>
          {filled && <div className="stamp in">Filled</div>}
          <div className="ticket-inner">
            <p className="ticket-goal">{mission.goal}</p>
            <p className="ticket-deliv">council: {mission.councilNames.join(', ')}</p>
            <ol className="ticket-plan">
              {mission.contract.plan.map((p, i) => (
                <li key={p.id}>
                  <span className="n">{i + 1}</span>
                  <span className="t" style={{ opacity: p.status === 'QUEUED' ? 0.55 : 1 }}>{p.title}</span>
                  <StatusFlap status={p.status} />
                </li>
              ))}
            </ol>
            <div className="ticket-tally">
              <div className="cell"><span className="k">Estimate</span><span className="v">{mission.contract.estimate} cr</span></div>
              <div className="cell"><span className="k">Actual</span><span className="v">{mission.spent.toFixed(1)} cr</span></div>
            </div>
          </div>
        </aside>

        <section className="tape" aria-label="Live tape" aria-live="polite">
          <div className="board-title">
            <span className="brd-sm">The tape — every move on the record</span>
            {live && <span className="count" style={{ animation: 'flapflip 1.2s linear infinite' }}>LIVE</span>}
          </div>
          <div className="tape-feed" ref={feedRef} style={{ maxHeight: '34rem' }}>
            {events.filter((e) => e.type !== 'snapshot').map((ev, i) => {
              if (ev.type === 'run.launched') {
                return <div key={i} className="tape-step"><span>Order filled — run opened</span><span className="rule" /></div>;
              }
              if (ev.type === 'step.status' && ev.status === 'LIVE') {
                return <div key={i} className="tape-step"><span>{stepTitle[ev.stepId]}</span><span className="rule" /></div>;
              }
              if (ev.type === 'log') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{new Date(ev.at).toLocaleTimeString('en-GB', { hour12: false }).slice(3)}</span>
                    <span className="op">{ev.label}</span>
                    <span className="detail">{ev.detail}</span>
                  </div>
                );
              }
              if (ev.type === 'council.position' || ev.type === 'council.challenge' || ev.type === 'council.verdict') {
                const cls = ev.type === 'council.challenge' ? 'challenge' : ev.type === 'council.verdict' ? 'verdict' : '';
                const role = ev.type === 'council.challenge' ? 'challenge' : ev.type === 'council.verdict' ? 'verdict' : 'position';
                return (
                  <div key={i} className={`quote ${cls}`}>
                    <div className="who">
                      <span className="sym">{ev.symbol}</span>
                      <b>{ev.model}</b>
                      <span className="role">{role}</span>
                    </div>
                    <p>{ev.text}</p>
                    {ev.dissent && (
                      <div className="dissent"><b>Recorded dissent — {ev.dissent.model}</b><br />{ev.dissent.text}</div>
                    )}
                  </div>
                );
              }
              if (ev.type === 'artifact.build') {
                return <div key={i} className="tape-step"><span>Composing the artifact</span><span className="rule" /></div>;
              }
              if (ev.type === 'artifact.ready') {
                return (
                  <div key={i} className="artifact-card">
                    <div className="t">
                      <b>{ev.title}</b>
                      <span>versioned artifact · in the ledger</span>
                    </div>
                    <Link to={`/artifact/${ev.artifactId}`} className="btn-stamp" style={{ padding: '0.55rem 1rem', fontSize: '0.72rem' }}>
                      <OpenIcon /> Open
                    </Link>
                  </div>
                );
              }
              if (ev.type === 'run.done') {
                return (
                  <div key={i} className="tape-step">
                    <span style={{ color: 'var(--green)' }}>Position filled · {ev.total?.toFixed(1)}cr of {mission.contract.ceiling}cr ceiling · {fmtElapsed(ev.elapsed || 0)}</span>
                    <span className="rule" />
                  </div>
                );
              }
              return null;
            })}
            {mission.status === 'OPEN' && (
              <div className="board-empty" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <span>This ticket is written but not filled. Nothing has run and nothing has been spent.</span>
                <span style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    className="btn-stamp"
                    onClick={async () => {
                      await store.launch(mission.id);
                    }}
                  >
                    Fill order — run it
                  </button>
                  <button
                    className="btn-quiet"
                    onClick={async () => {
                      await store.voidTicket(mission.id);
                      history.back();
                    }}
                  >
                    Void ticket
                  </button>
                </span>
              </div>
            )}
            {mission.status === 'KILLED' && (
              <div className="board-empty">Ticket voided before any spend. The serial is retired.</div>
            )}
            {live && events.length < 2 && <div className="board-empty">Waiting for the first print…</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
