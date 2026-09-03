// The amber LED ticker strip under the masthead. Content assembled from live
// workspace state; duplicated inline so the marquee loop has no gap.
import { useStore } from '../lib/store.jsx';

export default function Ticker() {
  const s = useStore();
  if (!s.ready) return <div className="ticker" aria-hidden="true" />;

  const live = s.missions.filter((m) => m.status === 'LIVE');
  const filled = s.missions.filter((m) => m.status === 'FILLED');
  const items = [
    `CREDITS ${s.workspace.credits.toFixed(0)}`,
    live.length ? `LIVE POSITIONS ${live.length}` : 'FLOOR QUIET · NO LIVE POSITIONS',
    ...live.map((m) => `${m.serial} ${m.deskCode} RUNNING · ${m.spent.toFixed(0)}cr`),
    ...filled.slice(0, 3).map((m) => `${m.serial} FILLED ▲ ${m.deliverable.toUpperCase()}`),
    `LEDGER ${s.artifacts.length} ARTIFACTS`,
    'CONTRACT BEFORE ACTION · WORK IN THE OPEN · ARTIFACTS NOT ANSWERS',
  ];
  const strip = items.join('      •      ') + '      •      ';

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        <span>{strip}</span>
        <span>{strip}</span>
      </div>
    </div>
  );
}
