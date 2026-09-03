// The amber LED ticker strip under the masthead. Content assembled from live
// workspace state; duplicated inline so the marquee loop has no gap. Pausable
// (WCAG 2.2.2) and paused on hover.
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { PauseIcon, PlayIcon } from './icons.jsx';

export default function Ticker() {
  const s = useStore();
  const [paused, setPaused] = useState(false);
  if (!s.ready) return <div className="ticker" aria-hidden="true" />;

  const live = s.missions.filter((m) => m.status === 'LIVE' || m.status.startsWith('PAUSED'));
  const done = s.missions.filter((m) => m.status === 'FILLED');
  const items = [
    `CREDITS ${s.workspace.credits.toFixed(0)}${s.workspace.reserved ? ` · RESERVED ${s.workspace.reserved.toFixed(0)}` : ''}`,
    live.length ? `LIVE MISSIONS ${live.length}` : 'ALL QUIET · NO LIVE MISSIONS',
    ...live.map((m) => `${m.serial} ${m.deskCode} ${m.status.startsWith('PAUSED') ? 'HOLDING' : 'RUNNING'} · ${m.spent.toFixed(0)}cr`),
    ...done.slice(0, 3).map((m) => `${m.serial} DONE ▲ ${m.deliverable.toUpperCase()}`),
    `${s.artifacts.length} ARTIFACTS DELIVERED`,
    'CONTRACT BEFORE ACTION · WORK IN THE OPEN · ARTIFACTS NOT ANSWERS',
  ];
  const strip = items.join('      •      ') + '      •      ';

  return (
    <div className="ticker" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="ticker-track" aria-hidden="true" style={{ animationPlayState: paused ? 'paused' : 'running' }}>
        <span>{strip}</span>
        <span>{strip}</span>
      </div>
      <button
        className="ticker-pause"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? 'Resume ticker' : 'Pause ticker'}
        title={paused ? 'Resume ticker' : 'Pause ticker'}
      >
        {paused ? <PlayIcon width="12" height="12" /> : <PauseIcon width="12" height="12" />}
      </button>
    </div>
  );
}
