// Boards (beta): a Kanban of missions plus a task map of a selected
// mission's plan graph (parallel vs sequential steps).
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link } from '../lib/router.jsx';

const COLS = [
  ['Pending', (m) => m.status === 'OPEN'],
  ['In progress', (m) => m.status === 'LIVE'],
  ['Review', (m) => m.status.startsWith('PAUSED')],
  ['Done', (m) => m.status === 'FILLED' || m.status === 'KILLED'],
];

function TaskMap({ mission }) {
  const plan = mission.contract.plan;
  // lanes by dependency depth
  const depth = {};
  const d = (id) => { if (depth[id] != null) return depth[id]; const p = plan.find((x) => x.id === id); depth[id] = p && p.dependsOn?.length ? 1 + Math.max(...p.dependsOn.map(d)) : 0; return depth[id]; };
  plan.forEach((p) => d(p.id));
  const maxD = Math.max(0, ...Object.values(depth));
  return (
    <div className="taskmap" aria-label={`Task map for ${mission.serial}`}>
      {Array.from({ length: maxD + 1 }, (_, lane) => (
        <div key={lane} className="lane">
          <span className="lane-k">{lane === 0 ? 'start' : `after ${lane}`}</span>
          {plan.filter((p) => depth[p.id] === lane).map((p) => (
            <div key={p.id} className={`tm-node ${p.status.toLowerCase()}`} title={p.title}>
              <b>{p.id}</b><span>{p.title}</span>
              {p.dependsOn?.length ? <em>← {p.dependsOn.join(', ')}</em> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Boards() {
  const s = useStore();
  const [sel, setSel] = useState(null);
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening boards…</p></div>;
  const mission = s.missions.find((m) => m.id === sel) || s.missions.find((m) => m.status === 'LIVE') || s.missions[0];
  return (
    <div className="page">
      <h1 className="pg-title">Boards <span className="beta">beta</span></h1>
      <p className="lede">A structured view of the work: every mission on a board, and a task map that shows which steps run in parallel and which must wait. Review-before-merge lands with shared projects.</p>
      <div className="kanban section-gap">
        {COLS.map(([title, fn]) => {
          const items = s.missions.filter(fn);
          return (
            <div key={title} className="kcol">
              <div className="kcol-head"><span className="brd-sm">{title}</span><span className="count">{items.length}</span></div>
              {items.length === 0 && <div className="kempty">, </div>}
              {items.map((m) => (
                <button key={m.id} className={`kcard tint-${m.tint}${mission?.id === m.id ? ' on' : ''}`} onClick={() => setSel(m.id)}>
                  <span className="sym">{m.serial}</span>
                  <b>{m.subject}</b>
                  <span>{m.deskName} · {m.spent.toFixed(0)}/{m.contract.ceiling} cr</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {mission && (
        <section className="board section-gap" aria-label="Task map">
          <div className="board-title"><span className="brd-sm">Task map: {mission.serial}</span><Link to={`/run/${mission.id}`} className="btn-quiet" style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem' }}>Open tape</Link></div>
          <TaskMap mission={mission} />
        </section>
      )}
    </div>
  );
}
