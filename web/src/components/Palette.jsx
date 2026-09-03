// ⌘K command palette: routes, desks, missions, artifacts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/router.jsx';
import { useStore } from '../lib/store.jsx';

export default function Palette({ onClose }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo(() => {
    const base = [
      { k: 'GO', t: 'The floor — open a position', to: '/' },
      { k: 'GO', t: 'Ledger — every artifact', to: '/ledger' },
      { k: 'GO', t: 'Skills — the house playbook', to: '/skills' },
      { k: 'GO', t: 'Instruments — connectors', to: '/instruments' },
      ...(s.desks || []).map((d) => ({ k: d.code, t: `Open a ${d.name.toLowerCase()} position`, to: `/?desk=${d.id}` })),
      ...(s.missions || []).slice(0, 8).map((m) => ({ k: m.serial, t: m.subject, to: `/run/${m.id}` })),
      ...(s.artifacts || []).slice(0, 8).map((a) => ({ k: 'ART', t: a.title, to: `/artifact/${a.id}` })),
    ];
    if (!q.trim()) return base.slice(0, 12);
    const needle = q.toLowerCase();
    return base.filter((i) => `${i.k} ${i.t}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, s]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.to.split('?')[0] === '/' && item.to.includes('desk=') ? '/' : item.to);
    if (item.to.includes('desk=')) {
      const desk = item.to.split('desk=')[1];
      dispatchEvent(new CustomEvent('prajna:desk', { detail: desk }));
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
    if (e.key === 'Enter') go(items[sel]);
  };

  return (
    <div className="palette-veil" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump anywhere — positions, artifacts, desks…"
          aria-label="Search the workspace"
        />
        <div className="palette-list" ref={listRef}>
          {items.map((item, i) => (
            <button
              key={`${item.k}-${item.t}`}
              className={`palette-item${i === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(item)}
            >
              <span className="k">{item.k}</span>
              <span className="t">{item.t}</span>
            </button>
          ))}
          {items.length === 0 && <div className="palette-empty">Nothing on the board matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}
