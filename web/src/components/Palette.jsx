// ⌘K command palette: routes, desks, missions, artifacts, and the words
// themselves: the second group searches inside the record, the delivered
// artifacts, every tape, the decisions and the sources. A real dialog,
// focus trapped, Escape anywhere, focus restored, selection announced.
import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/router.jsx';
import { useStore } from '../lib/store.jsx';

export default function Palette({ onClose }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);
  const [deep, setDeep] = useState({ q: '', hits: [], searching: false });

  useEffect(() => {
    restoreRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);

  // The record is searched on the server, debounced; the local list stays instant.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setDeep({ q: '', hits: [], searching: false }); return; }
    setDeep((d) => ({ ...d, searching: true }));
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(needle)}&limit=8`);
        const j = await r.json();
        if (live) setDeep({ q: needle, hits: r.ok ? j.hits || [] : [], total: j.total || 0, searching: false });
      } catch { if (live) setDeep({ q: needle, hits: [], searching: false }); }
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const items = useMemo(() => {
    const base = [
      // Runs waiting on a decision come first, one keystroke from anywhere.
      ...(s.pending || []).map((d) => ({ k: 'DECIDE', t: `${d.serial} · ${d.kind}, ${d.prompt.slice(0, 90)}`, to: `/run/${d.id}`, decide: true })),
      { k: 'GO', t: 'New thread', to: '/' },
      { k: 'GO', t: 'Missions: tickets & runs', to: '/missions' },
      { k: 'GO', t: 'Docket: every ticket on a board', to: '/boards' },
      { k: 'GO', t: 'Toolroom: fittings that change the plans', to: '/plugins' },
      { k: 'GO', t: 'Foundry: terminal, showroom, deliveries', to: '/factory/cli' },
      { k: 'GO', t: 'Instruments: what the house may use', to: '/tools' },
      { k: 'GO', t: 'Darkroom: pictures and voices on your key', to: '/media' },
      { k: 'GO', t: 'Artifacts: everything delivered', to: '/artifacts' },
      { k: 'GO', t: 'Crafts: the house playbook', to: '/skills' },
      { k: 'GO', t: 'Wiring: the apps on the table', to: '/connectors' },
      { k: 'GO', t: 'Your keys: bring your own models', to: '/keys' },
      { k: 'GO', t: 'Release notes: what shipped', to: '/releases' },
      ...(s.chats || []).slice(0, 8).map((c) => ({ k: 'CHAT', t: c.title, to: `/c/${c.id}` })),
      ...(s.missions || []).slice(0, 8).map((m) => ({ k: m.serial, t: m.subject, to: `/run/${m.id}` })),
      ...(s.artifacts || []).slice(0, 8).map((a) => ({ k: 'ART', t: a.title, to: `/artifact/${a.id}` })),
    ];
    if (!q.trim()) return base.slice(0, 12);
    const needle = q.toLowerCase();
    const near = base.filter((i) => `${i.k} ${i.decide ? 'decision needed decide' : ''} ${i.t}`.toLowerCase().includes(needle)).slice(0, 8);
    const seen = new Set(near.map((i) => i.to));
    const found = (deep.q === q.trim() ? deep.hits : []).filter((h) => !seen.has(h.to)).map((h) => ({ k: h.serial || (h.kind === 'chat' ? 'CHAT' : 'ART'), t: h.title, to: h.to, where: h.where, snippet: h.snippet }));
    return [...near, ...found].slice(0, 14);
  }, [q, s, deep]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = (item) => {
    if (!item) return;
    onClose();
    // Desk handoff rides the URL so the Floor reads it on mount, no
    // pre-mount event can be lost.
    navigate(item.to);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(items[sel]); }
    if (e.key === 'Tab') {
      // Focus trap: the dialog holds the input and the option list only.
      const focusables = dialogRef.current?.querySelectorAll('input, button');
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <div className="palette-veil" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Jump anywhere"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump anywhere: missions, artifacts, desks…"
          aria-label="Search the workspace"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-options"
          aria-activedescendant={items[sel] ? `palette-opt-${sel}` : undefined}
          aria-autocomplete="list"
        />
        <div className="palette-list" ref={listRef} role="listbox" id="palette-options" aria-label="Destinations">
          {items.map((item, i) => (
            <button
              key={`${item.k}-${item.t}`}
              id={`palette-opt-${i}`}
              role="option"
              aria-selected={i === sel}
              tabIndex={-1}
              className={`palette-item${i === sel ? ' sel' : ''}${item.decide ? ' decide' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(item)}
            >
              <span className="k">{item.k}</span>
              <span className="t">{item.t}{item.snippet && <span className="pal-snip"><em className="pal-where">{item.where}</em> {item.snippet}</span>}</span>
            </button>
          ))}
          {items.length === 0 && <div className="palette-empty" role="status">{deep.searching ? `Searching the record for “${q}”…` : `Nothing on the board or in the record matches “${q}”.`}</div>}
          {items.length > 0 && deep.q === q.trim() && deep.total > deep.hits.length && <div className="palette-empty" role="status">{deep.total} places in the record mention “{q}”; the closest are listed.</div>}
        </div>
      </div>
    </div>
  );
}
