// The credit ledger: every movement of house credits, in order, with the
// balance after it. Reserves on stamping, settlements and releases on
// closing, grants, top-ups — each one a line an owner can read back.
import { store } from './store.js';
import { ws, flushWs } from './workspace.js';

export function record(kind, delta, note, extra = {}) {
  const w = ws();
  if (!Array.isArray(w.ledger)) w.ledger = [];
  const entry = { id: `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind, delta: Math.round(delta * 10) / 10, balanceAfter: Math.round(store.workspace().credits * 10) / 10, reservedAfter: Math.round((store.workspace().reserved || 0) * 10) / 10, note, ...extra };
  w.ledger.unshift(entry);
  if (w.ledger.length > 500) w.ledger.length = 500;
  flushWs();
  return entry;
}
