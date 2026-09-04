// Media studio: images and short motion pieces generated LOCALLY (procedural
// SVG from your prompt — real output, no invented provider), with the hosted
// model picker ready for when a media key is loaded.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const IMAGE_MODELS = ['House procedural (local)', 'GPT Image (needs OpenAI key)', 'Imagen (needs Google key)'];
const VIDEO_MODELS = ['House motion (local, CSS)', 'Veo (needs Google key)'];
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
  const enabled = !!(s.tools || {}).media;
  const svg = useMemo(() => (outs[0] ? generate(outs[0].prompt, outs[0].style, outs[0].motion) : null), [outs]);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening…</p></div>;
  const models = tab === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  const make = () => { if (!prompt.trim()) return; setOuts([{ prompt, style, motion: tab === 'video', at: Date.now() }, ...outs].slice(0, 6)); };
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
          <label className="lbl">Model<select className="key-input" value={model} onChange={(e) => setModel(Number(e.target.value))}>{models.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
          {model > 0 && <p className="conn-note">This model needs a provider key. Until it is loaded, generation falls back to the local engine and says so.</p>}
          <button className="btn-stamp" onClick={make} disabled={!prompt.trim()}>Generate</button>
        </div>
        <div className="media-out">
          {svg ? <div className="media-frame" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="media-frame empty">Your generation appears here.</div>}
          {svg && <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.7rem' }}><button className="btn-quiet" onClick={download}>Download SVG</button><span className="conn-hint">local procedural engine · seed from your prompt · labeled synthetic</span></div>}
          {outs.length > 1 && <div className="media-history">{outs.slice(1).map((o) => <button key={o.at} className="media-thumb" onClick={() => setOuts([o, ...outs.filter((x) => x !== o)])} dangerouslySetInnerHTML={{ __html: generate(o.prompt, o.style, false) }} />)}</div>}
        </div>
      </div>
    </div>
  );
}
