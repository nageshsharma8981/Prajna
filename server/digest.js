// The daily digest: what the house did, in plain words, from the ledger,
// and the means to send it through the owner's own connected Gmail. No
// token in memory, no send; the route says so rather than pretending.
import { store } from './store.js';
import { ws } from './workspace.js';
import { missionDelta } from './delta.js';

const n = (x) => Number(x || 0).toFixed(0);

export function digestText({ days = 1 } = {}) {
  const since = Date.now() - days * 86400000;
  const ms = store.missions();
  const recent = ms.filter((m) => (m.launchedAt || m.createdAt || 0) >= since);
  const delivered = recent.filter((m) => m.status === 'FILLED');
  const stopped = recent.filter((m) => m.status === 'KILLED' && !m.voidedBeforeRun);
  const pending = ms.filter((m) => m.status.startsWith('PAUSED') && (m.attention || []).some((a) => !a.decision));
  const settled = delivered.reduce((a, m) => a + (m.settlement?.settled ?? m.spent ?? 0), 0);
  const live = delivered.filter((m) => m.authored?.live).length;
  const gated = delivered.filter((m) => (m.validations || []).length);
  const first = gated.filter((m) => m.validations.length === 1 && m.validations[0].gate?.cleared).length;
  const incidents = recent.filter((m) => (m.retrieval && m.retrieval.ok === false) || (m.authored && m.authored.live === false));
  const w = store.workspace();
  const lines = [];
  lines.push(`Prajñā digest: the last ${days === 1 ? '24 hours' : `${days} days`}`);
  lines.push('');
  lines.push(recent.length ? `${recent.length} mission${recent.length === 1 ? '' : 's'} started, ${delivered.length} delivered, ${stopped.length} stopped. ${n(settled)} credits settled.` : 'No missions started.');
  if (gated.length) lines.push(`${first} of ${gated.length} cleared the gate first time; ${live} ${live === 1 ? 'was' : 'were'} written by a live model on your own key.`);
  if (pending.length) lines.push(`${pending.length} run${pending.length === 1 ? ' is' : 's are'} waiting on a decision: ${pending.map((m) => `${m.serial} (${(m.attention || []).find((a) => !a.decision)?.kind})`).join(', ')}.`);
  if (incidents.length) lines.push(`${incidents.length} incident${incidents.length === 1 ? '' : 's'} recorded: ${incidents.map((m) => `${m.serial}, ${m.retrieval && m.retrieval.ok === false ? `retrieval failed (${m.retrieval.error})` : `live model could not author (${m.authored.error})`}`).join('; ')}.`);
  lines.push('');
  if (delivered.length) { lines.push('Delivered:'); for (const m of delivered.slice(0, 12)) { const d = m.lineage ? missionDelta(m) : null; const since = d ? [d.lines.find((l) => l.startsWith('Settled')), d.lines.find((l) => /source/.test(l))].filter(Boolean).map((l) => l.replace(/\.$/, '').replace(/^Settled [\d.]+ cr against [\d.]+ cr last time, /, '')).join('; ') : ''; lines.push(`  • ${m.serial}, ${m.subject || m.goal} (${m.deskName.replace(' desk', '')}, ${n(m.settlement?.settled ?? m.spent)} cr)${d ? ` · v${d.version} of ${d.parent.serial}${since ? `: ${since}` : ''}` : ''}`); } lines.push(''); }
  lines.push(`Balance ${n(w.credits)} credits, ${n(w.reserved)} reserved, ${n(w.spent)} spent to date.`);
  const runs = (ws().standingOrders || []).flatMap((o) => (o.runs || []).filter((r) => r.at >= since).map((r) => ({ ...r, order: o.serial })));
  if (runs.length) { const ran = runs.filter((r) => !r.skipped), skipped = runs.filter((r) => r.skipped); lines.push(`Standing orders: ${ran.length} ran${ran.length ? ` (${ran.map((r) => r.serial).join(', ')})` : ''}, ${skipped.length} skipped${skipped.length ? ` (${skipped.map((r) => `${r.order}: ${r.skipped}`).join('; ')})` : ''}.`); }
  const entered = (ws().consentLog || []).filter((e) => e.acceptedAt >= since);
  if (entered.length) lines.push(`${entered.length} acceptance${entered.length === 1 ? '' : 's'} of the house rules: ${entered.map((e) => `${e.name || 'someone unnamed'} from ${e.ip || 'an unknown address'}`).join('; ')}.`);
  const hc = ws().lastHouseCheck;
  if (hc) lines.push(hc.failed?.length ? `House check: ${hc.failed.length} problem${hc.failed.length === 1 ? '' : 's'} found. ${hc.failed.map((f) => `${f.id}: ${f.detail}`).join('; ')}. Open Settings for the full result.` : `House check: ${hc.ok} of ${hc.total} ok at ${new Date(hc.at).toISOString().replace('T', ' ').slice(0, 16)} UTC.`);
  lines.push('');
  lines.push('Every line above comes from the mission ledger. Open the workspace for the tape, the decisions and the deliveries.');
  return lines.join('\n');
}

function b64url(s) { return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// Send through the owner's connected Gmail (gmail.send scope). The token is
// memory-only; a restart means reconnecting before the next send.
export async function sendMail({ to, subject, text, base = 'https://gmail.googleapis.com' }) {
  const tok = store.token('google');
  if (!tok || !tok.token) throw new Error('No Google account connected in this session, connect Google under Connectors first.');
  const from = tok.account?.email || 'me';
  const raw = b64url([`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n'));
  const r = await fetch(`${base.replace(/\/$/, '')}/gmail/v1/users/me/messages/send`, { method: 'POST', headers: { authorization: `Bearer ${tok.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gmail ${r.status}`);
  return { id: j.id || null, to, from };
}

// Once a day at 08:00 UTC, when the owner opted in and a token is in memory.
let lastSentDay = null;
export function scheduleDigest() {
  setInterval(async () => {
    try {
      const w = ws();
      if (!w.personalization?.digestEmail || !w.profile?.email) return;
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      if (now.getUTCHours() !== 8 || lastSentDay === day) return;
      lastSentDay = day;
      const r = await sendMail({ to: w.profile.email, subject: `Prajñā digest: ${day}`, text: digestText({ days: 1 }) });
      console.log(`prajna: digest sent to ${r.to}`);
    } catch (e) { console.error('prajna: digest not sent,', e.message); }
  }, 10 * 60 * 1000).unref();
}
