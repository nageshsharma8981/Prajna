// The run deck: the ticket on the left, the live tape in the open, LED
// telemetry above. Everything the agent does is on the record.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { useStore } from '../lib/store.jsx';
import StatusFlap from '../components/StatusFlap.jsx';
import SplitFlap from '../components/SplitFlap.jsx';
import { OpenIcon, BackIcon } from '../components/icons.jsx';

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const ts = (at) => new Date(at).toLocaleTimeString('en-GB', { hour12: false }).slice(3);

// Decision card for a pending attention item — justification is mandatory
// and goes on the record (ledger + artifact provenance).
function AttentionCard({ missionId, ev, decided }) {
  const [justification, setJustification] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  if (decided) return null;

  const decide = async (decision) => {
    if (!justification.trim()) {
      setError('A justification is required — it goes on the record.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const r = await fetch(`/api/missions/${missionId}/attention/${ev.requestId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, justification }),
      });
      if (!r.ok) {
        setError((await r.json().catch(() => ({}))).error || 'The decision was refused.');
        setSending(false);
      }
    } catch (e) {
      setError(`The decision did not reach the house (${e.message}) — nothing was recorded. Try again.`);
      setSending(false);
    }
  };

  const LABELS = {
    'raise-ceiling': 'Raise ceiling +40%',
    'abort-with-partial': 'Stop — take partial artifact',
    'accept-gap': 'Accept gap on the record',
    'void-artifact': 'Void the artifact',
  };

  return (
    <div className="attn-card" role="group" aria-label="Decision required">
      <div className="attn-head">Decision required — the run is holding</div>
      <p className="attn-prompt">{ev.prompt}</p>
      {ev.gaps?.map((g) => (
        <p key={g.id} className="attn-gap"><b>{g.id}</b> ({g.severity}) — {g.description}</p>
      ))}
      <input
        className="attn-just"
        placeholder="Justification — goes on the record and into the artifact"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        aria-label="Justification for your decision"
      />
      <div className="attn-actions">
        {ev.options.map((o) => (
          <button key={o} className={o.startsWith('raise') || o.startsWith('accept') ? 'btn-stamp attn-btn' : 'btn-quiet'} disabled={sending} onClick={() => decide(o)}>
            {LABELS[o] || o}
          </button>
        ))}
      </div>
      {error && <p className="attn-error" role="alert">{error}</p>}
    </div>
  );
}

// Panel gate: a real table; each vote is a button that reveals its rationale.
function GateGrid({ ev }) {
  const [picked, setPicked] = useState(null);
  const dims = [...new Set(ev.rows.map((r) => r.dimension))];
  const members = [...new Set(ev.rows.map((r) => r.member))];
  const cell = (m, d) => ev.rows.find((r) => r.member === m && r.dimension === d);
  const label = (v) => (v === 'pass' ? 'PASS' : v === 'fail' ? 'FAIL' : 'UNVER');
  return (
    <div className={`gate ${ev.cleared ? 'cleared' : 'blocked'}`}>
      <div className="gate-head">Panel gate — {ev.cleared ? 'CLEARED' : 'NOT CLEARED'}</div>
      <table className="gate-table">
        <caption className="sr-only">Panel votes per acceptance dimension. Select a vote to read its rationale.</caption>
        <thead>
          <tr><th scope="col"><span className="sr-only">Member</span></th>{dims.map((d) => <th key={d} scope="col">{d}</th>)}</tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m}>
              <th scope="row">{m}</th>
              {dims.map((d) => {
                const c = cell(m, d);
                const isPicked = picked && picked.member === m && picked.dimension === d;
                return (
                  <td key={m + d}>
                    <button
                      className={`gv ${c?.verdict}${isPicked ? ' picked' : ''}`}
                      onClick={() => setPicked(isPicked ? null : c)}
                      aria-pressed={isPicked}
                      aria-label={`${m}, ${d}: ${c?.verdict}. Show rationale.`}
                    >
                      {label(c?.verdict)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="gate-note">{picked ? <><b>{picked.member} on {picked.dimension}:</b> {picked.rationale}</> : ev.note}</p>
    </div>
  );
}

export default function Run({ id }) {
  const store = useStore();
  const [mission, setMission] = useState(null);
  const [events, setEvents] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [burn, setBurn] = useState(null); // {total, estimateSoFar, variance}
  const [notFound, setNotFound] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const feedRef = useRef(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    setMission(null);
    setEvents([]);
    setBurn(null);
    setNotFound(false);
    setConfirmStop(false);
    setActionError(null);
    let es = null;
    let cancelled = false;
    // Confirm the mission exists before opening a stream — a stale deep link
    // gets a real not-found state, not an endless retry loop.
    fetch(`/api/missions/${id}`).then(async (r) => {
      if (cancelled) return;
      if (!r.ok) { setNotFound(true); return; }
      es = new EventSource(`/api/missions/${id}/stream`);
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === 'snapshot') {
          setMission(ev.mission);
          setEvents(ev.mission.events || []);
          const lastCost = [...(ev.mission.events || [])].reverse().find((x) => x.type === 'cost' && x.estimateSoFar != null);
          if (lastCost) setBurn({ total: lastCost.total, estimateSoFar: lastCost.estimateSoFar, variance: lastCost.variance ?? 0 });
          return;
        }
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'run.launched') setMission((m) => (m ? { ...m, status: 'LIVE', launchedAt: ev.at } : m));
        if (ev.type === 'step.status') {
          setMission((m) => {
            if (!m) return m;
            const plan = m.contract.plan.map((p) => (p.id === ev.stepId ? { ...p, status: ev.status } : p));
            return { ...m, status: 'LIVE', contract: { ...m.contract, plan } };
          });
          if (ev.status === 'LIVE') setAnnounce(`Step started: ${ev.stepId}`);
        }
        if (ev.type === 'cost') {
          setMission((m) => (m ? { ...m, spent: ev.total } : m));
          if (ev.estimateSoFar != null) setBurn({ total: ev.total, estimateSoFar: ev.estimateSoFar, variance: ev.variance ?? 0 });
        }
        if (ev.type === 'artifact.ready') { setMission((m) => (m ? { ...m, artifactId: ev.artifactId } : m)); setAnnounce('Artifact delivered.'); }
        if (ev.type === 'attention.raised') { setMission((m) => (m ? { ...m, status: ev.kind === 'ceiling' ? 'PAUSED_CEILING' : 'PAUSED_ATTENTION' } : m)); setAnnounce('Decision required — the run is holding.'); }
        if (ev.type === 'attention.resolved') setMission((m) => (m ? { ...m, status: 'LIVE' } : m));
        if (ev.type === 'ceiling.raised') setMission((m) => (m ? { ...m, contract: { ...m.contract, ceiling: ev.ceiling } } : m));
        if (ev.type === 'ticket.voided') { setMission((m) => (m ? { ...m, status: 'KILLED', voidedBeforeRun: true } : m)); store.refresh(); }
        if (ev.type === 'run.killed') {
          setMission((m) => {
            if (!m) return m;
            const plan = m.contract.plan.map((p) => (p.status === 'LIVE' ? { ...p, status: 'KILLED' } : p));
            return { ...m, status: 'KILLED', filledAt: ev.at, contract: { ...m.contract, plan } };
          });
          setAnnounce('Run stopped.');
          store.refresh();
        }
        if (ev.type === 'run.done') {
          setMission((m) => (m ? { ...m, status: 'FILLED', filledAt: ev.at } : m));
          setAnnounce('Mission done.');
          store.refresh();
        }
      };
    }).catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; es?.close(); };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Follow the tape only while the reader is already at the bottom.
  useEffect(() => {
    const el = feedRef.current;
    if (!el || !nearBottom.current) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [events.length]);
  const onFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const stepTitle = useMemo(() => {
    const map = {};
    mission?.contract.plan.forEach((p, i) => (map[p.id] = `${i + 1} · ${p.title}`));
    return map;
  }, [mission]);

  if (notFound) {
    return (
      <div className="page">
        <p role="alert" style={{ color: 'var(--rose)' }}>No mission with serial id “{id}” is on the books — the link may be stale or the workspace was reset.</p>
        <Link to="/" className="btn-quiet" style={{ marginTop: '1rem', display: 'inline-flex' }}><BackIcon /> Back to missions</Link>
      </div>
    );
  }
  if (!mission) {
    return <div className="page"><p style={{ color: 'var(--bone-faint)' }} role="status">Pulling the ticket…</p></div>;
  }

  const live = mission.status === 'LIVE';
  const filled = mission.status === 'FILLED';
  const paused = mission.status.startsWith('PAUSED');
  const killed = mission.status === 'KILLED';
  const decidedIds = new Set(events.filter((e) => e.type === 'attention.resolved').map((e) => e.requestId));
  const elapsed = mission.launchedAt ? ((filled || killed) && mission.filledAt ? mission.filledAt - mission.launchedAt : now - mission.launchedAt) : 0;
  const stepsFilled = mission.contract.plan.filter((p) => p.status === 'FILLED').length;
  const visibleEvents = events.filter((e) => e.type !== 'snapshot');

  const stop = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/missions/${mission.id}/kill`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The house refused to stop the run.');
      setConfirmStop(false);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const stampAndRun = async () => {
    setBusy(true);
    setActionError(null);
    try { await store.launch(mission.id); } catch (e) { setActionError(`The ticket was not stamped: ${e.message}`); } finally { setBusy(false); }
  };
  const voidTicket = async () => {
    setBusy(true);
    setActionError(null);
    try { await store.voidTicket(mission.id); navigate('/'); } catch (e) { setActionError(`The ticket could not be voided: ${e.message}`); setBusy(false); }
  };

  return (
    <div className="page">
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/" className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} aria-label="Back to missions"><BackIcon /> Missions</Link>
        <SplitFlap text={mission.serial} size="0.9rem" />
        <StatusFlap status={mission.status} />
        {(live || paused) && !confirmStop && (
          <button className="btn-quiet kill-btn" onClick={() => setConfirmStop(true)}>Stop run</button>
        )}
        {(live || paused) && confirmStop && (
          <span className="stop-confirm" role="group" aria-label="Confirm stop">
            <span>Stop now? Completed steps are kept and ship as a partial artifact; {mission.spent.toFixed(1)}cr already settled stays settled; the rest of the reservation returns.</span>
            <button className="btn-stamp attn-btn" onClick={stop} disabled={busy}>Confirm stop</button>
            <button className="btn-quiet" onClick={() => setConfirmStop(false)} disabled={busy}>Keep running</button>
          </span>
        )}
      </div>
      {actionError && <p role="alert" className="ticket-error" style={{ marginTop: '0.8rem' }}>{actionError}</p>}

      <div className="telemetry" aria-label={`Telemetry: ${mission.spent.toFixed(1)} of ${mission.contract.ceiling} credits settled, ${stepsFilled} of ${mission.contract.plan.length} steps done`}>
        <div className="cell"><span className="k">Settled</span><span className="v">{mission.spent.toFixed(1)}<small> cr</small></span></div>
        <div className="cell"><span className="k">Ceiling (reserved)</span><span className="v">{mission.contract.ceiling}<small> cr</small></span></div>
        <div className="cell"><span className="k">Elapsed</span><span className="v">{fmtElapsed(elapsed)}</span></div>
        <div className="cell"><span className="k">Steps</span><span className={`v${filled ? ' ok' : ''}`}>{stepsFilled}<small> / {mission.contract.plan.length}</small></span></div>
        <div className="burnrow">
          <div className="burnbar" aria-hidden="true">
            <div className="burn-fill" style={{ transform: `scaleX(${Math.min(1, mission.spent / mission.contract.ceiling)})` }} />
            <div className="burn-est" style={{ left: `${Math.min(100, (mission.contract.estimate / mission.contract.ceiling) * 100)}%` }} title={`Estimate: ${mission.contract.estimate}cr`} />
          </div>
          <span className="burn-read">
            {mission.settlement
              ? <>reserved {mission.settlement.reserved} · settled {Number(mission.settlement.settled).toFixed(1)} · released {Number(mission.settlement.released).toFixed(1)}cr</>
              : burn
                ? <>settled {burn.total.toFixed(1)} vs est {burn.estimateSoFar} · variance <b className={burn.variance > 0 ? 'over' : 'under'}>{burn.variance > 0 ? '+' : ''}{burn.variance.toFixed(1)}cr</b></>
                : mission.spent > 0
                  ? <>{mission.spent.toFixed(1)}cr settled of {mission.contract.ceiling}cr reserved</>
                  : mission.status === 'OPEN' ? 'nothing reserved until you stamp' : 'reservation held — nothing settled yet'}
          </span>
        </div>
      </div>

      <div className="deckgrid">
        <aside className={`ticket tint-${mission.tint}`} aria-label="Mission contract">
          <div className="ticket-band">
            <span className="desk">{mission.deskName}</span>
            <span className="serial">{mission.serial}</span>
          </div>
          {filled && <div className="stamp in" aria-hidden="true">Done</div>}
          {killed && !mission.voidedBeforeRun && <div className="stamp in" aria-hidden="true">Stopped</div>}
          {killed && mission.voidedBeforeRun && <div className="stamp in" aria-hidden="true">Void</div>}
          <div className="ticket-inner">
            <p className="ticket-goal">{mission.goal}</p>
            <p className="ticket-deliv">panel: {mission.councilNames.join(', ')}</p>
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
              <div className="cell"><span className="k">Settled</span><span className="v">{mission.spent.toFixed(1)} cr</span></div>
            </div>
          </div>
        </aside>

        <section className="tape" aria-label="Live tape">
          <div className="board-title">
            <span className="brd-sm">The tape — every move on the record</span>
            {live && <span className="count" style={{ animation: 'flapflip 1.2s linear infinite' }}>LIVE</span>}
          </div>
          <div className="tape-feed" ref={feedRef} onScroll={onFeedScroll} style={{ maxHeight: '34rem' }}>
            {visibleEvents.map((ev, i) => {
              if (ev.type === 'run.launched') {
                return <div key={i} className="tape-step"><span>Ticket stamped — run opened</span><span className="rule" /></div>;
              }
              if (ev.type === 'step.status' && ev.status === 'LIVE') {
                return <div key={i} className="tape-step"><span>{stepTitle[ev.stepId]}</span><span className="rule" /></div>;
              }
              if (ev.type === 'log') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="op">{ev.label}</span>
                    <span className="detail">{ev.detail}</span>
                  </div>
                );
              }
              if (ev.type === 'council.position' || ev.type === 'council.challenge' || ev.type === 'council.verdict') {
                const cls = ev.type === 'council.challenge' ? 'challenge' : ev.type === 'council.verdict' ? 'verdict' : '';
                const role = ev.type === 'council.challenge' ? 'challenge' : ev.type === 'council.verdict' ? 'verdict' : ev.live ? 'position · live on your key' : ev.liveError ? 'position · scripted fallback' : 'position';
                return (
                  <div key={i} className={`quote ${cls}`}>
                    <div className="who">
                      <span className="sym" aria-hidden="true">{ev.symbol}</span>
                      <b>{ev.model}</b>
                      <span className="role">{role}</span>
                    </div>
                    <p>{ev.text}</p>
                    {ev.liveError && <p className="live-error">Live call failed ({ev.liveError}) — the scripted voice stood in. Recorded, not hidden.</p>}
                    {ev.dissent && (
                      <div className="dissent"><b>Recorded dissent — {ev.dissent.model}</b><br />{ev.dissent.text}</div>
                    )}
                  </div>
                );
              }
              if (ev.type === 'council.gate') return <GateGrid key={i} ev={ev} />;
              if (ev.type === 'council.patch') {
                return (
                  <div key={i} className="quote verdict">
                    <div className="who"><span className="sym" aria-hidden="true">{ev.symbol}</span><b>{ev.model}</b><span className="role">patch</span></div>
                    <p>{ev.text}</p>
                  </div>
                );
              }
              if (ev.type === 'council.revote') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="op">re-vote</span>
                    <span className="detail">{ev.member} on {ev.dimension}: {ev.verdict.toUpperCase()} — {ev.rationale}</span>
                  </div>
                );
              }
              if (ev.type === 'ceiling.reached') {
                return <div key={i} className="tape-step"><span style={{ color: 'var(--red)' }}>{ev.note}</span><span className="rule" /></div>;
              }
              if (ev.type === 'ceiling.raised') {
                return <div key={i} className="tape-step"><span>Ceiling raised to {ev.ceiling}cr — reservation extended, on the record</span><span className="rule" /></div>;
              }
              if (ev.type === 'attention.raised') {
                return <AttentionCard key={i} missionId={mission.id} ev={ev} decided={decidedIds.has(ev.requestId) || killed} />;
              }
              if (ev.type === 'attention.resolved') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="op">decision</span>
                    <span className="detail">{ev.kind}: {ev.decision} — “{ev.justification}”</span>
                  </div>
                );
              }
              if (ev.type === 'review.terminal') {
                return (
                  <div key={i} className={`quote ${ev.verdict === 'pass' ? 'verdict' : 'challenge'}`}>
                    <div className="who"><span className="sym" aria-hidden="true">REV</span><b>Terminal review</b><span className="role">saw only the goal and the artifact</span></div>
                    <p>{ev.verdict === 'pass'
                      ? 'Fresh-eyes pass: the artifact answers the goal as stated. No gaps.'
                      : `Fresh-eyes review found ${ev.gaps.length} gap(s) — a reviewer who never saw the work judged the work.`}</p>
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
                      <span>{ev.partial ? 'partial artifact · delivered' : 'versioned artifact · delivered'}</span>
                    </div>
                    <Link to={`/artifact/${ev.artifactId}`} className="btn-stamp" style={{ padding: '0.55rem 1rem', fontSize: '0.72rem' }}>
                      <OpenIcon /> Open
                    </Link>
                  </div>
                );
              }
              if (ev.type === 'review.accepted' || ev.type === 'artifact.voided' || ev.type === 'run.killed' || ev.type === 'ticket.voided') {
                return <div key={i} className="tape-step"><span style={{ color: ev.type === 'review.accepted' ? 'var(--bone)' : 'var(--rose)' }}>{ev.note}</span><span className="rule" /></div>;
              }
              if (ev.type === 'settlement') {
                return (
                  <div key={i} className="tape-step">
                    <span style={{ color: 'var(--led)' }}>Settlement · reserved {ev.reserved}cr · settled {ev.settled.toFixed(1)}cr · released {ev.released.toFixed(1)}cr back to the house</span>
                    <span className="rule" />
                  </div>
                );
              }
              if (ev.type === 'run.done') {
                return (
                  <div key={i} className="tape-step">
                    <span style={{ color: 'var(--green)' }}>{mission.voided ? 'Mission closed · artifact voided on review' : 'Mission done'} · {ev.total?.toFixed(1)}cr of {mission.contract.ceiling}cr ceiling · {fmtElapsed(ev.elapsed || 0)}</span>
                    <span className="rule" />
                  </div>
                );
              }
              return null;
            })}
            {mission.status === 'OPEN' && (
              <div className="board-empty" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <span>This ticket is written but not stamped. Nothing has run, nothing is reserved, nothing is spent.</span>
                <span style={{ display: 'flex', gap: '0.8rem' }}>
                  <button className="btn-stamp" onClick={stampAndRun} disabled={busy}>Stamp & run</button>
                  <button className="btn-quiet" onClick={voidTicket} disabled={busy}>Void ticket</button>
                </span>
              </div>
            )}
            {live && visibleEvents.length < 2 && <div className="board-empty" role="status">Waiting for the first print…</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
