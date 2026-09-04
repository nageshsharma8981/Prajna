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

// Decision card for a pending attention item, justification is mandatory
// and goes on the record (ledger + artifact provenance).
function AttentionCard({ missionId, ev, decided }) {
  const [justification, setJustification] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  if (decided) return null;

  const decide = async (decision) => {
    if (!justification.trim()) {
      setError('A justification is required, it goes on the record.');
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
      setError(`The decision did not reach the house (${e.message}), nothing was recorded. Try again.`);
      setSending(false);
    }
  };

  const LABELS = {
    'raise-ceiling': 'Raise ceiling +40%',
    'abort-with-partial': 'Stop: take partial artifact',
    'accept-gap': 'Accept gap on the record',
    'void-artifact': 'Void the artifact',
    'approve-step': 'Approve: let it act',
    'skip-step': 'Skip this step',
    'patch': 'Patch & re-validate',
    'accept-risk': 'Accept the risk on the record',
    'stop-run': 'Stop the run',
  };

  return (
    <div className="attn-card" role="group" aria-label="Decision required">
      <div className="attn-head">Decision required: the run is holding</div>
      <p className="attn-prompt">{ev.prompt}</p>
      {ev.gaps?.map((g) => (
        <p key={g.id} className="attn-gap"><b>{g.id}</b> ({g.severity}), {g.description}</p>
      ))}
      <input
        className="attn-just"
        placeholder="Justification: goes on the record and into the artifact"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        aria-label="Justification for your decision"
      />
      <div className="attn-actions">
        {ev.options.map((o) => (
          <button key={o} className={o.startsWith('raise') || o.startsWith('accept') || o.startsWith('approve') || o === 'patch' ? 'btn-stamp attn-btn' : 'btn-quiet'} disabled={sending} onClick={() => decide(o)}>
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
      <div className="gate-head">Panel gate: {ev.cleared ? 'CLEARED' : 'NOT CLEARED'}</div>
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


// Numbered references in panel speech and critiques resolve to the sources on
// the table: [3] becomes a link to source 3 (or a titled marker for an owner
// attachment, which has no URL).
function Cite({ text, sources }) {
  const parts = String(text || '').split(/(\[\d+\])/);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (!m) return part;
    const src = (sources || [])[Number(m[1]) - 1];
    if (!src) return part;
    return src.url
      ? <a key={i} className="cite" href={src.url} target="_blank" rel="noreferrer" title={src.title}>{part}</a>
      : <abbr key={i} className="cite" title={`${src.title}, owner attachment`}>{part}</abbr>;
  });
}

export default function Run({ id }) {
  const store = useStore();
  const [mission, setMission] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftPlan, setDraftPlan] = useState([]);
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
    // Confirm the mission exists before opening a stream, a stale deep link
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
        if (ev.type === 'run.done' || ev.type === 'run.killed') fetch(`/api/missions/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.narrative) setMission((m) => (m ? { ...m, narrative: j.narrative } : m)); });
        if (ev.type === 'log' && ev.label === 'retrieve') fetch(`/api/missions/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setMission((m) => (m ? { ...m, sources: j.sources || [], retrieval: j.retrieval || null } : m)); });
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
        if (ev.type === 'attention.raised') { setMission((m) => (m ? { ...m, status: ev.kind === 'ceiling' ? 'PAUSED_CEILING' : 'PAUSED_ATTENTION' } : m)); setAnnounce('Decision required: the run is holding.'); }
        if (ev.type === 'step.skipped') setMission((m) => (m ? { ...m, contract: { ...m.contract, plan: m.contract.plan.map((p) => (p.id === ev.stepId ? { ...p, status: 'SKIPPED' } : p)) } } : m));
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
  const stepNo = (sid) => { const i = mission?.contract.plan.findIndex((p) => p.id === sid); return i >= 0 ? i + 1 : ''; };
  const amend = async () => {
    setBusy(true); setActionError(null);
    try {
      const r = await fetch(`/api/missions/${mission.id}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Fork refused.');
      await store.refresh();
      navigate(`/run/${j.id}`);
    } catch (e) { setActionError(e.message); setBusy(false); }
  };

  if (notFound) {
    return (
      <div className="page">
        <p role="alert" style={{ color: 'var(--rose)' }}>No mission with serial id “{id}” is on the books, the link may be stale or the workspace was reset.</p>
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
  // Plan editor: only an unstamped ticket can be reshaped.
  const TOOLS = ['scope', 'search', 'cite-guard', 'steelman', 'storyboard', 'compose', 'deck-doctor', 'copy-cutter', 'build', 'a11y-audit', 'ingest', 'analyze', 'chart-smith', 'design', 'council'];
  const openEditor = () => { setDraftPlan(mission.contract.plan.map((p) => ({ id: p.id, title: p.title, tool: p.tool, access: p.access }))); setEditing(true); };
  const move = (i, d) => setDraftPlan((pl) => { const n = [...pl]; const j = i + d; if (j < 0 || j >= n.length) return pl; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const savePlan = async () => {
    setBusy(true); setActionError(null);
    try {
      const r = await fetch(`/api/missions/${mission.id}/plan`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: draftPlan }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The plan was refused.');
      setMission(j); setEditing(false); store.refresh();
    } catch (e) { setActionError(`Plan not saved: ${e.message}`); } finally { setBusy(false); }
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
        {(filled || killed) && !mission.voidedBeforeRun && (
          <button className="btn-quiet" onClick={amend} disabled={busy} title="Write a new ticket on the same desk and panel; its delivery becomes the next version.">Amend & re-run</button>
        )}
        {mission.status !== 'OPEN' && <button className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} title={mission.shareToken ? 'Revoke the public link to this record' : 'Public link to the whole record, contract, tape, decisions, artifact, revocable any time'} onClick={async () => {
          const r = await fetch(`/api/missions/${mission.id}/share`, { method: mission.shareToken ? 'DELETE' : 'POST' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { setActionError(j.error || 'Refused.'); return; }
          setMission((m) => ({ ...m, shareToken: j.shareToken }));
          if (j.path) { const link = `${location.origin}${j.path}`; try { await navigator.clipboard.writeText(link); setAnnounce(`Record link copied: ${link}`); } catch { setAnnounce(`Record link: ${link}`); } setActionError(null); }
          else setAnnounce('Record link revoked.');
          store.refresh();
        }}>{mission.shareToken ? 'Revoke record link' : 'Share record'}</button>}
        {mission.status !== 'OPEN' && <a className="btn-quiet" style={{ padding: '0.45rem 0.8rem' }} href={`/api/missions/${mission.id}/bundle?download=1`} title="One self-contained file: contract, tape, decisions, validation, sources, settlement, the artifact, and the machine-readable record">Audit bundle</a>}
        {mission.lineage && <span className="lineage-tag">v{mission.lineage.version} · amends {mission.lineage.parentSerial}</span>}
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
                  : mission.status === 'OPEN' ? 'nothing reserved until you stamp' : 'reservation held, nothing settled yet'}
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
                <li key={p.id} className="plan-row">
                  <span className="n">{i + 1}</span>
                  <span className="t" style={{ opacity: p.status === 'QUEUED' ? 0.55 : 1 }}>
                    {p.title}
                    <span className="plan-meta"><b>{p.cost} cr</b> · {p.access}{p.requiresConfirmation ? ' · approval' : ''}{p.rationale ? <> · <em title={p.rationale}>why</em></> : null}</span>
                    {p.seats && p.seats.length > 0 && <span className="plan-seats">{p.seats.map((st) => <span key={st.id} className={`seat-cost${st.live ? ' live' : ''}`}>{st.name} {st.live ? '0 cr · your key' : `${st.cost} cr`}</span>)}</span>}
                  </span>
                  <StatusFlap status={p.status} />
                </li>
              ))}
            </ol>
            {mission.status === 'OPEN' && (() => {
              // Model check before stamping: which seats will really be live.
              const models = store.models || [];
              const seats = [mission.lead, ...(mission.advisers || [])].map((id) => models.find((m) => m.id === id) || { id, name: id, live: false });
              const lead = seats[0];
              const missing = [...new Set(seats.filter((x) => !x.live && x.provider).map((x) => x.provider))];
              return (
                <div className="seat-health" role="group" aria-label="Model check">
                  <span className="k">Models at stamping</span>
                  <div className="seat-list">{seats.map((x, i) => <span key={x.id} className={`seat-pill${x.live ? ' live' : ''}`}>{x.name}{i === 0 ? ' · lead' : ''}, {x.live ? 'live on your key' : 'house voice'}</span>)}</div>
                  {!lead?.live && <p>The lead is not live, so the substance will be house-scripted sample material and labelled as such. {lead?.provider ? <>Load {/^[aeiou]/i.test((store.providers || {})[lead.provider]?.label || lead.provider) ? 'an' : 'a'} <Link to="/keys">{(store.providers || {})[lead.provider]?.label || lead.provider} key</Link> to make {lead.name} write it.</> : null}</p>}
                  {lead?.live && missing.length > 0 && <p>{seats.filter((x) => !x.live).length} adviser model{seats.filter((x) => !x.live).length === 1 ? '' : 's'} will speak in the house voice; <Link to="/keys">load a {missing.map((pv) => (store.providers || {})[pv]?.label || pv).join(' or ')} key</Link> to make them live.</p>}
                  {lead?.live && missing.length === 0 && <p>Every model is live: positions, critiques and the substance itself run on your own keys, priced at 0 house credits.</p>}
                </div>
              );
            })()}
            {mission.contract.why && (
              <details className="plan-why">
                <summary>Why this plan</summary>
                <p>{mission.contract.why}</p>
                <ol>{mission.contract.plan.map((p) => <li key={p.id}><b>{p.tool}</b>, {p.rationale}</li>)}</ol>
              </details>
            )}
            {(mission.sources || []).length > 0 && (
              <details className="plan-why sources-panel" open>
                <summary>Sources on the table · {mission.sources.length}</summary>
                <ol>{mission.sources.map((src, i) => (
                  <li key={src.id || i}><span className={`src-engine ${src.engine || 'house'}`}>{src.engine === 'attachment' ? 'owner' : src.engine || src.kind}</span> {src.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a> : <span>{src.title}</span>}<em> · {src.retrieved}</em></li>
                ))}</ol>
                {mission.retrieval && !mission.retrieval.ok && <p className="live-error">Retrieval failed ({mission.retrieval.error}), recorded, not hidden.</p>}
              </details>
            )}
            {mission.contract.edited && <p className="ticket-deliv" style={{ marginTop: '0.4rem' }}>plan edited before stamping · {mission.contract.edited.steps} steps{mission.contract.edited.added ? ` · ${mission.contract.edited.added} added` : ''}{mission.contract.edited.removed ? ` · ${mission.contract.edited.removed} removed` : ''}</p>}
            {mission.status === 'OPEN' && !editing && <button className="btn-quiet" style={{ marginTop: '0.6rem', padding: '0.4rem 0.8rem' }} onClick={openEditor} disabled={busy}>Edit plan</button>}
            {editing && (
              <div className="plan-editor" role="group" aria-label="Edit plan">
                {draftPlan.map((p, i) => (
                  <div key={p.id} className="pe-row">
                    <span className="n">{i + 1}</span>
                    <input className="key-input" value={p.title} onChange={(e) => setDraftPlan((pl) => pl.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} aria-label={`Step ${i + 1} title`} />
                    <select className="key-input" value={p.tool} onChange={(e) => setDraftPlan((pl) => pl.map((x, k) => (k === i ? { ...x, tool: e.target.value } : x)))} aria-label={`Step ${i + 1} tool`}>{TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    <span className="pe-btns">
                      <button onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
                      <button onClick={() => move(i, 1)} aria-label="Move down" disabled={i === draftPlan.length - 1}>↓</button>
                      <button onClick={() => setDraftPlan((pl) => pl.filter((_, k) => k !== i))} aria-label="Remove step" disabled={draftPlan.length <= 1}>✕</button>
                    </span>
                  </div>
                ))}
                <div className="pe-actions">
                  <button className="btn-quiet" onClick={() => setDraftPlan((pl) => [...pl, { id: null, title: 'New step', tool: 'compose', access: 'write' }])} disabled={draftPlan.length >= 12}>Add step</button>
                  <span className="grow" />
                  <button className="btn-quiet" onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn-stamp attn-btn" onClick={savePlan} disabled={busy}>Save plan</button>
                </div>
                <p className="conn-note">Steps run in this order; each depends on the one before unless the original graph said otherwise. Estimate, ceiling and assertion ownership are recomputed on save, and the edit is recorded on the contract.</p>
              </div>
            )}
            <div className="ticket-tally">
              <div className="cell"><span className="k">Estimate</span><span className="v">{mission.contract.estimate} cr</span></div>
              <div className="cell"><span className="k">Settled</span><span className="v">{mission.spent.toFixed(1)} cr</span></div>
              {(() => { const saved = mission.contract.plan.reduce((a, p) => a + ((p.seats || []).filter((x) => x.live).length * (p.housePer || 0)), 0); return saved > 0 ? <div className="cell"><span className="k">Saved by your keys</span><span className="v">{saved.toFixed(1)} cr</span></div> : null; })()}
            </div>
          </div>
        </aside>

        <section className="tape" aria-label="Live tape">
          <div className="board-title">
            <span className="brd-sm">The tape: every move on the record</span>
            {live && <span className="count" style={{ animation: 'flapflip 1.2s linear infinite' }}>LIVE</span>}
          </div>
          <div className="tape-feed" ref={feedRef} onScroll={onFeedScroll} style={{ maxHeight: '34rem' }}>
            {visibleEvents.map((ev, i) => {
              if (ev.type === 'run.launched') {
                return <div key={i} className="tape-step"><span>Ticket stamped: run opened</span><span className="rule" /></div>;
              }
              if (ev.type === 'step.status' && ev.status === 'LIVE') {
                return <div key={i} className="tape-step"><span>{stepTitle[ev.stepId]}{ev.access === 'external' ? ' · external' : ''}</span><span className="rule" /></div>;
              }
              if (ev.type === 'step.approved' || ev.type === 'step.skipped') {
                return <div key={i} className="tape-step"><span style={{ color: ev.type === 'step.approved' ? 'var(--green)' : 'var(--rose)' }}>{ev.note}</span><span className="rule" /></div>;
              }
              if (ev.type === 'log') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="stepno" title={stepTitle[ev.stepId]}>{stepNo(ev.stepId)}</span>
                    <span className="op">{ev.label}</span>
                    <span className="detail">{ev.detail}</span>
                  </div>
                );
              }
              if (ev.type === 'council.position' || ev.type === 'council.challenge' || ev.type === 'council.verdict' || ev.type === 'council.critique') {
                const cls = ev.type === 'council.challenge' || (ev.type === 'council.critique' && ev.verdict === 'revise') ? 'challenge' : ev.type === 'council.verdict' || (ev.type === 'council.critique' && ev.verdict === 'pass') ? 'verdict' : '';
                const role = ev.type === 'council.critique' ? (ev.live ? `critique of the draft · ${ev.verdict} · live on your key` : 'critique · unavailable') : ev.type === 'council.challenge' ? 'challenge' : ev.type === 'council.verdict' ? 'verdict' : ev.live ? 'position · live on your key' : ev.liveError ? 'position · scripted fallback' : 'position';
                return (
                  <div key={i} className={`quote ${cls}`}>
                    <div className="who">
                      <span className="sym" aria-hidden="true">{ev.symbol}</span>
                      <b>{ev.model}</b>
                      <span className="role">{role}</span>
                    </div>
                    <p><Cite text={ev.text} sources={mission.sources} /></p>
                    {ev.liveError && <p className="live-error">Live call failed ({ev.liveError}), the scripted voice stood in. Recorded, not hidden.</p>}
                    {ev.dissent && (
                      <div className="dissent"><b>Recorded dissent: {ev.dissent.model}</b><br />{ev.dissent.text}</div>
                    )}
                  </div>
                );
              }
              if (ev.type === 'council.gate') return <GateGrid key={i} ev={ev} />;
              if (ev.type === 'validate.lane') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="op">{ev.lane}</span>
                    <span className="detail">round {ev.round} · {ev.verdicts.map((v) => `${v.id.replace('VAL-', '')} ${v.passed ? '✓' : '✗'}`).join(' · ')}</span>
                  </div>
                );
              }
              if (ev.type === 'gate') {
                const ids = [...ev.sealed, ...ev.failed, ...ev.dissenting, ...ev.missing];
                const state = (id) => (ev.sealed.includes(id) ? 'sealed' : ev.acceptedRisks?.includes(id) ? 'accepted risk' : ev.failed.includes(id) ? 'failed' : ev.dissenting.includes(id) ? 'dissent' : 'missing');
                return (
                  <div key={i} className={`gate ${ev.cleared ? 'cleared' : 'blocked'}`}>
                    <div className="gate-head">Validation gate · round {ev.round}, {ev.cleared ? 'CLEARED' : 'NOT CLEARED'}</div>
                    <table className="gate-table">
                      <caption className="sr-only">Assertion verdicts from two independent validator lanes.</caption>
                      <thead><tr><th scope="col">Assertion</th><th scope="col">Promise</th><th scope="col">Verdict</th></tr></thead>
                      <tbody>
                        {ids.map((id) => (
                          <tr key={id}>
                            <th scope="row"><code>{id}</code></th>
                            <td style={{ textAlign: 'left' }}>{mission.contract.assertions?.find((a) => a.id === id)?.title}</td>
                            <td><span className={`gv ${state(id) === 'sealed' || state(id) === 'accepted risk' ? 'pass' : 'fail'}`}>{state(id).toUpperCase()}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="gate-note">{ev.note}</p>
                  </div>
                );
              }
              if (ev.type === 'artifact.patched' || ev.type === 'risk.accepted') {
                return <div key={i} className="tape-step"><span style={{ color: ev.type === 'artifact.patched' ? 'var(--led)' : 'var(--rose)' }}>{ev.note}</span><span className="rule" /></div>;
              }
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
                    <span className="detail">{ev.member} on {ev.dimension}: {ev.verdict.toUpperCase()}, {ev.rationale}</span>
                  </div>
                );
              }
              if (ev.type === 'ceiling.reached') {
                return <div key={i} className="tape-step"><span style={{ color: 'var(--red)' }}>{ev.note}</span><span className="rule" /></div>;
              }
              if (ev.type === 'ceiling.raised') {
                return <div key={i} className="tape-step"><span>Ceiling raised to {ev.ceiling}cr, reservation extended, on the record</span><span className="rule" /></div>;
              }
              if (ev.type === 'attention.raised') {
                return <AttentionCard key={i} missionId={mission.id} ev={ev} decided={decidedIds.has(ev.requestId) || killed} />;
              }
              if (ev.type === 'attention.resolved') {
                return (
                  <div key={i} className="tape-line">
                    <span className="ts">{ts(ev.at)}</span>
                    <span className="op">decision</span>
                    <span className="detail">{ev.kind}: {ev.decision}, “{ev.justification}”</span>
                  </div>
                );
              }
              if (ev.type === 'review.terminal') {
                return (
                  <div key={i} className={`quote ${ev.verdict === 'pass' ? 'verdict' : 'challenge'}`}>
                    <div className="who"><span className="sym" aria-hidden="true">REV</span><b>Terminal review</b><span className="role">saw only the goal and the artifact</span></div>
                    <p>{ev.verdict === 'pass'
                      ? 'Fresh-eyes pass: the artifact answers the goal as stated. No gaps.'
                      : `Fresh-eyes review found ${ev.gaps.length} gap(s), a reviewer who never saw the work judged the work.`}</p>
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
                    <span style={{ color: ev.closure && ev.closure.open > 0 ? 'var(--rose)' : 'var(--green)' }}>
                      {mission.voided ? 'Mission closed · artifact voided on review' : ev.closure && ev.closure.open > 0 ? `Mission closed with ${ev.closure.open} open promise(s), reported as incomplete, not relabeled done` : 'Mission done'}
                      {' · '}{ev.total?.toFixed(1)}cr of {mission.contract.ceiling}cr ceiling · {fmtElapsed(ev.elapsed || 0)}
                      {ev.closure ? ` · ${ev.closure.sealed}/${ev.closure.total} promises sealed${ev.closure.acceptedRisk ? `, ${ev.closure.acceptedRisk} accepted risk` : ''}` : ''}
                    </span>
                    <span className="rule" />
                  </div>
                );
              }
              return null;
            })}
            {mission.narrative && (
              <div className="narrative"><span className="k">In plain words, written by the house from the tape</span><p>{mission.narrative}</p></div>
            )}
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
