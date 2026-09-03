import { useEffect, useRef, useState } from 'react';
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
import Connectors from './views/Instruments.jsx';

const TITLES = [
  ['/run/', 'Mission'],
  ['/artifact/', 'Artifact'],
  ['/artifacts', 'Artifacts'],
  ['/ledger', 'Artifacts'],
  ['/skills', 'Skills'],
  ['/connectors', 'Connectors'],
  ['/instruments', 'Connectors'],
];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return <div className="clock" aria-hidden="true">{hh}:{mm}:{ss}</div>;
}

function Rail({ open, onClose, theme, setTheme, menuRef }) {
  const s = useStore();
  const path = useRoute();
  const firstRef = useRef(null);
  const items = [
    { to: '/', label: 'Missions', icon: FloorIcon, kbd: 'M' },
    { to: '/artifacts', label: 'Artifacts', icon: LedgerIcon, kbd: 'A' },
    { to: '/skills', label: 'Skills', icon: SkillIcon, kbd: 'S' },
    { to: '/connectors', label: 'Connectors', icon: SeatIcon, kbd: 'C' },
  ];
  const active = (to) => (to === '/' ? path === '/' || path.startsWith('/run') : path.startsWith(to) || (to === '/connectors' && path.startsWith('/instruments')) || (to === '/artifacts' && (path.startsWith('/ledger') || path.startsWith('/artifact/'))));
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;

  // Drawer a11y: focus moves in on open, Escape closes, focus returns to the
  // menu button; while closed on mobile the rail is inert to the Tab order.
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); menuRef.current?.focus(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose, menuRef]);

  const w = s.ready ? s.workspace : null;

  return (
    <>
      {open && <div className="rail-veil" onClick={onClose} />}
      <nav className={`rail${open ? ' open' : ''}`} aria-label="Primary" inert={mobile && !open}>
        <div className="rail-logo">
          <span className="mark">PRAJÑĀ</span>
          <span className="sub">Outcome Exchange</span>
        </div>
        <div className="rail-nav">
          {items.map(({ to, label, icon: Icon, kbd }, i) => (
            <Link key={to} to={to} className={`rail-item${active(to) ? ' on' : ''}`} onClick={onClose} ref={i === 0 ? firstRef : undefined} aria-current={active(to) ? 'page' : undefined}>
              <Icon className="rail-glyph" />
              <span className="brd-sm">{label}</span>
              <span className="rail-kbd" aria-hidden="true">{kbd}</span>
            </Link>
          ))}
        </div>
        <div className="rail-foot">
          <div className="credit-meter" aria-label={w ? `House credits ${w.credits.toFixed(0)} available, ${w.reserved.toFixed(0)} reserved, ${w.spent.toFixed(0)} spent to date` : 'House credits'}>
            <div className="lbl">House credits</div>
            <div className="val">{w ? w.credits.toFixed(0) : '····'}</div>
            <div className="unit">{w ? `${w.reserved > 0 ? `${w.reserved.toFixed(0)} reserved · ` : ''}${w.spent.toFixed(0)} spent to date` : ''}</div>
          </div>
          <button className="theme-btn" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}>
            {theme === 'day' ? <MoonIcon /> : <SunIcon />}
            {theme === 'day' ? 'Night hall' : 'Day desk'}
          </button>
          <div className="rail-user">
            <span className="seat" aria-hidden="true">N</span>
            <span className="who">
              <b>{w ? w.name : '—'}</b>
              <span>{w ? w.seat : ''}</span>
            </span>
          </div>
        </div>
      </nav>
    </>
  );
}

function Masthead({ onMenu, onPalette, menuRef }) {
  return (
    <>
      <header className="masthead">
        <button className="menu-btn" onClick={onMenu} aria-label="Open navigation" ref={menuRef}>
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
  if (path.startsWith('/artifacts') || path.startsWith('/ledger')) return <Ledger />;
  if (path.startsWith('/skills')) return <Skills />;
  if (path.startsWith('/connectors') || path.startsWith('/instruments')) return <Connectors />;
  return <Floor />;
}

function readTheme() {
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'day' || q === 'night') {
    // View-only override: honored for this load, never persisted, and stripped
    // from the URL so a reload returns to the saved preference.
    const url = new URL(location.href);
    url.searchParams.delete('theme');
    history.replaceState(null, '', url.pathname + url.search);
    return q;
  }
  const saved = localStorage.getItem('prajna-theme');
  return saved === 'day' ? 'day' : 'night';
}

function Shell() {
  const [theme, setThemeState] = useState(readTheme);
  const [railOpen, setRailOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const path = useRoute();
  const menuRef = useRef(null);
  const mainRef = useRef(null);

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem('prajna-theme', t);
  };

  useEffect(() => {
    if (theme === 'day') document.documentElement.setAttribute('data-theme', 'day');
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  // Route change: title, scroll to top, and focus lands on the main region so
  // keyboard and screen-reader users start at the new content.
  useEffect(() => {
    const t = TITLES.find(([prefix]) => path.startsWith(prefix));
    document.title = `${t ? `${t[1]} · ` : ''}Prajñā — The Outcome Exchange`;
    const scroller = mainRef.current?.querySelector('.scroll');
    if (scroller) scroller.scrollTop = 0;
    mainRef.current?.focus({ preventScroll: true });
  }, [path]);

  useEffect(() => {
    const NAV_KEYS = { m: '/', a: '/artifacts', s: '/skills', c: '/connectors' };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Single-key navigation only fires when nothing interactive has focus —
      // never from inside a form, a chip, or a decision card.
      const t = e.target;
      const interactive = t !== document.body && t !== mainRef.current && !t.classList?.contains('scroll');
      if (interactive) return;
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
      <Rail open={railOpen} onClose={() => setRailOpen(false)} theme={theme} setTheme={setTheme} menuRef={menuRef} />
      <div className="main" ref={mainRef} tabIndex={-1} id="main">
        {!artifactFull && <Masthead onMenu={() => setRailOpen(true)} onPalette={() => setPalette(true)} menuRef={menuRef} />}
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
