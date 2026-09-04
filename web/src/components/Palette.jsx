// ⌘K command palette: routes, desks, missions, artifacts. A real dialog —
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

  useEffect(() => {
    restoreRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);

  const items = useMemo(() => {
    const base = [
      // Runs waiting on a decision come first — one keystroke from anywhere.
      ...(s.pending || []).map((d) => ({ k: 'DECIDE', t: `${d.serial} · ${d.kind} — ${d.prompt.slice(0, 90)}`, to: `/run/${d.id}`, decide: true })),
      { k: 'GO', t: 'New chat', to: '/' },
      { k: 'GO', t: 'Missions — tickets & runs', to: '/missions' },
      { k: 'GO', t: 'Boards', to: '/boards' },
      { k: 'GO', t: 'Plugins', to: '/plugins' },
      { k: 'GO', t: 'Factory', to: '/factory/cli' },
      { k: 'GO', t: 'Tools', to: '/tools' },
      { k: 'GO', t: 'Media studio', to: '/media' },
      { k: 'GO', t: 'Artifacts — everything delivered', to: '/artifacts' },
      { k: 'GO', t: 'Skills — the house playbook', to: '/skills' },
      { k: 'GO', t: 'Connectors — evidence sources', to: '/connectors' },
      { k: 'GO', t: 'Your keys — bring your own models', to: '/keys' },
      ...(s.chats || []).slice(0, 8).map((c) => ({ k: 'CHAT', t: c.title, to: `/c/${c.id}` })),
      ...(s.missions || []).slice(0, 8).map((m) => ({ k: m.serial, t: m.subject, to: `/run/${m.id}` })),
      ...(s.artifacts || []).slice(0, 8).map((a) => ({ k: 'ART', t: a.title, to: `/artifact/${a.id}` })),
    ];
    if (!q.trim()) return base.slice(0, 12);
    const needle = q.toLowerCase();
    return base.filter((i) => `${i.k} ${i.decide ? 'decision needed decide' : ''} ${i.t}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, s]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = (item) => {
    if (!item) return;
    onClose();
    // Desk handoff rides the URL so the Floor reads it on mount — no
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
          placeholder="Jump anywhere — missions, artifacts, desks…"
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
              <span className="t">{item.t}</span>
            </button>
          ))}
          {items.length === 0 && <div className="palette-empty" role="status">Nothing on the board matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}
