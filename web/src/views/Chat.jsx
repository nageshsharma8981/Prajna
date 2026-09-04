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
        <span className="mono">{done}/{m.contract.plan.length} steps · {m.spent.toFixed(1)} / {m.contract.ceiling} cr{m.authored?.live ? ` · written by ${m.authored.model} on your key` : m.authored ? ' · scripted substance (live model could not author)' : ''}</span>
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
  const [copied, setCopied] = useState(null);
  const copy = async (m) => { try { await navigator.clipboard.writeText(m.text); setCopied(m.id); setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500); } catch { setCopied(`no:${m.id}`); setTimeout(() => setCopied(null), 1500); } };
  const retry = (m) => { const i = chat.messages.findIndex((x) => x.id === m.id); const prev = [...chat.messages.slice(0, i)].reverse().find((x) => x.role === 'user'); if (prev) stream({ text: prev.text, mode: 'chat', attachments: [] }); };
  const [draft, setDraft] = useState(null); // streaming assistant reply in flight
  const endRef = useRef(null);

  const load = async () => {
    const r = await fetch(`/api/chats/${id}`);
    if (!r.ok) { setMissing(true); return; }
    setChat(await r.json());
  };
  useEffect(() => { setChat(null); setMissing(false); setDraft(null); load(); }, [id]); // eslint-disable-line
  // A chat handed off from Home carries its first message here so the reply
  // streams into the thread instead of blocking the navigation.
  useEffect(() => {
    if (!chat) return;
    const key = `prajna-pending-${id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try { send(JSON.parse(raw)); } catch { /* ignore */ }
  }, [chat?.id]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat?.messages?.length, draft?.text?.length]);

  const stream = async (payload) => {
    setChat((c) => ({ ...c, messages: [...c.messages, { id: `tmp-${Date.now()}`, role: 'user', text: payload.text, attachments: payload.attachments || [] }] }));
    setDraft({ text: '', model: payload.leadName || null });
    const r = await fetch(`/api/chats/${id}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setDraft(null); throw new Error(j.error || 'The house refused the message.'); }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1]; const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (!ev || !data) continue;
        const d = JSON.parse(data);
        if (ev === 'delta') setDraft((x) => ({ ...(x || {}), text: ((x && x.text) || '') + d.text }));
        if (ev === 'done') { setDraft(null); setChat(d.chat); }
      }
    }
    s.refresh();
  };

  const send = async (payload) => {
    if (payload.mode === 'chat') return stream(payload);
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
                <div className="bubble">{m.text}{m.attachments?.length ? <div className="attach-row">{m.attachments.map((a, i) => <span key={i} className="attach-chip">{a.name || a}</span>)}</div> : null}{m.read?.length ? <div className="attach-row" aria-label="Attachments read">{m.read.map((d, i) => <span key={i} className="attach-chip" title="Read by the house, on the table">{`Read: ${d.name} · ${d.words} words`}</span>)}</div> : null}{m.pages?.length ? <div className="attach-row" aria-label="Pages read">{m.pages.map((pg, i) => <a key={i} className="attach-chip" href={pg.url} target="_blank" rel="noreferrer" title={pg.error ? `Not read: ${pg.error}` : `Read by the house, ${pg.words} words`}>{pg.error ? `Not read: ${pg.url.replace(/^https?:\/\//, '').slice(0, 40)}` : `Read: ${pg.title.slice(0, 50)} · ${pg.words} words`}</a>)}</div> : null}</div>
              ) : (
                <div className="answer">
                  <div className="answer-meta">{m.kind === 'live' ? `${m.model} · live on your key` : m.kind === 'run' ? 'mission' : m.kind === 'narrative' ? 'the house · what happened, from the tape' : m.kind === 'record' ? 'the house · answered from the record' : m.kind === 'house' ? 'the house · from the ledger' : m.model || 'Prajñā'}</div>
                  <p>{m.text}</p>
                  {m.missionId && m.kind !== 'narrative' && <RunCard missionId={m.missionId} />}
                  {!m.id.startsWith('tmp-') && (
                    <div className="answer-tools" role="group" aria-label="Answer actions">
                      <button type="button" onClick={() => copy(m)} title="Copy this answer">{copied === m.id ? 'Copied' : copied === `no:${m.id}` ? 'Copy blocked' : 'Copy'}</button>
                      {!m.missionId && !['run', 'narrative'].includes(m.kind) && <button type="button" onClick={() => retry(m)} title="Ask the same question again">Retry</button>}
                      {m.at && <span title={new Date(m.at).toLocaleString('en-GB')}>{new Date(m.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {draft && (
            <div className="msg assistant"><div className="answer">
              <div className="answer-meta">{draft.text ? 'streaming · live on your key' : 'thinking…'}</div>
              <p>{draft.text}<span className="cursor" aria-hidden="true">▍</span></p>
            </div></div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="chat-composer"><Composer chat={chat} onSend={send} initialMode={chat.mode === 'chat' ? 'chat' : chat.mode} compact autoFocus={false} /></div>
    </div>
  );
}
