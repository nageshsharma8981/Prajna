// Workspace store: bootstrap payload + helpers, exposed via context.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/bootstrap');
      if (!r.ok) throw new Error(`bootstrap ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const api = {
    ...(data || {}),
    ready: !!data,
    error,
    refresh,
    async writeTicket(body) {
      const r = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Ticket refused');
      const mission = await r.json();
      await refresh();
      return mission;
    },
    async launch(id) {
      await fetch(`/api/missions/${id}/launch`, { method: 'POST' });
      await refresh();
    },
    async voidTicket(id) {
      await fetch(`/api/missions/${id}/void`, { method: 'POST' });
      await refresh();
    },
    async toggleConnector(id) {
      await fetch(`/api/connectors/${id}/toggle`, { method: 'POST' });
      await refresh();
    },
    async toggleSkill(id) {
      await fetch(`/api/skills/${id}/toggle`, { method: 'POST' });
      await refresh();
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
