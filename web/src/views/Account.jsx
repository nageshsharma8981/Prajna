// Account pages: profile, dashboard, assets, personalization, language,
// subscription, invoices, settings, help.
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link, navigate } from '../lib/router.jsx';

const PAGES = [['profile', 'My Profile'], ['dashboard', 'Dashboard'], ['assets', 'My deliveries'], ['personalization', 'House style'], ['memory', 'Remembered'], ['language', 'Language'], ['subscription', 'Subscription'], ['invoices', 'Payment & Invoices'], ['settings', 'Settings'], ['help', 'Get Help']];
const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'], ['zh', '中文'], ['ar', 'العربية']];

async function patch(url, body) {
  const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Refused.');
  return j;
}

export default function Account({ page }) {
  const s = useStore();
  const [msg, setMsg] = useState(null);
  const [lim, setLim] = useState(null);
  const [hook, setHook] = useState(null);
  const [brief, setBrief] = useState(null);
  const [voice, setVoice] = useState(null);
  const [hearing, setHearing] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({});
  if (!s.ready) return <div className="page"><p role="status" style={{ color: 'var(--bone-faint)' }}>Opening account…</p></div>;
  const p = PAGES.some(([id]) => id === page) ? page : 'profile';
  const f = (k, d) => (form[k] !== undefined ? form[k] : d);
  const save = async (url, body, ok) => { setErr(null); setMsg(null); try { await patch(url, body); setMsg(ok); setForm({}); s.refresh(); } catch (e) { setErr(e.message); } };
  const w = s.workspace;
  const done = s.missions.filter((m) => m.status === 'FILLED').length;
  // Quality analytics: computed from the ledger, not asserted.
  const filled = s.missions.filter((m) => m.status === 'FILLED');
  const gated = filled.filter((m) => (m.validations || []).length);
  const firstTime = gated.filter((m) => m.validations.length === 1 && m.validations[0].gate?.cleared).length;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const patched = filled.filter((m) => (m.patches || []).length).length;
  const risks = filled.reduce((a, m) => a + (m.acceptedRisks || []).length, 0);
  const liveAuthored = filled.filter((m) => m.authored?.live).length;
  const estAcc = filled.filter((m) => m.settlement && m.contract?.estimate);
  const variance = estAcc.length ? estAcc.reduce((a, m) => a + (m.settlement.settled - m.contract.estimate) / m.contract.estimate, 0) / estAcc.length : null;
  const savedByKeys = s.missions.reduce((a, m) => a + (m.contract?.plan || []).reduce((b, p) => b + ((p.seats || []).filter((x) => x.live).length * (p.housePer || 0)), 0), 0);
  const byDesk = Object.values(s.missions.reduce((acc, m) => { const k = m.deskName; acc[k] ||= { desk: k, n: 0, done: 0, spent: 0 }; acc[k].n++; if (m.status === 'FILLED') acc[k].done++; acc[k].spent += m.spent || 0; return acc; }, {}));

  return (
    <div className="page account">
      <nav className="acct-nav" aria-label="Account">
        {PAGES.map(([id, label]) => <Link key={id} to={`/account/${id}`} className={`acct-link${p === id ? ' on' : ''}`} aria-current={p === id ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <div className="acct-body">
        {msg && <p role="status" className="soft-banner" style={{ color: 'var(--green)' }}>{msg}</p>}
        {err && <p role="alert" className="soft-banner" style={{ color: 'var(--rose)' }}>{err}</p>}

        {p === 'profile' && (
          <>
            <h1 className="pg-title">My profile</h1>
            {!(s.me?.name || '').trim() && <p className="lede">Nobody is signed in on this browser, so the house greets you by no name at all. Sign in here and the greeting, the sidebar and every record you submit will carry yours. It is kept against this browser only; sign out and the house forgets you again.</p>}
            <div className="form">
              <label>Name<input className="key-input" value={f('name', s.me?.name || '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Handle<input className="key-input" value={f('handle', s.me?.handle || '')} onChange={(e) => setForm({ ...form, handle: e.target.value })} /></label>
              <label>Email<input className="key-input" type="email" value={f('email', s.me?.email || '')} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
              <label>Bio<textarea className="key-input" rows={3} value={f('bio', s.me?.bio || '')} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
              <button className="btn-stamp attn-btn" onClick={() => save('/api/me', { name: f('name', s.me?.name || ''), handle: f('handle', s.me?.handle || ''), email: f('email', s.me?.email || ''), bio: f('bio', s.me?.bio || '') }, 'Profile saved.')}>Save profile</button>
            </div>
          </>
        )}

        {p === 'dashboard' && (
          <>
            <h1 className="pg-title">Dashboard</h1>
            {(() => {
              // What changed in the last seven days, read from the ledger.
              const since = Date.now() - 7 * 86400000;
              const recent = s.missions.filter((m) => (m.createdAt || 0) >= since);
              const delivered = recent.filter((m) => m.status === 'FILLED');
              const spent = delivered.reduce((a, m) => a + (m.settlement?.settled ?? m.spent ?? 0), 0);
              const live = delivered.filter((m) => m.authored?.live).length;
              const gatedR = delivered.filter((m) => (m.validations || []).length);
              const firstR = gatedR.filter((m) => m.validations.length === 1 && m.validations[0].gate?.cleared).length;
              const amended = recent.filter((m) => m.lineage).length;
              const notes = s.artifacts.reduce((a, x) => a + (x.notes || []).filter((n) => n.at >= since).length, 0);
              const shown = (s.showcase || []).filter((x) => x.submittedAt >= since).length;
              const desks = Object.entries(delivered.reduce((acc, m) => { acc[m.deskName] = (acc[m.deskName] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
              return (
                <div className="digest">
                  <span className="k">What changed · last 7 days</span>
                  <p>{recent.length ? <>{delivered.length} of {recent.length} missions delivered{desks.length ? <>, most on the {desks[0][0].replace(' desk', '')} desk</> : null}, {spent.toFixed(0)} credits settled. {gatedR.length ? <>{firstR} of {gatedR.length} cleared the gate first time. </> : null}{live ? <>{live} were written by a live model on your own key. </> : 'None were written by a live model, load a key to make the lead author real. '}{amended ? <>{amended} were amendments of earlier versions. </> : null}{notes ? <>{notes} note{notes === 1 ? '' : 's'} left on deliveries. </> : null}{shown ? <>{shown} submitted to the community showcase.</> : null}</> : 'No missions in the last seven days. Start one from the home composer.'}</p>
                </div>
              );
            })()}
            <div className="stat-grid">
              {[['Missions', s.missions.length], ['Delivered', done], ['Artifacts', s.artifacts.length], ['Credits left', w.credits.toFixed(0)], ['Reserved', w.reserved.toFixed(0)], ['Spent to date', w.spent.toFixed(0)]].map(([k, v]) => (
                <div key={k} className="stat"><span className="k">{k}</span><span className="v">{v}</span></div>
              ))}
            </div>
            <h2 className="h2 section-gap">Quality: from the ledger</h2>
            <div className="stat-grid">
              {[['Gate cleared first time', pct(firstTime, gated.length)], ['Patched before delivery', pct(patched, filled.length)], ['Accepted risks on record', risks], ['Live-authored', pct(liveAuthored, filled.length)], ['Estimate variance', variance == null ? '–' : `${variance >= 0 ? '+' : ''}${Math.round(variance * 100)}%`], ['Saved by your keys', `${savedByKeys.toFixed(0)} cr`]].map(([k, v]) => (
                <div key={k} className="stat"><span className="k">{k}</span><span className="v">{v}</span></div>
              ))}
            </div>
            <div className="board section-gap"><div className="board-title"><span className="brd-sm">By desk</span></div><div className="board-rows">
              {byDesk.map((d) => <div key={d.desk} className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>{d.n}</span><span className="what"><b>{d.desk}</b><span>{d.done} delivered</span></span><span className="num">{d.spent.toFixed(1)} cr</span></div>)}
              {byDesk.length === 0 && <div className="board-empty">No missions yet.</div>}
            </div></div>
            <div className="board section-gap"><div className="board-title"><span className="brd-sm">Recent missions</span></div><div className="board-rows">
              {s.missions.slice(0, 6).map((m) => <Link key={m.id} to={`/run/${m.id}`} className="board-row"><span className={`sym tint-${m.tint}`}>{m.serial}</span><span className="what"><b>{m.subject}</b><span>{m.deskName} · {m.status}</span></span><span className="num">{m.spent.toFixed(1)} cr</span></Link>)}
            </div></div>
          </>
        )}

        {p === 'assets' && (
          <>
            <h1 className="pg-title">My deliveries</h1>
            <div className="board section-gap"><div className="board-rows">
              {s.artifacts.map((a) => <Link key={a.id} to={`/artifact/${a.id}`} className="board-row"><span className={`sym tint-${a.tint}`}>{a.serial}</span><span className="what"><b>{a.title.replace(/^VOID · /, '')}</b><span>{a.kind} · v{a.version}</span></span><a className="toggle-btn" href={`/api/artifacts/${a.id}/html?download=1`} onClick={(e) => e.stopPropagation()}>Download</a></Link>)}
              {s.artifacts.length === 0 && <div className="board-empty">Nothing delivered yet.</div>}
            </div></div>
          </>
        )}

        {p === 'memory' && <MemoryPage />}

        {p === 'personalization' && (
          <>
            <h1 className="pg-title">House style</h1>
            <div className="form">
              <label>House voice<input className="key-input" value={f('tone', s.personalization.tone)} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></label>
              <label>Default lead model<select className="key-input" value={f('defaultModel', s.personalization.defaultModel)} onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}>{s.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
              <label>Default theme<select className="key-input" value={f('theme', s.personalization.theme)} onChange={(e) => setForm({ ...form, theme: e.target.value })}><option value="night">Night hall</option><option value="day">Day desk</option></select></label>
              <button className="btn-stamp attn-btn" onClick={() => save('/api/personalization', { tone: f('tone', s.personalization.tone), defaultModel: f('defaultModel', s.personalization.defaultModel), theme: f('theme', s.personalization.theme) }, 'Preferences saved.')}>Save</button>
            </div>
          </>
        )}

        {p === 'language' && (
          <>
            <h1 className="pg-title">Language</h1>
            <p className="lede">Interface language. Artifacts follow the language of your prompt.</p>
            <div className="lang-grid">{LANGS.map(([code, name]) => <button key={code} className={`lang${s.language === code ? ' on' : ''}`} onClick={() => save('/api/language', { language: code }, `Language set to ${name}.`)}>{name}<span>{code}</span></button>)}</div>
          </>
        )}

        {p === 'subscription' && (
          <>
            <h1 className="pg-title">Subscription</h1>
            <div className="digest"><span className="k">What a credit is</span><p>A house credit is the unit every ticket is priced in. The ticket states an estimate and a ceiling (estimate plus a quarter); stamping reserves the ceiling, the run settles what it actually used, and the rest is released. Nothing beyond the ceiling is spent without your decision. Models on your own keys are priced at zero, so bringing keys lowers every ticket. Every movement is on the credit ledger under Payment &amp; Invoices.</p></div>
            <p className="lede">Current plan: <b>{(s.planTiers || []).find((t) => t.id === s.plan)?.name}</b> · {w.credits.toFixed(0)} credits available.</p>
            <div className="plan-grid">
              {(s.planTiers || []).map((t) => (
                <article key={t.id} className={`plan-card${s.plan === t.id ? ' on' : ''}`}>
                  <b>{t.name}</b><span className="price">{t.price === 0 ? 'Free' : `$${t.price}/mo`}</span>
                  <p>{t.blurb}</p>
                  <ul>{t.features.map((x) => <li key={x}>{x}</li>)}</ul>
                  {s.plan === t.id ? <span className="toggle-btn on">Current</span> : <button className="btn-stamp attn-btn" onClick={() => save('/api/plan', { plan: t.id }, `Switched to ${t.name}. Demo billing: no payment collected; ${t.credits} credits granted.`)}>{t.price > (s.planTiers.find((x) => x.id === s.plan)?.price || 0) ? 'Upgrade' : 'Switch'}</button>}
                </article>
              ))}
            </div>
          </>
        )}

        {p === 'invoices' && (
          <>
            <h1 className="pg-title">Payment &amp; invoices</h1>
            <p className="lede">Payment methods and invoices. Billing is in demo mode until a payment provider is wired, nothing is charged.</p>
            <div className="board section-gap"><div className="board-title"><span className="brd-sm">Top up</span><span className="count">{w.credits.toFixed(0)} cr</span></div>
              <div className="topup">{[100, 250, 500, 1000, 2500, 5000].map((n) => <button key={n} className="toggle-btn" onClick={async () => { setErr(null); setMsg(null); const r = await fetch('/api/credits/topup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: n }) }); const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Refused.'); else setMsg(`${n} credits added, demo billing, nothing charged. Balance ${j.credits.toFixed(0)} cr.`); s.refresh(); }}>+{n}</button>)}<span className="conn-hint">Demo top-ups: an honest ledger line, no card, no charge.</span></div>
            </div>
            <div className="board section-gap"><div className="board-title"><span className="brd-sm">Credit ledger</span><span className="count">{(s.ledger || []).length}</span></div><div className="board-rows">
              {(s.ledger || []).length === 0 && <div className="board-empty">No movements yet. Stamping a ticket reserves its ceiling; closing a run settles and releases.</div>}
              {(s.ledger || []).slice(0, 40).map((l) => <div key={l.id} className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': l.delta >= 0 ? 'var(--green)' : 'var(--flap-ink)' }}>{l.kind.toUpperCase().slice(0, 3)}</span><span className="what"><b>{l.note}</b><span>{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{l.serial ? ` · ${l.serial}` : ''} · balance {l.balanceAfter.toFixed(0)} cr · reserved {l.reservedAfter.toFixed(0)} cr</span></span><span className="num">{l.delta >= 0 ? '+' : ''}{l.delta.toFixed(1)} cr</span></div>)}
            </div></div>
            <div className="board section-gap"><div className="board-title"><span className="brd-sm">Invoices</span><span className="count">{(s.invoices || []).length}</span></div><div className="board-rows">
              {(s.invoices || []).length === 0 && <div className="board-empty">No invoices yet.</div>}
              {(s.invoices || []).map((i) => <div key={i.id} className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>INV</span><span className="what"><b>{i.plan} plan</b><span>{new Date(i.at).toLocaleDateString('en-GB')} · {i.status}</span></span><span className="num">${i.amount} {i.currency}</span></div>)}
            </div></div>
          </>
        )}

        {p === 'settings' && (
          <>
            <h1 className="pg-title">Settings</h1>
            {s.owner && !s.owner.mine && (
              <p className="house-warn" role="status">This house belongs to {s.owner.name}. You can work in it, write tickets and take deliveries, but the settings below that change the house itself are theirs: keys, limits, house instructions, the address it posts to, backups, restoring and erasing.</p>
            )}
            <div className="board section-gap"><div className="board-rows">
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>KEY</span><span className="what"><b>Keys &amp; models</b><span>Bring your own keys; nothing is ever saved to disk.</span></span><Link to="/keys" className="toggle-btn">Open</Link></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>BEL</span><span className="what"><b>Browser notifications</b><span>When a run needs a decision and this tab is in the background, the browser shows a notice. Per browser, stored locally, off by default.</span></span><button className={`toggle-btn${(typeof localStorage !== 'undefined' && localStorage.getItem('prajna-notify') === 'on') ? ' on' : ''}`} onClick={async () => { if (typeof Notification === 'undefined') { setErr('This browser has no notification support.'); return; } const on = localStorage.getItem('prajna-notify') === 'on'; if (on) { localStorage.setItem('prajna-notify', 'off'); setMsg('Notifications off.'); } else { const perm = await Notification.requestPermission(); if (perm === 'granted') { localStorage.setItem('prajna-notify', 'on'); setMsg('Notifications on for this browser.'); } else setErr('The browser refused notification permission.'); } s.refresh(); }}>{(typeof localStorage !== 'undefined' && localStorage.getItem('prajna-notify') === 'on') ? 'On' : 'Off'}</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>DIG</span><span className="what"><b>Daily digest by email</b><span>The last 24 hours in plain words from the ledger, sent through your own connected Google account to {s.profile.email || 'the email on your profile'}. Every morning at 08:00 UTC while the server holds a Google token; tokens never leave memory, so a restart means reconnecting.</span></span><span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}><button className="toggle-btn" onClick={async () => { const r = await fetch('/api/digest'); const j = await r.json(); setMsg(j.text); }}>Preview</button><button className="toggle-btn" onClick={async () => { setErr(null); setMsg(null); const r = await fetch('/api/digest/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Refused.'); else setMsg(`Digest sent to ${j.to} from ${j.from}.`); }}>Send now</button><button className={`toggle-btn${s.personalization.digestEmail ? ' on' : ''}`} onClick={() => save('/api/personalization', { digestEmail: !s.personalization.digestEmail }, s.personalization.digestEmail ? 'Morning digest off.' : 'Morning digest on, sends while a Google token is in memory.')}>{s.personalization.digestEmail ? 'Every morning: on' : 'Every morning: off'}</button></span></div>
              <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>REP</span><span className="what"><b>Standing orders</b><span>Tickets that re-run themselves. Each run is a new version with its own reserve; a short balance skips the run and records why. Start one from a delivered run with Repeat.</span>
                {(s.standing || []).length === 0 && <span style={{ display: 'block', marginTop: '0.4rem' }}>None yet.</span>}
                {(s.standing || []).map((o) => <span key={o.id} style={{ display: 'block', marginTop: '0.5rem' }}><b>{o.serial}</b> · {o.goal.slice(0, 80)} · {o.cadence}{o.cap ? ` · cap ${o.cap} cr/month, ${o.spentThisMonth || 0} cr settled` : ''}{o.paused ? ' · paused' : ` · next ${new Date(o.nextAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}{o.runs?.length ? ` · last ${o.runs[0].skipped ? `skipped: ${o.runs[0].skipped}` : `ran as ${o.runs[0].serial}`}` : ''}
                  <span style={{ display: 'inline-flex', gap: '0.4rem', marginLeft: '0.6rem' }}>
                    <button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch(`/api/standing/${o.id}/run`, { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(j.run.skipped ? `Skipped: ${j.run.skipped}` : `Ran as ${j.run.serial}`); s.refresh(); }}>Run now</button>
                    <button className="toggle-btn" onClick={async () => { await fetch(`/api/standing/${o.id}/pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: !o.paused }) }); s.refresh(); }}>{o.paused ? 'Resume' : 'Pause'}</button>
                    <button className="toggle-btn" onClick={async () => { if (!window.confirm(`Stop repeating ${o.serial}? Past runs stay on the books.`)) return; await fetch(`/api/standing/${o.id}`, { method: 'DELETE' }); s.refresh(); }}>Stop</button>
                  </span></span>)}
              </span></div>
              <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>WKY</span><span className="what"><b>Weekly review</b><span>Not what happened yesterday but how the house is doing: delivered and stopped, credits settled and the middle delivery, how many cleared the gate first time, ceilings hit, who wrote the substance, standing orders, dead evidence and who came in, each set beside the week before. Sent to your address every Monday at 08:00 UTC if you have given the house one.</span></span><button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch('/api/review'); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(j.text); }}>Read it</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>EVD</span><span className="what"><b>Evidence check</b><span>Re-visits the addresses your deliveries cite, newest fifteen, and records which no longer resolve. A delivery that rests on a page that is gone should say so. {s.evidenceSweep ? `Last sweep: ${s.evidenceSweep.checked} address(es) across ${s.evidenceSweep.missions} deliveries, ${s.evidenceSweep.dead} gone.` : 'Not run yet.'}</span></span><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Re-visiting…'); const r = await fetch('/api/evidence', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); setMsg(null); return; } setMsg(j.dead ? `${j.dead} of ${j.checked} cited address(es) no longer resolve: ${j.withDead.map((m) => `${m.serial} (${m.gone.join(', ')})`).join('; ')}` : `${j.checked} cited address(es) across ${j.missions} deliveries all resolve.`); s.refresh(); }}>Run</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>CHK</span><span className="what"><b>House check</b><span>Real tests of the house: disk, tapes, artifact files, the reserve, the house rules, connected tokens, the last delivered link. Repair puts right what it can and names the rest.</span></span><span style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Checking…'); const r = await fetch('/api/housecheck', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(`${j.ok} of ${j.total} ok\n` + j.rows.map((x) => `${x.ok ? 'ok  ' : 'FAIL'} ${x.id}: ${x.detail}`).join('\n')); s.refresh(); }}>Run</button><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Repairing…'); const r = await fetch('/api/housecheck/repair', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg((j.actions.length ? j.actions.map((x) => `${x.ok ? 'done' : 'left'} ${x.id}: ${x.detail}`).join('\n') : 'Nothing to repair.') + `\n\nChecked again: ${j.check.ok} of ${j.check.total} ok\n` + j.check.rows.map((x) => `${x.ok ? 'ok  ' : 'FAIL'} ${x.id}: ${x.detail}`).join('\n')); s.refresh(); }}>Repair</button></span></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>ZIP</span><span className="what"><b>Take your data</b><span>The whole workspace as one zip: every mission with its tape, every artifact with its provenance, chats, notes, the credit ledger, media, standing orders and your consent record. Plain JSON and HTML. Keys and tokens are never in it; they live only in memory.</span></span><a className="toggle-btn" href="/api/export" download>Download</a></div>
              <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': s.openHouse && (s.consentLog || []).length > 1 ? 'var(--red)' : 'var(--flap-ink)' }}>WHO</span><span className="what"><b>Who has entered</b><span>{s.openHouse ? 'There is no access code, so anyone with the address can enter this workspace, spend its credits and read everything in it. Set PRAJNA_ACCESS_CODE where the house runs to close the door.' : 'An access code is set: only someone holding it can enter.'} Every acceptance of the house rules is recorded here, and a new person also raises the house.entered event if you have given the house an address.</span>
                {(s.consentLog || []).length === 0 && <span style={{ display: 'block', marginTop: '0.4rem' }}>Nobody has accepted the rules on this workspace yet.</span>}
                {(s.consentLog || []).map((e, i) => <span key={i} style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.72rem' }}><b>{e.name || 'unnamed'}</b> · {new Date(e.acceptedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {e.ip || 'address unknown'} · accepted {e.version}</span>)}
              </span></div>
              {(() => {
                // The narration voice for every film. Heard before it is used.
                const VOICES = [['', 'Default for the key (alloy on OpenAI, Kore on Google)'], ['alloy', 'alloy · neutral (OpenAI)'], ['ash', 'ash · low, calm (OpenAI)'], ['ballad', 'ballad · warm (OpenAI)'], ['coral', 'coral · bright (OpenAI)'], ['echo', 'echo · deep (OpenAI)'], ['fable', 'fable · British (OpenAI)'], ['nova', 'nova · clear (OpenAI)'], ['onyx', 'onyx · deep, male (OpenAI)'], ['sage', 'sage · soft (OpenAI)'], ['shimmer', 'shimmer · light (OpenAI)'], ['Kore', 'Kore · firm (Google)'], ['Puck', 'Puck · upbeat (Google)'], ['Charon', 'Charon · informative (Google)'], ['Aoede', 'Aoede · breezy (Google)'], ['Fenrir', 'Fenrir · excitable (Google)'], ['Leda', 'Leda · youthful (Google)']];
                const v = voice === null ? (s.voice || '') : voice;
                return (
                  <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>VOX</span><span className="what"><b>Narration voice</b><span>The voice every film speaks in, from each slide's presenter notes, on your speech key. Hear it before a deck spends on it.</span>
                    <select className="key-input" style={{ width: '100%', marginTop: '0.5rem', padding: '0.45rem' }} value={v} onChange={(e) => setVoice(e.target.value)} aria-label="Narration voice">{VOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                    <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.7rem' }}>{s.voice ? `In force: ${s.voice}.` : 'Nothing set: the key\'s default voice.'}{!s.keysHeld ? ' No speech key in memory, so nothing can be heard yet.' : ''}</span>
                  </span><span style={{ display: 'flex', gap: '0.4rem', flexDirection: 'column' }}>
                    <button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch('/api/voice', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: v }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setVoice(null); setMsg(j.voice ? `Narration voice set to ${j.voice}, used by the next film.` : 'Narration voice cleared, the key\'s default speaks.'); s.refresh(); }}>Save</button>
                    <button className="toggle-btn" disabled={hearing} onClick={async () => { setErr(null); setHearing(true); try { const r = await fetch('/api/voice/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: v }) }); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Refused.'); } const blob = await r.blob(); const a = new Audio(URL.createObjectURL(blob)); a.onended = () => setHearing(false); await a.play(); setMsg(`Speaking as ${r.headers.get('x-voice') || v || 'the default voice'} on ${r.headers.get('x-model') || 'your key'}. Billed to your key.`); } catch (e) { setErr(e.message); setHearing(false); } }}>{hearing ? 'Speaking…' : 'Hear it'}</button>
                  </span></div>
                );
              })()}
              {(() => {
                const text = brief === null ? (s.houseBrief || '') : brief;
                return (
                  <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>HSE</span><span className="what"><b>House instructions</b><span>Standing guidance every delivery must follow: house style, the words you do and do not use, what a reader here always needs. It is quoted to the model that writes and to the advisers who judge the draft, and never at the cost of honesty about evidence. Every ticket written while it stands records that it was in force.</span>
                    <textarea className="key-input" rows={4} maxLength={2000} style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', resize: 'vertical' }} value={text} placeholder="For example: British English. Name the customer before the product. Never claim a number without a source on the table." aria-label="House instructions" onChange={(e) => setBrief(e.target.value)} />
                    <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.7rem' }}>{text.length} of 2000 characters{s.houseBrief ? ', in force now' : ', nothing set'}.</span>
                  </span><button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch('/api/housebrief', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setBrief(null); setMsg(j.chars ? `House instructions saved, ${j.chars} characters, in force from the next ticket.` : 'House instructions cleared.'); s.refresh(); }}>Save</button></div>
                );
              })()}
              {(() => {
                const h = hook || { url: s.hooks?.url || '', secret: '' };
                const ev = s.hooks?.events || {};
                const last = (s.hooks?.log || [])[0];
                return (
                  <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>HOK</span><span className="what"><b>Tell me elsewhere</b><span>One address the house posts to when a run needs a decision, delivers, is stopped, a ticket is refused by a limit, or the daily check fails. A small JSON body. The signing secret is held in memory only, like every key here, and is gone when the server restarts.{last ? ` Last attempt: ${last.event}, ${last.ok ? `accepted (${last.status})` : `refused (${last.status || last.detail})`}, ${new Date(last.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ' Nothing sent yet.'}</span>
                    <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      <input className="key-input" style={{ minWidth: '16rem', padding: '0.35rem 0.5rem' }} value={h.url} placeholder="https://your-endpoint.example/prajna" aria-label="Webhook address" onChange={(e) => setHook({ ...h, url: e.target.value })} />
                      <input className="key-input" type="password" style={{ width: '11rem', padding: '0.35rem 0.5rem' }} value={h.secret} placeholder={s.hooks?.secretHeld ? 'secret held this session' : 'signing secret (optional)'} aria-label="Signing secret, optional" onChange={(e) => setHook({ ...h, secret: e.target.value })} />
                    </span>
                    <span style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.4rem', fontSize: '0.7rem' }}>
                      {Object.keys(ev).map((k) => <label key={k} style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}><input type="checkbox" checked={!!(hook?.events ? hook.events[k] : ev[k])} onChange={(e) => setHook({ ...h, events: { ...(hook?.events || ev), [k]: e.target.checked } })} />{k}</label>)}
                    </span>
                  </span><span style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch('/api/hooks', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: h.url, secret: h.secret || undefined, events: hook?.events }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setHook(null); setMsg(h.url ? 'Address saved.' : 'Address cleared; nothing will be sent.'); s.refresh(); }}>Save</button>
                    <button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Sending…'); const r = await fetch('/api/hooks/test', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); setMsg(null); return; } setMsg(j.ok ? `Accepted (${j.status}).` : `The endpoint refused it (${j.status || j.detail}).`); s.refresh(); }}>Send a test</button>
                  </span></div>
                );
              })()}
                            {s.owner?.mine && (
                <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>GST</span><span className="what"><b>What a guest may do</b><span>Anyone who enters this house who is not you. The door itself is the access code; this is what someone who is already inside may do. Settings, keys, limits and erasing are yours whichever you choose.</span>
                  <span style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.72rem' }}>
                    {[['work', 'Work freely: write tickets, stamp them, talk'], ['ask', 'Ask only: write tickets and talk, you stamp them'], ['read', 'Read only: the record, nothing else']].map(([m, label]) => (
                      <label key={m} style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input type="radio" name="guests" checked={(s.guests || 'work') === m} onChange={async () => { setErr(null); const r = await fetch('/api/guests', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: m }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(`Guests: ${j.means}.`); s.refresh(); }} />{label}
                      </label>
                    ))}
                  </span>
                </span></div>
              )}
{(() => {
                const l = lim || s.limits || {}; const u = s.limitUsage || {};
                const field = (k, label, hint) => <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.68rem', color: 'var(--bone-dim)' }}>{label}<input className="key-input" type="number" min="0" inputMode="numeric" style={{ width: '7rem', padding: '0.35rem 0.5rem' }} value={l[k] ?? ''} placeholder="no limit" title={hint} onChange={(e) => setLim({ ...l, [k]: e.target.value === '' ? null : e.target.value })} /></label>;
                return (
                  <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>LIM</span><span className="what"><b>House limits</b><span>Standing guardrails the house keeps on its own. A ticket that would break one is refused before anything is reserved, and a standing order run is skipped and says why. Leave a field empty for no limit.</span>
                    <span style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {field('ticketCeiling', 'Ceiling per ticket (cr)', 'No single ticket may reserve more than this.')}
                      {field('monthlySpend', 'Settled in 30 days (cr)', 'The house refuses a ticket whose ceiling would take the last 30 days past this.')}
                      {field('dailyRuns', 'Runs in 24 hours', 'How many runs may start in any 24 hours.')}
                    </span>
                    <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.7rem' }}>Now: {u.monthSpend ?? 0} cr settled in 30 days, {u.runsToday ?? 0} run{(u.runsToday ?? 0) === 1 ? '' : 's'} started today.</span>
                  </span><button className="toggle-btn" onClick={async () => { setErr(null); const r = await fetch('/api/limits', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(l) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setLim(null); setMsg('House limits saved.'); s.refresh(); }}>Save</button></div>
                );
              })()}
              <div className="board-row" style={{ cursor: 'default', alignItems: 'flex-start' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>BAK</span><span className="what"><b>Backups</b><span>The house writes its own export once a day and keeps the last seven, in the data directory. The house check fails when the latest is missing, older than 36 hours or unreadable. Restore any of them here; take your data first if you want a copy elsewhere.</span>
                {(s.backups || []).length === 0 && <span style={{ display: 'block', marginTop: '0.4rem' }}>None yet; the first is written five minutes after the house starts.</span>}
                {(s.backups || []).map((b) => <span key={b.name} style={{ display: 'block', marginTop: '0.4rem' }}>{new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {(b.bytes / 1024).toFixed(0)} KB
                  <span style={{ display: 'inline-flex', gap: '0.4rem', marginLeft: '0.6rem' }}>
                    <a className="toggle-btn" href={`/api/backups/${b.name}`} download>Download</a>
                    <button className="toggle-btn" onClick={async () => { const typed = window.prompt(`Replace this whole workspace with the backup from ${new Date(b.at).toLocaleString('en-GB')}? Type REPLACE to confirm.`); if (typed !== 'REPLACE') { setMsg('Nothing was changed.'); return; } setErr(null); setMsg('Restoring…'); const r = await fetch(`/api/backups/${b.name}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'REPLACE' }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); setMsg(null); return; } setMsg(`Restored from backup: ${j.missions} missions, ${j.artifacts} artifacts${j.interrupted ? `, ${j.interrupted} run(s) closed as interrupted` : ''}.`); await s.refresh(); }}>Restore</button>
                  </span></span>)}
              </span><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Backing up…'); const r = await fetch('/api/backup', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); setMsg(null); return; } setMsg(`Backup written: ${(j.bytes / 1024).toFixed(0)} KB, ${j.kept} kept.`); s.refresh(); }}>Back up now</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>RST</span><span className="what"><b>Restore from an export</b><span>Puts a Take-your-data zip back in whole, replacing this workspace: missions with their tapes, artifacts, chats, notes, ledger, media, standing orders. Runs that were live when the export was taken close as interrupted. Keys and tokens are not in an export; load them again after.</span></span><span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}><input type="file" accept=".zip,application/zip" aria-label="Export zip" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} style={{ maxWidth: '12rem', fontSize: '0.72rem' }} /><button className="toggle-btn" disabled={!restoreFile} onClick={async () => { const typed = window.prompt(`Replace this whole workspace with ${restoreFile.name}? Type REPLACE to confirm.`); if (typed !== 'REPLACE') { setMsg('Nothing was changed.'); return; } setErr(null); setMsg('Restoring…'); const r = await fetch('/api/import?confirm=REPLACE', { method: 'POST', headers: { 'content-type': 'application/zip' }, body: restoreFile }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); setMsg(null); return; } setMsg(`Restored: ${j.missions} missions, ${j.artifacts} artifacts, ${j.chats} chats, ${j.files} files${j.interrupted ? `, ${j.interrupted} run(s) closed as interrupted` : ''}.`); await s.refresh(); }}>Restore</button></span></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--red)' }}>DEL</span><span className="what"><b>Erase this workspace</b><span>Removes every mission, artifact, chat, note, media file and profile field, stops any live run, and seeds a fresh house. Only the version and time of your acceptance of the house rules remain, as proof. Take your data first; this cannot be undone.</span></span><button className="toggle-btn" onClick={async () => { const typed = window.prompt('This erases the whole workspace and cannot be undone. Type ERASE to confirm.'); if (typed !== 'ERASE') { setMsg('Nothing was removed.'); return; } setErr(null); const r = await fetch('/api/erase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ERASE' }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(`Erased: ${j.removed.missions} missions, ${j.removed.artifacts} artifacts, ${j.removed.chats} chats, ${j.removed.media} media. A fresh house is seeded.`); await s.refresh(); navigate('/'); }}>Erase</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>STA</span><span className="what"><b>Status page</b><span>Public, never secret: uptime, live and paused runs, last delivery, data directory health. Machine-readable at /api/health.</span></span><a className="toggle-btn" href="/status" target="_blank" rel="noreferrer">Open</a></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>THM</span><span className="what"><b>Theme</b><span>Night hall or day desk, the toggle is at the top right.</span></span></div>
            </div></div>
          </>
        )}

        {p === 'help' && (
          <>
            <h1 className="pg-title">Get help</h1>
            <section className="limits" aria-label="What the house can and cannot do yet">
              <h2 className="h2">What the house can and cannot do yet</h2>
              <p className="sub">One honest list. Everything else in the interface says the same thing in its own place.</p>
              <div className="limits-grid">
                <div><span className="k">Does</span><ul>
                  <li>Writes a contract before anything runs: plan, estimate, ceiling, assertions, and why.</li>
                  <li>Runs website, mobile, deck, research and analysis missions with every step, cost and panel position on the tape.</li>
                  <li>With your own key, the lead model writes the substance; advisers critique it; figures must trace to a source.</li>
                  <li>Retrieves real sources (encyclopedia; the live web with a Brave key) and reads your text attachments as evidence.</li>
                  <li>Gates every delivery with two validator lanes, brings decisions to you with a justification on the record, and settles credits against the estimate.</li>
                  <li>Delivers artifacts with provenance, notes, versions, comparisons, public share links and a full audit bundle.</li>
                  <li>Streams chat, starts missions from conversation, and answers questions about a run from its record.</li>
                </ul></div>
                <div><span className="k">Does not, yet</span><ul>
                  <li>Without a key the house forms no judgement, and says so: a research brief with real sources on the table is composed by quoting them, each claim carrying its address and the date it was read, and an analysis with your file attached is computed from your own rows. Decks, sites and apps remain house-scripted sample material, labelled, never hidden.</li>
                  <li>Charts plot sample series unless you attach a CSV to an analysis mission; data connectors (Sheets, Stripe) are not wired yet.</li>
                  <li>Video generation on hosted models is not wired; images are, on your OpenAI or Google key.</li>
                  <li>Billing is demo: top-ups and plans are ledger lines, nothing is charged.</li>
                  <li>One workspace per house: the access code opens it; there are no separate user accounts.</li>
                  <li>Keys and OAuth tokens live in memory only, so a restart means loading them again.</li>
                  <li>Connectors beyond Google, Slack, Notion and GitHub are catalogue entries, not live integrations.</li>
                </ul></div>
              </div>
            </section>
            <div className="board section-gap"><div className="board-rows">
              {[['The house rules', 'Terms and Conditions, Privacy and GDPR Policy, AI Disclaimer.', '/legal/terms'], ['Release notes', 'Every version the house has shipped, newest first.', '/releases'], ['First-run welcome', 'The three steps and the one-minute sample, again.', '/?welcome=1'], ['How missions work', 'State an outcome → the house writes a ticket → it runs in the open → a validated artifact is delivered.', '/missions'], ['Bring your own keys', 'Load a provider key to make panel models live. Keys are never saved.', '/keys'], ['Connect apps', 'Register a provider OAuth app, then Connect from the catalog.', '/connectors'], ['Docket', 'See every ticket on a board and each plan as a task map.', '/boards']].map(([t, d, to]) => (
                <Link key={t} to={to} className="board-row"><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>?</span><span className="what"><b>{t}</b><span>{d}</span></span></Link>
              ))}
            </div></div>
            <p className="conn-note" style={{ padding: '0.8rem 0' }}>Support: open an issue at <a href="https://github.com/nageshsharma8981/Prajna/issues" target="_blank" rel="noreferrer">github.com/nageshsharma8981/Prajna</a>.</p>
          </>
        )}
      </div>
    </div>
  );
}

// What the house remembers about this person, for this person: what they
// told it, which goes to the author of every delivery they ask for, and what
// it has noticed on its own record. Theirs alone; any of it can be forgotten.
function MemoryPage() {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const load = async () => { try { const r = await fetch('/api/memories'); setData(await r.json()); } catch { setData({ memories: [], noticed: [], signedIn: false }); } };
  useEffect(() => { load(); }, []);
  const add = async () => {
    setErr(null);
    const r = await fetch('/api/memories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'Refused.'); return; }
    setText(''); setData((d) => ({ ...d, memories: j.memories }));
  };
  const del = async (id) => { const r = await fetch(`/api/memories/${id}`, { method: 'DELETE' }); const j = await r.json().catch(() => ({})); if (r.ok) setData((d) => ({ ...d, memories: j.memories })); };
  const all = async () => { if (!window.confirm('Forget everything you told the house?')) return; await fetch('/api/memories', { method: 'DELETE' }); load(); };
  const faint = { color: 'var(--bone-faint)' };
  return (
    <>
      <h1 className="pg-title">Remembered</h1>
      <p style={faint}>What you tell the house here goes to the author of every delivery you ask for, as “about the person asking”. It is yours alone: nobody else in the house can read it, the owner included; it is never a key; and you can forget any of it.</p>
      <div className="form">
        <label>Tell the house something to remember<input className="key-input" value={text} maxLength={240} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="e.g. I write for a pharma R&D audience; British spelling; never say leverage" /></label>
        <button className="btn-stamp attn-btn" onClick={add} disabled={!text.trim()}>Remember this</button>
        {err && <p role="alert" style={{ color: 'var(--rose)' }}>{err}</p>}
      </div>
      <h2 style={{ fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '1.6rem' }}>What you told the house</h2>
      {data && data.memories.length ? (
        <ul className="memory-list" aria-label="Memories">{data.memories.map((m) => <li key={m.id}><span>{m.text}</span><small style={faint}>{new Date(m.at).toLocaleDateString('en-GB')}</small><button className="btn-quiet" style={{ padding: '0.3rem 0.7rem' }} onClick={() => del(m.id)} aria-label={`Forget: ${m.text}`}>Forget</button></li>)}</ul>
      ) : <p style={faint}>{data && !data.signedIn ? 'Sign in with a name under My Profile first; a memory belongs to the person who leaves it.' : 'Nothing yet.'}</p>}
      {data && data.memories.length > 0 && <button className="btn-quiet" style={{ padding: '0.4rem 0.8rem' }} onClick={all}>Forget everything</button>}
      <h2 style={{ fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '1.6rem' }}>What the house has noticed</h2>
      {data && data.noticed.length ? <ul className="memory-list" aria-label="Noticed">{data.noticed.map((n, i) => <li key={i}><span>{n}</span></li>)}</ul> : <p style={faint}>Nothing yet; this fills in from your own asks, and is never stored.</p>}
    </>
  );
}
