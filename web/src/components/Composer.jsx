// The composer: prompt + mode chips + per-mode controls + model picker +
// panel (Model Council) + attach + voice + send. Shared by Home and Chat.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';
import { SiteIcon, PhoneIcon, DeckIcon, SearchIcon, ChartIcon, ClipIcon, MicIcon, SendIcon, ChevronIcon, PanelIcon } from './icons.jsx';

export const MODES = [
  { id: 'chat', label: 'Chat', icon: null, placeholder: 'Describe what you want to accomplish…' },
  { id: 'website', label: 'Website', icon: SiteIcon, placeholder: 'Describe the website you want to build…', samples: ['Design an interactive climate metrics dashboard site', 'Build a landing page comparing AI coding assistants', 'Develop a responsive portfolio for generative art', 'Build a searchable support workflow knowledge base'] },
  { id: 'mobile', label: 'Mobile App', icon: PhoneIcon, placeholder: 'Describe the mobile app you want to create…', samples: ['Build a mobile app for a restaurant', 'Build a mobile app for a fitness tracker', 'Build a mobile app for a weather forecast', 'Build a mobile app for a news reader'] },
  { id: 'deck', label: 'Slide Deck', icon: DeckIcon, placeholder: 'Describe the slide deck you want to create…', samples: ['Build a B2B software sales deck', 'Create cybersecurity training slides', 'Draft a startup funding pitch deck', 'Explain AI impact on future work', 'Outline a product launch update deck'] },
  { id: 'research', label: 'Research', icon: SearchIcon, placeholder: 'Describe what you want to research…', samples: ['Summarize the key features of the latest model release', 'What are the top trending programming languages in 2026?', 'Find the latest updates on the Mars exploration missions', 'Give me a quick overview of the current state of electric vehicle adoption'] },
  { id: 'analysis', label: 'Analysis', icon: ChartIcon, placeholder: 'What do the numbers need to answer?', samples: ['Cohort retention for our Q2 signups — where is the leak?', 'Marketing channel efficiency across the last 4 quarters', 'Pricing experiment readout: annual vs monthly plans'] },
];

const HOUSES = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' };

function ModelPicker({ models, value, onChange, onClose }) {
  const groups = useMemo(() => {
    const g = {};
    for (const m of models) (g[m.house] ||= []).push(m);
    return Object.entries(g);
  }, [models]);
  const [house, setHouse] = useState(groups[0]?.[0]);
  return (
    <div className="pop" role="dialog" aria-label="Choose a model">
      <div className="pop-rail">
        {groups.map(([h, ms]) => (
          <button key={h} className={`pop-rail-btn${house === h ? ' on' : ''}`} onClick={() => setHouse(h)} title={h} aria-label={h}>{h.slice(0, 1)}</button>
        ))}
      </div>
      <div className="pop-body">
        <div className="pop-head"><b>{house}</b><span>{(groups.find(([h]) => h === house)?.[1] || []).length}</span></div>
        {(groups.find(([h]) => h === house)?.[1] || []).map((m) => (
          <button key={m.id} className={`pop-item${value === m.id ? ' on' : ''}`} onClick={() => { onChange(m.id); onClose(); }}>
            <span className="sym" aria-hidden="true">{m.symbol}</span>
            <span className="nm">{m.name}</span>
            {m.live ? <span className="badge live">LIVE</span> : m.tier === 'byok' ? <span className="badge">YOURS</span> : m.pro ? <span className="badge pro">PRO</span> : null}
          </button>
        ))}
        <Link to="/keys" className="pop-item quiet" onClick={onClose}><span className="nm">Advanced — keys & custom models</span></Link>
      </div>
    </div>
  );
}

function CouncilModal({ models, lead, advisers, onChange, onClose, plan }) {
  const max = plan === 'free' ? 3 : 5;
  const [filter, setFilter] = useState('all');
  const list = models.filter((m) => filter === 'all' || m.house === filter);
  const toggle = (id) => {
    if (id === lead) return;
    onChange({ lead, advisers: advisers.includes(id) ? advisers.filter((a) => a !== id) : advisers.length < max ? [...advisers, id] : advisers });
  };
  return (
    <div className="veil" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose panel models" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><PanelIcon /> <b>Choose panel models</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="lead-card">
          <span className="k">Lead model</span>
          <b>{models.find((m) => m.id === lead)?.name}</b>
          <span className="s">Synthesizes the advice, then runs the task.</span>
        </div>
        <div className="modal-sub"><span>Advisers</span><span>{advisers.length} of {max} selected</span></div>
        <div className="house-filter">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All models</button>
          {Object.keys(HOUSES).map((h) => <button key={h} className={filter === HOUSES[h] ? 'on' : ''} onClick={() => setFilter(HOUSES[h])}>{HOUSES[h]}</button>)}
        </div>
        <div className="modal-list">
          {list.map((m) => {
            const isLead = m.id === lead, isAdv = advisers.includes(m.id);
            const locked = m.pro && plan === 'free';
            return (
              <div key={m.id} className="modal-row">
                <span className="sym" aria-hidden="true">{m.symbol}</span>
                <span className="nm"><b>{m.name}</b>{m.pro && <span className="badge pro">PRO</span>}<span className="house">{m.house}</span></span>
                {isLead ? <span className="badge">LEAD</span> : locked ? <Link to="/account/subscription" className="mini">Upgrade</Link> : (
                  <span style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={`mini${isAdv ? ' on' : ''}`} onClick={() => toggle(m.id)}>{isAdv ? 'Remove' : '+ Add'}</button>
                    <button className="mini" onClick={() => onChange({ lead: m.id, advisers: advisers.filter((a) => a !== m.id) })} title="Make lead">Lead</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="modal-foot">{advisers.length ? 'Advisers challenge; the lead synthesizes; dissent is recorded.' : 'Choose at least one adviser to convene a panel.'}</p>
      </div>
    </div>
  );
}

function TemplateModal({ templates, value, onPick, onClose }) {
  const [sel, setSel] = useState(value || 'none');
  const t = templates.find((x) => x.id === sel) || templates[0];
  return (
    <div className="veil" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="Choose template" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Choose template</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="tpl-grid">
          <div className="tpl-list">
            {templates.filter((x) => x.id !== 'none').map((x) => (
              <button key={x.id} className={`tpl-card${sel === x.id ? ' on' : ''}`} onClick={() => setSel(x.id)} style={x.theme ? { background: x.theme.paper, color: x.theme.ink, fontFamily: x.theme.font } : {}}>
                <span className="tpl-title" style={x.theme ? { color: x.theme.acc } : {}}>{x.name}</span>
                <span className="tpl-sub">Presentation title</span>
              </button>
            ))}
          </div>
          <div className="tpl-preview" style={t.theme ? { background: t.theme.paper, color: t.theme.ink, fontFamily: t.theme.font } : {}}>
            <span className="tpl-kick" style={t.theme ? { color: t.theme.acc } : {}}>{t.name}</span>
            <h3>Presentation title</h3>
            <p>{t.blurb}</p>
            <span className="tpl-pg">1 / 9</span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn-quiet" onClick={() => { onPick('none'); onClose(); }}>Skip template</button>
          <button className="btn-stamp attn-btn" onClick={() => { onPick(sel); onClose(); }}>Use template</button>
        </div>
      </div>
    </div>
  );
}

export default function Composer({ chat, onSend, initialMode = 'chat', autoFocus = true, compact = false }) {
  const s = useStore();
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState('');
  const [variant, setVariant] = useState('build');
  const [depth, setDepth] = useState('fast');
  const [template, setTemplate] = useState('none');
  const [lead, setLead] = useState(s.personalization?.defaultModel || 'opus');
  const [advisers, setAdvisers] = useState([]);
  const [showModels, setShowModels] = useState(false);
  const [showCouncil, setShowCouncil] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDepth, setShowDepth] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => { if (autoFocus) taRef.current?.focus(); }, [autoFocus]);
  useEffect(() => { if (s.personalization?.defaultModel) setLead(s.personalization.defaultModel); }, [s.personalization?.defaultModel]);

  const m = MODES.find((x) => x.id === mode) || MODES[0];
  const models = s.models || [];
  const leadModel = models.find((x) => x.id === lead) || models[0];

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      await onSend({ text: text.trim(), mode, variant, depth, template: template === 'none' ? null : template, lead, advisers, attachments });
      setText('');
      setAttachments([]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Voice input is not available in this browser.'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0].transcript).join(' '); setText(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  return (
    <div onKeyDown={(e) => { if (e.key === 'Escape' && (showModels || showDepth || showCouncil || showTemplates)) { e.stopPropagation(); setShowModels(false); setShowDepth(false); setShowCouncil(false); setShowTemplates(false); } }} className={`composer${compact ? ' compact' : ''}`}>
      <div className="composer-box">
        <textarea
          ref={taRef}
          className="composer-input"
          rows={compact ? 1 : 2}
          placeholder={m.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          aria-label="Message"
        />
        {attachments.length > 0 && (
          <div className="attach-row">{attachments.map((a, i) => <span key={i} className="attach-chip" title={a.text ? `${a.text.length} characters read — on the table as an owner source` : 'name only — not a text file, so its contents are not read'}>{a.name}{a.text ? '' : ' (name only)'} <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`}>×</button></span>)}</div>
        )}
        <div className="composer-bar">
          <button className="ic" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files"><ClipIcon /></button>
          <input ref={fileRef} type="file" multiple hidden aria-label="Attach files" accept=".txt,.md,.csv,.json,.html,.htm,text/*" onChange={async (e) => {
            // Text files are read in the browser and travel with the message as
            // owner-supplied sources; anything else is recorded by name only.
            const files = Array.from(e.target.files).slice(0, 8);
            const read = await Promise.all(files.map((f) => new Promise((res) => {
              const textish = /^text\/|json|csv|html|markdown/.test(f.type) || /\.(txt|md|csv|json|html?)$/i.test(f.name);
              if (!textish || f.size > 400000) return res({ name: f.name });
              const r = new FileReader(); r.onload = () => res({ name: f.name, text: String(r.result || '').slice(0, 200000) }); r.onerror = () => res({ name: f.name }); r.readAsText(f);
            })));
            setAttachments([...attachments, ...read].slice(0, 8));
            e.target.value = '';
          }} />
          {mode !== 'chat' && (
            <span className="mode-pill">{m.icon && <m.icon />} {m.label} <button className="x" onClick={() => setMode('chat')} aria-label="Clear mode">×</button></span>
          )}
          {(mode === 'website' || mode === 'mobile') && (
            <span className="seg" role="radiogroup" aria-label="Build or design">
              <button role="radio" aria-checked={variant === 'build'} className={variant === 'build' ? 'on' : ''} onClick={() => setVariant('build')}>Build</button>
              <button role="radio" aria-checked={variant === 'design'} className={variant === 'design' ? 'on' : ''} onClick={() => setVariant('design')}>Design</button>
            </span>
          )}
          {mode === 'deck' && (
            <>
              <span className="mode-pill soft">Template mode</span>
              <button className="mode-pill soft" onClick={() => setShowTemplates(true)}>{template === 'none' ? 'None selected' : (s.templates || []).find((t) => t.id === template)?.name} <ChevronIcon /></button>
            </>
          )}
          {mode === 'research' && (
            <span className="rel">
              <button className="mode-pill soft" onClick={() => setShowDepth((v) => !v)}>{depth === 'fast' ? 'Fast mode' : 'Deep mode'} <ChevronIcon /></button>
              {showDepth && (
                <div className="menu" role="menu">
                  <button role="menuitem" onClick={() => { setDepth('fast'); setShowDepth(false); }}>Fast</button>
                  <button role="menuitem" onClick={() => { setDepth('deep'); setShowDepth(false); }}>Deep</button>
                </div>
              )}
            </span>
          )}
          <button className="mode-pill soft" onClick={() => setShowCouncil(true)} title="Model Council"><PanelIcon /> Model Council <b>{advisers.length}</b></button>
          <span className="grow" />
          <span className="rel">
            <button className="model-btn" onClick={() => setShowModels((v) => !v)} aria-haspopup="dialog" aria-expanded={showModels}>{leadModel?.name} <ChevronIcon /></button>
            {showModels && <ModelPicker models={models} value={lead} onChange={setLead} onClose={() => setShowModels(false)} />}
          </span>
          <button className={`ic${listening ? ' live' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak your prompt'} title="Voice"><MicIcon /></button>
          <button className="send" onClick={submit} disabled={!text.trim() || busy} aria-label="Send"><SendIcon /></button>
        </div>
      </div>
      {!compact && (
        <div className="mode-row" role="tablist" aria-label="Modes">
          {MODES.filter((x) => x.id !== 'chat').map((x) => (
            <button key={x.id} role="tab" aria-selected={mode === x.id} className={`mode-chip${mode === x.id ? ' on' : ''}`} onClick={() => setMode(mode === x.id ? 'chat' : x.id)}>
              {x.icon && <x.icon />} {x.label}
            </button>
          ))}
        </div>
      )}
      {!compact && m.samples && (
        <div className="samples-col">
          {m.samples.map((sm) => <button key={sm} className="sample-line" onClick={() => { setText(sm); taRef.current?.focus(); }}>{sm}</button>)}
        </div>
      )}
      {error && <p role="alert" className="ticket-error" style={{ margin: '0.6rem 0 0' }}>{error}</p>}
      {showCouncil && <CouncilModal models={models} lead={lead} advisers={advisers} plan={s.plan} onChange={({ lead: l, advisers: a }) => { setLead(l); setAdvisers(a); }} onClose={() => setShowCouncil(false)} />}
      {showTemplates && <TemplateModal templates={s.templates || []} value={template} onPick={setTemplate} onClose={() => setShowTemplates(false)} />}
    </div>
  );
}
