// Account pages: profile, dashboard, assets, personalization, language,
// subscription, invoices, settings, help.
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Link, navigate } from '../lib/router.jsx';

const PAGES = [['profile', 'My Profile'], ['dashboard', 'Dashboard'], ['assets', 'My Assets'], ['personalization', 'Personalization'], ['language', 'Language'], ['subscription', 'Subscription'], ['invoices', 'Payment & Invoices'], ['settings', 'Settings'], ['help', 'Get Help']];
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
            {!(s.profile.name || '').trim() && <p className="lede">The house does not know your name yet. Add it here and the greeting, the sidebar and every record you submit will carry it.</p>}
            <div className="form">
              <label>Name<input className="key-input" value={f('name', s.profile.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Handle<input className="key-input" value={f('handle', s.profile.handle)} onChange={(e) => setForm({ ...form, handle: e.target.value })} /></label>
              <label>Email<input className="key-input" type="email" value={f('email', s.profile.email)} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
              <label>Bio<textarea className="key-input" rows={3} value={f('bio', s.profile.bio)} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
              <button className="btn-stamp attn-btn" onClick={() => save('/api/profile', { name: f('name', s.profile.name), handle: f('handle', s.profile.handle), email: f('email', s.profile.email), bio: f('bio', s.profile.bio) }, 'Profile saved.')}>Save profile</button>
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
            <h1 className="pg-title">My assets</h1>
            <div className="board section-gap"><div className="board-rows">
              {s.artifacts.map((a) => <Link key={a.id} to={`/artifact/${a.id}`} className="board-row"><span className={`sym tint-${a.tint}`}>{a.serial}</span><span className="what"><b>{a.title.replace(/^VOID · /, '')}</b><span>{a.kind} · v{a.version}</span></span><a className="toggle-btn" href={`/api/artifacts/${a.id}/html?download=1`} onClick={(e) => e.stopPropagation()}>Download</a></Link>)}
              {s.artifacts.length === 0 && <div className="board-empty">Nothing delivered yet.</div>}
            </div></div>
          </>
        )}

        {p === 'personalization' && (
          <>
            <h1 className="pg-title">Personalization</h1>
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
            <div className="board section-gap"><div className="board-rows">
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>KEY</span><span className="what"><b>Keys &amp; models</b><span>Bring your own keys; nothing is ever saved to disk.</span></span><Link to="/keys" className="toggle-btn">Open</Link></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>EXP</span><span className="what"><b>Export your data</b><span>Every mission and artifact, as JSON and HTML.</span></span><a className="toggle-btn" href="/api/bootstrap" target="_blank" rel="noreferrer">Export</a></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>BEL</span><span className="what"><b>Browser notifications</b><span>When a run needs a decision and this tab is in the background, the browser shows a notice. Per browser, stored locally, off by default.</span></span><button className={`toggle-btn${(typeof localStorage !== 'undefined' && localStorage.getItem('prajna-notify') === 'on') ? ' on' : ''}`} onClick={async () => { if (typeof Notification === 'undefined') { setErr('This browser has no notification support.'); return; } const on = localStorage.getItem('prajna-notify') === 'on'; if (on) { localStorage.setItem('prajna-notify', 'off'); setMsg('Notifications off.'); } else { const perm = await Notification.requestPermission(); if (perm === 'granted') { localStorage.setItem('prajna-notify', 'on'); setMsg('Notifications on for this browser.'); } else setErr('The browser refused notification permission.'); } s.refresh(); }}>{(typeof localStorage !== 'undefined' && localStorage.getItem('prajna-notify') === 'on') ? 'On' : 'Off'}</button></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>DIG</span><span className="what"><b>Daily digest by email</b><span>The last 24 hours in plain words from the ledger, sent through your own connected Google account to {s.profile.email || 'the email on your profile'}. Every morning at 08:00 UTC while the server holds a Google token; tokens never leave memory, so a restart means reconnecting.</span></span><span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}><button className="toggle-btn" onClick={async () => { const r = await fetch('/api/digest'); const j = await r.json(); setMsg(j.text); }}>Preview</button><button className="toggle-btn" onClick={async () => { setErr(null); setMsg(null); const r = await fetch('/api/digest/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Refused.'); else setMsg(`Digest sent to ${j.to} from ${j.from}.`); }}>Send now</button><button className={`toggle-btn${s.personalization.digestEmail ? ' on' : ''}`} onClick={() => save('/api/personalization', { digestEmail: !s.personalization.digestEmail }, s.personalization.digestEmail ? 'Morning digest off.' : 'Morning digest on, sends while a Google token is in memory.')}>{s.personalization.digestEmail ? 'Every morning: on' : 'Every morning: off'}</button></span></div>
              <div className="board-row" style={{ cursor: 'default' }}><span className="sym" style={{ '--tint': 'var(--flap-ink)' }}>CHK</span><span className="what"><b>House check</b><span>Real tests of the house: disk, tapes, artifact files, the reserve, the house rules, connected tokens, the last delivered link. Repair puts right what it can and names the rest.</span></span><span style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Checking…'); const r = await fetch('/api/housecheck', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg(`${j.ok} of ${j.total} ok\n` + j.rows.map((x) => `${x.ok ? 'ok  ' : 'FAIL'} ${x.id}: ${x.detail}`).join('\n')); s.refresh(); }}>Run</button><button className="toggle-btn" onClick={async () => { setErr(null); setMsg('Repairing…'); const r = await fetch('/api/housecheck/repair', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Refused.'); return; } setMsg((j.actions.length ? j.actions.map((x) => `${x.ok ? 'done' : 'left'} ${x.id}: ${x.detail}`).join('\n') : 'Nothing to repair.') + `\n\nChecked again: ${j.check.ok} of ${j.check.total} ok\n` + j.check.rows.map((x) => `${x.ok ? 'ok  ' : 'FAIL'} ${x.id}: ${x.detail}`).join('\n')); s.refresh(); }}>Repair</button></span></div>
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
                  <li>Without a key, the substance of every delivery is house-scripted sample material, labelled, never hidden.</li>
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
              {[['The house rules', 'Terms and Conditions, Privacy and GDPR Policy, AI Disclaimer.', '/legal/terms'], ['Release notes', 'Every version the house has shipped, newest first.', '/releases'], ['First-run welcome', 'The three steps and the one-minute sample, again.', '/?welcome=1'], ['How missions work', 'State an outcome → the house writes a ticket → it runs in the open → a validated artifact is delivered.', '/missions'], ['Bring your own keys', 'Load a provider key to make panel models live. Keys are never saved.', '/keys'], ['Connect apps', 'Register a provider OAuth app, then Connect from the catalog.', '/connectors'], ['Boards', 'See every mission on a Kanban and each plan as a task map.', '/boards']].map(([t, d, to]) => (
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
