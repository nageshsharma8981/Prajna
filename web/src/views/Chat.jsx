// A chat thread. Mode messages become missions that run at once; their run
// cards stay live until delivery, then link to the artifact and the tape.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import Composer from '../components/Composer.jsx';
import StatusFlap from '../components/StatusFlap.jsx';

function RunCard({ missionId }) {
  const [m, setM] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/missions/${missionId}`);
      if (!r.ok) return;
      const j = await r.json();
      if (!alive) return;
      setM(j);
      if (!['FILLED', 'KILLED'].includes(j.status)) setTimeout(tick, 2500);
    };
    tick();
    return () => { alive = false; };
  }, [missionId]);
  if (!m) return <div className="run-card"><span className="brd-sm">Loading run…</span></div>;
  const done = m.contract.plan.filter((p) => p.status === 'FILLED').length;
  const pending = (m.attention || []).find((a) => !a.decision);
  return (
    <div className={`run-card tint-${m.tint}`}>
      <div className="run-card-head">
        <span className="sym">{m.serial}</span>
        <b>{m.deskName.replace(' desk', '')} · {m.deliverable}</b>
        <StatusFlap status={m.status} />
      </div>
      <ol className="run-steps">
        {m.contract.plan.map((p) => <li key={p.id} className={p.status.toLowerCase()}><span className="dot" />{p.title}</li>)}
      </ol>
      <div className="run-card-foot">
        <span className="mono">{done}/{m.contract.plan.length} steps · {m.spent.toFixed(1)} / {m.contract.ceiling} cr{m.authored?.live ? ` · written by ${m.authored.model} on your key` : m.authored ? ' · scripted substance (live seat could not author)' : ''}</span>
        {pending && <Link to={`/run/${m.id}`} className="btn-stamp attn-btn">Decision needed →</Link>}
        {m.artifactId && <Link to={`/artifact/${m.artifactId}`} className="btn-stamp attn-btn">Open delivery</Link>}
        <Link to={`/run/${m.id}`} className="btn-quiet" style={{ padding: '0.4rem 0.8rem' }}>Watch the tape</Link>
      </div>
    </div>
  );
}

export default function Chat({ id }) {
  const s = useStore();
  const [chat, setChat] = useState(null);
  const [missing, setMissing] = useState(false);
  const endRef = useRef(null);

  const load = async () => {
    const r = await fetch(`/api/chats/${id}`);
    if (!r.ok) { setMissing(true); return; }
    setChat(await r.json());
  };
  useEffect(() => { setChat(null); setMissing(false); load(); }, [id]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat?.messages?.length]);

  const send = async (payload) => {
    const r = await fetch(`/api/chats/${id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The house refused the message.');
    setChat(j.chat);
    s.refresh();
  };

  if (missing) return <div className="page"><p role="alert" style={{ color: 'var(--rose)' }}>This chat is not on the books. <Link to="/">Start a new one</Link>.</p></div>;
  if (!chat) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening chat…</p></div>;

  return (
    <div className="chat">
      <div className="chat-scroll">
        <div className="chat-thread">
          <h1 className="chat-title">{chat.title}</h1>
          {chat.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.role === 'user' ? (
                <div className="bubble">{m.text}{m.attachments?.length ? <div className="attach-row">{m.attachments.map((a) => <span key={a} className="attach-chip">{a}</span>)}</div> : null}</div>
              ) : (
                <div className="answer">
                  <div className="answer-meta">{m.kind === 'live' ? `${m.model} · live on your key` : m.kind === 'run' ? 'mission' : m.model || 'Prajñā'}</div>
                  <p>{m.text}</p>
                  {m.missionId && <RunCard missionId={m.missionId} />}
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="chat-composer"><Composer chat={chat} onSend={send} initialMode={chat.mode === 'chat' ? 'chat' : chat.mode} compact autoFocus={false} /></div>
    </div>
  );
}
