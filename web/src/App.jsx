import { useEffect, useRef, useState } from 'react';
import { useRoute, Link, navigate } from './lib/router.jsx';
import { StoreProvider, useStore } from './lib/store.jsx';
import Palette from './components/Palette.jsx';
import { EditIcon, PluginIcon, FactoryIcon, ChevronIcon, MoonIcon, SunIcon, MenuIcon, SearchIcon, LedgerIcon, SkillIcon, SeatIcon, KeyIcon, FloorIcon, ToolIcon, BoardIcon } from './components/icons.jsx';
import Home from './views/Home.jsx';
import Chat from './views/Chat.jsx';
import Plugins from './views/Plugins.jsx';
import Factory from './views/Factory.jsx';
import Boards from './views/Boards.jsx';
import Tools from './views/Tools.jsx';
import Connectors from './views/Connectors.jsx';
import Account from './views/Account.jsx';
import Media from './views/Media.jsx';
import Floor from './views/Floor.jsx';
import Run from './views/Run.jsx';
import Ledger from './views/Ledger.jsx';
import ArtifactView from './views/ArtifactView.jsx';
import Compare from './views/Compare.jsx';
import Skills from './views/Skills.jsx';
import Keys from './views/Keys.jsx';

const TITLES = [['/c/', 'Chat'], ['/plugins', 'Plugins'], ['/factory', 'Factory'], ['/boards', 'Boards'], ['/tools', 'Tools'], ['/connectors', 'Connectors'], ['/skills', 'Skills'], ['/keys', 'Your keys'], ['/media', 'Media'], ['/account', 'Account'], ['/missions', 'Missions'], ['/run/', 'Mission'], ['/artifacts', 'Artifacts'], ['/artifact/', 'Artifact'], ['/compare/', 'Compare versions']];

function Sidebar({ open, onClose, menuRef }) {
  const s = useStore();
  const path = useRoute();
  const [chatsOpen, setChatsOpen] = useState(true);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); menuRef.current?.focus(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose, menuRef]);
  const active = (to) => path === to || (to !== '/' && path.startsWith(to));
  const w = s.ready ? s.workspace : null;
  const tier = s.ready ? (s.planTiers || []).find((t) => t.id === s.plan) : null;
  const chats = s.ready ? s.chats || [] : [];
  const MENU = [['profile', 'My Profile'], ['dashboard', 'Dashboard'], ['assets', 'My Assets'], ['personalization', 'Personalization'], ['language', 'Language'], ['subscription', 'Subscription'], ['invoices', 'Payment & Invoices']];
  const delChat = async (e, id) => { e.preventDefault(); e.stopPropagation(); await fetch(`/api/chats/${id}`, { method: 'DELETE' }); s.refresh(); if (path === `/c/${id}`) navigate('/'); };

  return (
    <>
      {open && <div className="rail-veil" onClick={onClose} />}
      <nav className={`side${open ? ' open' : ''}`} aria-label="Primary" inert={mobile && !open}>
        <Link to="/" className="side-logo" onClick={onClose} aria-label="Prajñā home"><img className="logo-img" src="/logo.png" alt="Prajñā" width="180" height="60" /></Link>
        <div className="side-nav">
          <Link to="/" className={`side-item${path === '/' ? ' on' : ''}`} onClick={onClose}><EditIcon /> New chat</Link>
          <Link to="/plugins" className={`side-item${active('/plugins') ? ' on' : ''}`} onClick={onClose}><PluginIcon /> Plugins</Link>
          <Link to="/factory/cli" className={`side-item${active('/factory') ? ' on' : ''}`} onClick={onClose}><FactoryIcon /> Factory</Link>
          {(s.pending || []).length > 0 && (
            <Link to={s.pending.length === 1 ? `/run/${s.pending[0].id}` : '/missions'} className={`side-item decisions${active('/run/') ? ' on' : ''}`} onClick={onClose} title={s.pending.map((p) => `${p.serial}: ${p.prompt}`).join('\n')}>
              <span className="pulse" aria-hidden="true" /> Decision needed <span className="badge-n">{s.pending.length}</span>
            </Link>
          )}
          <button className={`side-group${boardsOpen ? ' open' : ''}`} onClick={() => setBoardsOpen((v) => !v)} aria-expanded={boardsOpen}><BoardIcon /> Boards <span className="beta">beta</span><ChevronIcon /></button>
          {boardsOpen && <div className="side-sub"><Link to="/boards" className={`side-item sm${active('/boards') ? ' on' : ''}`} onClick={onClose}>Mission board</Link><Link to="/missions" className={`side-item sm${active('/missions') ? ' on' : ''}`} onClick={onClose}>Tickets &amp; runs</Link></div>}
          <button className={`side-group${chatsOpen ? ' open' : ''}`} onClick={() => setChatsOpen((v) => !v)} aria-expanded={chatsOpen}>Chats <ChevronIcon /></button>
          {chatsOpen && (
            <div className="side-sub chats">
              {chats.length === 0 && <span className="side-empty">Empty</span>}
              {chats.slice(0, 30).map((c) => (
                <Link key={c.id} to={`/c/${c.id}`} className={`side-item sm chat${path === `/c/${c.id}` ? ' on' : ''}`} onClick={onClose} title={c.title}>
                  <span className="t">{c.title}</span>
                  <button className="del" onClick={(e) => delChat(e, c.id)} aria-label={`Delete chat ${c.title}`}>×</button>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="side-foot">
          <div className="side-tools">
            <Link to="/connectors" className={`side-item sm${active('/connectors') ? ' on' : ''}`} onClick={onClose}><SeatIcon /> Connectors</Link>
            <Link to="/skills" className={`side-item sm${active('/skills') ? ' on' : ''}`} onClick={onClose}><SkillIcon /> Skills</Link>
            <Link to="/tools" className={`side-item sm${active('/tools') ? ' on' : ''}`} onClick={onClose}><ToolIcon /> Tools</Link>
            <Link to="/keys" className={`side-item sm${active('/keys') ? ' on' : ''}`} onClick={onClose}><KeyIcon /> Your keys</Link>
          </div>
          <Link to="/account/subscription" className="plan-pill" onClick={onClose}>
            <span className="plan-k">{tier ? `${tier.name} plan` : 'Plan'}</span>
            <span className="plan-v">{w ? `${w.credits.toFixed(0)} credits` : '…'}</span>
          </Link>
          <div className="rel">
            <button className="side-user" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="seat">{s.ready ? ((s.profile.name || '').trim()[0] || s.profile.avatar || 'P').toUpperCase() : 'P'}</span>
              <span className="who"><b>{s.ready ? (s.profile.name || 'Set up your profile') : '—'}</b><span>{s.ready ? (s.profile.email || s.profile.handle || 'name, handle, email') : ''}</span></span>
            </button>
            {menu && (
              <div className="user-menu" role="menu">
                <div className="um-head"><span className="seat">{((s.profile.name || '').trim()[0] || 'P').toUpperCase()}</span><span className="who"><b>{s.profile.name || 'No name yet'}</b><span>{s.profile.email || 'Add your details under My Profile'}</span></span></div>
                {MENU.map(([id, label]) => <Link key={id} to={`/account/${id}`} role="menuitem" className="um-item" onClick={() => { setMenu(false); onClose(); }}>{label}</Link>)}
                <div className="um-sep" />
                <Link to="/account/settings" role="menuitem" className="um-item" onClick={() => { setMenu(false); onClose(); }}>Settings</Link>
                <Link to="/account/help" role="menuitem" className="um-item" onClick={() => { setMenu(false); onClose(); }}>Get Help</Link>
                <div className="um-sep" />
                <button role="menuitem" className="um-item danger" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); localStorage.removeItem('prajna-theme'); setMenu(false); navigate('/'); s.refresh(); }}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

function Router() {
  const path = useRoute();
  if (path.startsWith('/c/')) return <Chat id={path.split('/')[2]} />;
  if (path.startsWith('/plugins')) return <Plugins />;
  if (path.startsWith('/factory')) return <Factory tab={path.split('/')[2] || 'cli'} />;
  if (path.startsWith('/boards')) return <Boards />;
  if (path.startsWith('/tools')) return <Tools />;
  if (path.startsWith('/connectors') || path.startsWith('/instruments')) return <Connectors />;
  if (path.startsWith('/skills')) return <Skills />;
  if (path.startsWith('/keys')) return <Keys />;
  if (path.startsWith('/media')) return <Media />;
  if (path.startsWith('/account')) return <Account page={path.split('/')[2] || 'profile'} />;
  if (path.startsWith('/missions')) return <Floor />;
  if (path.startsWith('/run/')) return <Run id={path.split('/')[2]} />;
  if (path.startsWith('/artifact/')) return <ArtifactView id={path.split('/')[2]} />;
  if (path.startsWith('/compare/')) return <Compare leftId={path.split('/')[2]} rightId={path.split('/')[3]} />;
  if (path.startsWith('/artifacts') || path.startsWith('/ledger')) return <Ledger />;
  return <Home />;
}

function Gate() {
  const s = useStore();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await s.unlock(code); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="gate">
      <form className="gate-card" onSubmit={go}>
        <img className="logo-img" src="/logo.png" alt="Prajñā" width="180" height="60" />
        <h1>The house is locked</h1>
        <p>Enter the access code to open this workspace. Nothing here runs, and no credits move, until you do.</p>
        <input className="key-input" type="password" autoComplete="off" autoFocus placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
        <button className="btn-stamp attn-btn" disabled={busy || !code}>Open the house</button>
        {err && <p role="alert" className="key-err">{err}</p>}
      </form>
    </div>
  );
}

function readTheme() {
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'day' || q === 'night') { const url = new URL(location.href); url.searchParams.delete('theme'); history.replaceState(null, '', url.pathname + url.search); return q; }
  return localStorage.getItem('prajna-theme') === 'day' ? 'day' : 'night';
}

function Shell() {
  const s = useStore();
  const [theme, setThemeState] = useState(readTheme);
  const [sideOpen, setSideOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const path = useRoute();
  const menuRef = useRef(null);
  const mainRef = useRef(null);
  const setTheme = (t) => { setThemeState(t); localStorage.setItem('prajna-theme', t); };
  useEffect(() => { if (theme === 'day') document.documentElement.setAttribute('data-theme', 'day'); else document.documentElement.removeAttribute('data-theme'); }, [theme]);
  useEffect(() => {
    const t = TITLES.find(([prefix]) => path.startsWith(prefix));
    const n = s.pending?.length || 0;
    document.title = `${n ? `(${n}) Decision needed · ` : ''}${t ? `${t[1]} · ` : ''}Prajñā`;
    const scroller = mainRef.current?.querySelector('.scroll');
    if (scroller) scroller.scrollTop = 0;
    mainRef.current?.focus({ preventScroll: true });
  }, [path, s.pending?.length]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); }
      // "/" focuses the composer when nothing else is being typed into.
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) {
        const box = document.querySelector('.composer-input');
        if (box) { e.preventDefault(); box.focus(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const full = path.startsWith('/artifact/') || path.startsWith('/compare/');
  if (s.locked) return <Gate />;
  return (
    <div className="shell">
      <Sidebar open={sideOpen} onClose={() => setSideOpen(false)} menuRef={menuRef} />
      <div className="main" ref={mainRef} tabIndex={-1} id="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSideOpen(true)} aria-label="Open navigation" ref={menuRef}><MenuIcon /></button>
          <Link to="/" className="topbar-logo" aria-label="Prajñā home"><img className="logo-img" src="/logo.png" alt="Prajñā" width="120" height="40" /></Link>
          <span className="grow" />
          {(s.pending || []).length > 0 && <Link to={s.pending.length === 1 ? `/run/${s.pending[0].id}` : '/missions'} className="bell" aria-label={`${s.pending.length} decision${s.pending.length === 1 ? '' : 's'} needed`} title={s.pending.map((p) => `${p.serial}: ${p.prompt}`).join('\n')}><span className="pulse" aria-hidden="true" />{s.pending.length}</Link>}
          <button className="palette-hint" onClick={() => setPalette(true)}><SearchIcon /> Jump <kbd>⌘K</kbd></button>
          <button className="ic round" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')} aria-label={theme === 'day' ? 'Switch to night hall' : 'Switch to day desk'} title="Theme">{theme === 'day' ? <MoonIcon /> : <SunIcon />}</button>
        </div>
        {full ? <Router /> : <div className="scroll"><Router /></div>}
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

export default function App() { return <StoreProvider><Shell /></StoreProvider>; }
