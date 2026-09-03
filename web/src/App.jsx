import { useEffect, useState } from 'react';
import { useRoute, Link, navigate } from './lib/router.jsx';
import { StoreProvider, useStore } from './lib/store.jsx';
import Palette from './components/Palette.jsx';
import Ticker from './components/Ticker.jsx';
import SplitFlap from './components/SplitFlap.jsx';
import { FloorIcon, LedgerIcon, SkillIcon, SeatIcon, MoonIcon, SunIcon, MenuIcon, SearchIcon } from './components/icons.jsx';
import Floor from './views/Floor.jsx';
import Run from './views/Run.jsx';
import Ledger from './views/Ledger.jsx';
import ArtifactView from './views/ArtifactView.jsx';
import Skills from './views/Skills.jsx';
import Instruments from './views/Instruments.jsx';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return <div className="clock" aria-label="Local time">{hh}:{mm}:{ss}</div>;
}

function Rail({ open, onClose, theme, setTheme }) {
  const s = useStore();
  const path = useRoute();
  const items = [
    { to: '/', label: 'The floor', icon: FloorIcon, kbd: 'F' },
    { to: '/ledger', label: 'Ledger', icon: LedgerIcon, kbd: 'L' },
    { to: '/skills', label: 'Skills', icon: SkillIcon, kbd: 'S' },
    { to: '/instruments', label: 'Instruments', icon: SeatIcon, kbd: 'I' },
  ];
  const active = (to) => (to === '/' ? path === '/' || path.startsWith('/run') : path.startsWith(to));
  return (
    <>
      {open && <div className="rail-veil" onClick={onClose} />}
      <nav className={`rail${open ? ' open' : ''}`} aria-label="Primary">
        <div className="rail-logo">
          <span className="mark">PRAJÑĀ</span>
          <span className="sub">Outcome Exchange</span>
        </div>
        <div className="rail-nav">
          {items.map(({ to, label, icon: Icon, kbd }) => (
            <Link key={to} to={to} className={`rail-item${active(to) ? ' on' : ''}`} onClick={onClose}>
              <Icon className="rail-glyph" />
              <span className="brd-sm">{label}</span>
              <span className="rail-kbd">{kbd}</span>
            </Link>
          ))}
        </div>
        <div className="rail-foot">
          <div className="credit-meter">
            <div className="lbl">House credits</div>
            <div className="val">{s.ready ? s.workspace.credits.toFixed(0) : '····'}</div>
            <div className="unit">{s.ready ? `${s.workspace.spent.toFixed(0)} spent to date` : ''}</div>
          </div>
          <button className="theme-btn" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}>
            {theme === 'day' ? <MoonIcon /> : <SunIcon />}
            {theme === 'day' ? 'Night hall' : 'Day desk'}
          </button>
          <div className="rail-user">
            <span className="seat">N</span>
            <span className="who">
              <b>{s.ready ? s.workspace.name : '—'}</b>
              <span>{s.ready ? s.workspace.seat : ''}</span>
            </span>
          </div>
        </div>
      </nav>
    </>
  );
}

function Masthead({ onMenu, onPalette }) {
  return (
    <>
      <header className="masthead">
        <button className="menu-btn" onClick={onMenu} aria-label="Open navigation">
          <MenuIcon />
        </button>
        <div className="title">
          <SplitFlap text="PRAJÑĀ" size="1.05rem" />
          <span className="hall-line">The outcome exchange · every run in the open</span>
        </div>
        <div className="mast-right">
          <button className="palette-hint" onClick={onPalette}>
            <SearchIcon /> Jump <kbd>⌘K</kbd>
          </button>
          <Clock />
        </div>
      </header>
      <Ticker />
    </>
  );
}

function Router() {
  const path = useRoute();
  if (path.startsWith('/run/')) return <Run id={path.split('/')[2]} />;
  if (path.startsWith('/artifact/')) return <ArtifactView id={path.split('/')[2]} />;
  if (path.startsWith('/ledger')) return <Ledger />;
  if (path.startsWith('/skills')) return <Skills />;
  if (path.startsWith('/instruments')) return <Instruments />;
  return <Floor />;
}

function Shell() {
  const [theme, setTheme] = useState(() => {
    const q = new URLSearchParams(location.search).get('theme');
    return q || localStorage.getItem('prajna-theme') || 'night';
  });
  const [railOpen, setRailOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const path = useRoute();

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'day' ? 'day' : '';
    if (theme === 'day') document.documentElement.setAttribute('data-theme', 'day');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('prajna-theme', theme);
  }, [theme]);

  useEffect(() => {
    const NAV_KEYS = { f: '/', l: '/ledger', s: '/skills', i: '/instruments' };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const to = NAV_KEYS[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        navigate(to);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const artifactFull = path.startsWith('/artifact/');

  return (
    <div className="shell">
      <Rail open={railOpen} onClose={() => setRailOpen(false)} theme={theme} setTheme={setTheme} />
      <div className="main">
        {!artifactFull && <Masthead onMenu={() => setRailOpen(true)} onPalette={() => setPalette(true)} />}
        {artifactFull ? (
          <Router />
        ) : (
          <div className="scroll">
            <Router />
          </div>
        )}
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
