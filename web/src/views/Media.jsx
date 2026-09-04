// Media studio: images and short motion pieces generated LOCALLY (procedural
// SVG from your prompt — real output, no invented provider), with the hosted
// model picker ready for when a media key is loaded.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const IMAGE_MODELS = [{ name: 'House procedural (local)', provider: null }, { name: 'GPT Image — your OpenAI key', provider: 'openai', modelId: 'gpt-image-1' }, { name: 'Gemini image — your Google key', provider: 'google', modelId: 'gemini-2.5-flash-image' }];
const VIDEO_MODELS = [{ name: 'House motion (local, SVG)', provider: null }, { name: 'Veo — not wired yet', provider: 'veo' }];
const STYLES = ['Poster', 'Infographic', 'Abstract', 'Storyboard'];

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

function generate(prompt, style, motion) {
  const seed = hash(prompt + style);
  const r = rnd(seed);
  const hues = [Math.floor(r() * 360), Math.floor(r() * 360), Math.floor(r() * 360)];
  const bg = `hsl(${hues[0]} 35% 12%)`;
  const shapes = Array.from({ length: style === 'Abstract' ? 18 : 9 }, (_, i) => {
    const x = r() * 800, y = r() * 500, w = 40 + r() * 260, h = 40 + r() * 200, rot = r() * 360, hue = hues[i % 3], op = 0.35 + r() * 0.5;
    const k = r();
    const anim = motion ? `<animateTransform attributeName="transform" type="rotate" from="${rot} ${x} ${y}" to="${rot + 360} ${x} ${y}" dur="${8 + r() * 12}s" repeatCount="indefinite"/>` : '';
    if (k < 0.4) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${8 + r() * 30}" fill="hsl(${hue} 70% 55%)" opacity="${op}" transform="rotate(${rot} ${x} ${y})">${anim}</rect>`;
    if (k < 0.7) return `<circle cx="${x}" cy="${y}" r="${w / 2}" fill="hsl(${hue} 65% 60%)" opacity="${op}"/>`;
    return `<path d="M${x} ${y} q ${w / 2} ${-h} ${w} 0 t ${w} 0" stroke="hsl(${hue} 80% 70%)" stroke-width="${3 + r() * 10}" fill="none" opacity="${op}"/>`;
  }).join('');
  const words = prompt.split(/\s+/).slice(0, 6).join(' ');
  const text = style === 'Abstract' ? '' : `<text x="40" y="460" font-family="Helvetica,Arial,sans-serif" font-size="${style === 'Poster' ? 44 : 26}" font-weight="800" fill="white" opacity=".92">${words.replace(/[<>&]/g, '')}</text>`;
  const bars = style === 'Infographic' ? Array.from({ length: 7 }, (_, i) => `<rect x="${60 + i * 100}" y="${360 - r() * 220}" width="60" height="${r() * 220 + 20}" fill="hsl(${hues[1]} 70% 60%)" opacity=".85" rx="6"><animate attributeName="height" from="0" to="${r() * 220 + 20}" dur="1.2s" fill="freeze"/></rect>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="100%"><rect width="800" height="520" fill="${bg}"/>${shapes}${bars}${text}</svg>`;
}

export default function Media() {
  const s = useStore();
  const [tab, setTab] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('Poster');
  const [model, setModel] = useState(0);
  const [outs, setOuts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [hosted, setHosted] = useState(null); // { url, media }
  const enabled = !!(s.tools || {}).media;
  const svg = useMemo(() => (outs[0] ? generate(outs[0].prompt, outs[0].style, outs[0].motion) : null), [outs]);
  const keyed = (prov) => !!(s.keys || {})[prov];
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening…</p></div>;
  const models = tab === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  const make = async () => {
    if (!prompt.trim()) return;
    const m = models[model];
    setErr(null);
    if (!m.provider) { setHosted(null); setOuts([{ prompt, style, motion: tab === 'video', at: Date.now() }, ...outs].slice(0, 6)); return; }
    if (m.provider === 'veo') { setErr('Video generation on hosted models is not wired yet — the local motion engine is the honest option today.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/media/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: `${prompt}${style ? ` — ${style.toLowerCase()} style` : ''}`, provider: m.provider, modelId: m.modelId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refused.');
      setHosted(j); s.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const download = () => { if (!svg) return; const b = new Blob([svg], { type: 'image/svg+xml' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'prajna-media.svg'; a.click(); URL.revokeObjectURL(u); };
  return (
    <div className="page">
      <h1 className="pg-title">Media studio</h1>
      <p className="lede">Images and motion pieces from a prompt. The house engine generates locally — real output, no invented provider. Load a media-capable key under <Link to="/keys">Your keys</Link> to route to hosted models.</p>
      {!enabled && <p role="status" className="soft-banner">Media Generation is switched off under <Link to="/tools">Tools</Link>. You can still preview here; enable it to attach media to missions.</p>}
      <nav className="tabs-row" aria-label="Media type"><button className={`tab-link${tab === 'image' ? ' on' : ''}`} onClick={() => setTab('image')}>Images</button><button className={`tab-link${tab === 'video' ? ' on' : ''}`} onClick={() => setTab('video')}>Video</button></nav>
      <div className="media-grid section-gap">
        <div className="media-form">
          <textarea className="goal-input" rows={3} placeholder={tab === 'image' ? 'A poster for a night market under paper lanterns…' : 'Slow drift over an amber city grid at dusk…'} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Media prompt" />
          <div className="samples">{STYLES.map((x) => <button key={x} className={`sample-chip${style === x ? ' on' : ''}`} onClick={() => setStyle(x)}>{x}</button>)}</div>
          <label className="lbl">Model<select className="key-input" value={model} onChange={(e) => setModel(Number(e.target.value))}>{models.map((m, i) => <option key={m.name} value={i}>{m.name}{m.provider && m.provider !== 'veo' ? (keyed(m.provider) ? ' · key loaded' : ' · no key') : ''}</option>)}</select></label>
          {model > 0 && models[model].provider !== 'veo' && !keyed(models[model].provider) && <p className="conn-note">This model needs a {models[model].provider === 'openai' ? 'OpenAI' : 'Google'} key under <Link to="/keys">Your keys</Link>. Nothing is generated until one is loaded — no silent fallback.</p>}
          {err && <p role="alert" className="key-err">{err}</p>}
          <button className="btn-stamp" onClick={make} disabled={!prompt.trim() || busy}>{busy ? 'Generating…' : 'Generate'}</button>
        </div>
        <div className="media-out">
          {hosted ? <div className="media-frame"><img src={hosted.url} alt={hosted.media.prompt} style={{ display: 'block', width: '100%' }} /></div> : svg ? <div className="media-frame" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="media-frame empty">Your generation appears here.</div>}
          {hosted && <p className="conn-hint" style={{ marginTop: '0.5rem' }}>{hosted.media.model} on your {hosted.media.provider === 'openai' ? 'OpenAI' : 'Google'} key · {(hosted.media.bytes / 1024).toFixed(0)} KB · {(hosted.media.ms / 1000).toFixed(1)}s · <a href={hosted.url} download>download</a></p>}
          {svg && <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.7rem' }}><button className="btn-quiet" onClick={download}>Download SVG</button><span className="conn-hint">local procedural engine · seed from your prompt · labeled synthetic</span></div>}
          {(s.media || []).length > 0 && <div className="media-history" aria-label="Hosted generations">{(s.media || []).slice(0, 8).map((m) => <button key={m.id} className="media-thumb" title={m.prompt} onClick={() => setHosted({ url: `/api/media/${m.id}`, media: m })}><img src={`/api/media/${m.id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button>)}</div>}
          {outs.length > 1 && <div className="media-history">{outs.slice(1).map((o) => <button key={o.at} className="media-thumb" onClick={() => setOuts([o, ...outs.filter((x) => x !== o)])} dangerouslySetInnerHTML={{ __html: generate(o.prompt, o.style, false) }} />)}</div>}
        </div>
      </div>
    </div>
  );
}
