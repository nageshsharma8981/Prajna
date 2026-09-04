// Workspace store: bootstrap payload + helpers, exposed via context.
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const Ctx = createContext(null);

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `The house refused the request (${r.status}).`);
  }
  return r.json().catch(() => ({}));
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);
  const dataRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/bootstrap');
      if (r.status === 401) { setLocked(true); setError(null); return; }
      if (!r.ok) throw new Error(`bootstrap ${r.status}`);
      setLocked(false);
      const next = await r.json();
      const PRO = new Set(['opus', 'gpt', 'deepseek']);
      next.models = (next.models || []).map((m) => ({ ...m, pro: PRO.has(m.id) }));
      dataRef.current = next;
      setData(next);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While anything is running, the credit meter, ticker and boards keep pace
  // with the ledger on a light poll — every surface, not just the run tape.
  useEffect(() => {
    const busy = (data?.missions || []).some((m) => m.status === 'LIVE' || m.status.startsWith('PAUSED'));
    if (!busy) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [data, refresh]);

  const api = {
    ...(data || {}),
    ready: !!data,
    locked,
    error,
    async unlock(code) {
      const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The house refused the code.');
      await refresh();
    },
    refresh,
    async writeTicket(body) {
      const mission = await post('/api/missions', body);
      await refresh();
      return mission;
    },
    async launch(id) {
      await post(`/api/missions/${id}/launch`);
      await refresh();
    },
    async voidTicket(id) {
      await post(`/api/missions/${id}/void`);
      await refresh();
    },
    async toggleConnector(id) {
      await post(`/api/connectors/${id}/toggle`);
      await refresh();
    },
    async toggleSkill(id) {
      await post(`/api/skills/${id}/toggle`);
      await refresh();
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
