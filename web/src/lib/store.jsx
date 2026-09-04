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
  // with the ledger on a light poll, every surface, not just the run tape.
  useEffect(() => {
    const busy = (data?.missions || []).some((m) => m.status === 'LIVE' || m.status.startsWith('PAUSED'));
    if (!busy) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [data, refresh]);

  // Decisions the house is waiting on: paused missions with an undecided
  // attention item. Surfaced in the title, the sidebar and (opt-in) a
  // browser notification when a new one arrives.
  const pending = (data?.missions || []).filter((m) => m.status.startsWith('PAUSED') && (m.attention || []).some((a) => !a.decision)).map((m) => ({ id: m.id, serial: m.serial, subject: m.subject, prompt: (m.attention || []).find((a) => !a.decision)?.prompt || '', kind: (m.attention || []).find((a) => !a.decision)?.kind || '' }));
  const seenRef = useRef(new Set());
  useEffect(() => {
    let notify = false;
    try { notify = localStorage.getItem('prajna-notify') === 'on'; } catch { /* no storage */ }
    for (const p of pending) {
      if (seenRef.current.has(p.id)) continue;
      seenRef.current.add(p.id);
      if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        try { const n = new Notification(`Decision needed · ${p.serial}`, { body: p.prompt.slice(0, 160), tag: p.id }); n.onclick = () => { window.focus(); location.href = `/run/${p.id}`; }; } catch { /* blocked */ }
      }
    }
    for (const id of [...seenRef.current]) if (!pending.some((p) => p.id === id)) seenRef.current.delete(id);
  }, [pending.map((p) => p.id).join(',')]); // eslint-disable-line

  const api = {
    ...(data || {}),
    pending,
    ready: !!data,
    locked,
    consentNeeded: !!data && (!data.consent || data.consent.version !== data.legalVersion),
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
