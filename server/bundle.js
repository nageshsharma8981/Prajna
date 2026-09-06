import { missionDelta } from './delta.js';
// The audit bundle: one self-contained HTML file that carries a mission's
// whole record, contract, tape, decisions, validation, sources, settlement,
// the delivered artifact (embedded, sandboxed) and the machine-readable
// mission record, so a delivery can be handed over with its evidence.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const when = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '–');

// The replay: what a reader who was not in the room needs first. The ask,
// then the three phases in one line each (what was planned and for how
// much, what was built and by whom, what came out and whether it passed),
// the delivery one click away, a way to make their own from the same brief,
// and the tape as a player that walks the moves one at a time. The audit
// tables follow for the reader who wants the evidence itself.
const DESK_MODE = { brief: 'research', deck: 'deck', site: 'website', mobile: 'mobile', analysis: 'analysis' };
function replay(m, artifact, { publicUrl = '', artifactPath = null } = {}) {
  const plan = m.contract.plan || [];
  const events = m.events || [];
  const lastVal = (m.validations || []).at(-1);
  const rows = (lastVal?.rows || []).filter((r) => r.lane === 'scrutiny');
  const passed = rows.filter((r) => r.passed).length;
  const live = events.filter((e) => e.live === true).length, scripted = events.filter((e) => e.live === false).length;
  const pics = (m.visuals || []).length, clips = (m.narration || []).length;
  const who = m.authored?.live ? `the substance by ${m.authored.model} on the owner's key` : m.authored?.composed ? 'the substance quoted from the sources, no model loaded' : 'scripted by the house';
  const fork = `${publicUrl}/?desk=${encodeURIComponent(DESK_MODE[m.desk] || 'chat')}&brief=${encodeURIComponent(String(m.goal || '').slice(0, 600))}`;
  const open = artifactPath || (artifact ? '#delivery' : null);
  return `<section class="replay" aria-label="Replay">
<p class="eyebrow">Prajñā replay · ${esc(m.deskName || m.desk)} · ${esc(m.serial)}${m.look ? ` · one look: ${esc(m.look.mood)}` : ''}</p>
<h1 class="ask">${esc(m.goal)}</h1>
<div class="phases">
<div class="phase"><span>1 · Plan</span><b>${plan.length} steps, ${m.contract.estimate} cr estimated, ceiling ${m.contract.ceiling}</b><p>${esc(m.contract.why || 'The contract was stamped before anything was spent.')}</p></div>
<div class="phase"><span>2 · Build</span><b>${events.length} moves on the tape, ${live} live, ${scripted} scripted</b><p>${esc(who)}${pics ? `; ${pics} picture${pics === 1 ? '' : 's'} drawn` : ''}${clips ? `; ${clips} clips spoken` : ''}${(m.critiques || []).length ? `; ${m.critiques.length} adviser critique${m.critiques.length === 1 ? '' : 's'}` : ''}${m.dissent ? `; dissent recorded from ${esc(m.dissent.model)}` : ''}.</p></div>
<div class="phase"><span>3 · Result</span><b>${rows.length ? `${passed} of ${rows.length} assertions passed` : 'no gate rows kept'}, ${Number(m.spent || 0).toFixed(1)} cr settled</b><p>${artifact ? `${esc(artifact.title)}, v${artifact.version}${m.partial ? ', partial' : ''}` : 'No delivery was made.'}</p></div>
</div>
<div class="acts">${open ? `<a class="btn" href="${esc(open)}">Open the delivery</a>` : ''}<a class="btn alt" href="${esc(fork)}">Make your own from this brief</a><a class="btn alt" href="#tape">Replay the tape</a></div>
<div class="player" id="tape" role="region" aria-label="Tape player"><button type="button" class="p-prev" aria-label="Previous move">‹</button><span class="p-count">1 / ${events.length}</span><button type="button" class="p-next" aria-label="Next move">›</button><button type="button" class="p-play">Play</button><p class="p-line"></p></div>
</section>`;
}
function replayScript() {
  const rec = JSON.parse(document.getElementById('prajna-bundle').textContent);
  const ev = rec.mission.events || []; const box = document.getElementById('tape'); if (!box || !ev.length) return;
  const count = box.querySelector('.p-count'), line = box.querySelector('.p-line'), play = box.querySelector('.p-play');
  let i = 0, timer = null;
  const plan = rec.mission.contract.plan || [];
  const text = (e) => e.detail || e.text || e.note || e.prompt || (e.type === 'step.status' ? ((plan.find((p) => p.id === e.stepId) || {}).title || e.stepId) + ' → ' + e.status : '') || (e.type === 'cost' ? '+' + e.delta + ' → ' + e.total + ' cr' : '') || e.type;
  const show = () => { const e = ev[i]; count.textContent = (i + 1) + ' / ' + ev.length; line.innerHTML = '<code>' + e.type + (e.label ? ' · ' + e.label : '') + '</code>' + (e.live === true ? ' <span class="live">live</span>' : e.live === false ? ' <span class="scripted">scripted</span>' : '') + ' ' + String(text(e)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; play.textContent = 'Play'; };
  box.querySelector('.p-prev').addEventListener('click', () => { stop(); i = (i - 1 + ev.length) % ev.length; show(); });
  box.querySelector('.p-next').addEventListener('click', () => { stop(); i = (i + 1) % ev.length; show(); });
  play.addEventListener('click', () => { if (timer) return stop(); play.textContent = 'Pause'; timer = setInterval(() => { i += 1; if (i >= ev.length) { i = ev.length - 1; show(); return stop(); } show(); }, 900); });
  show();
}

export function auditBundle(mission, artifact, artifactHtml, opts = {}) {
  const m = mission;
  const plan = m.contract.plan || [];
  const events = m.events || [];
  const decisions = (m.attention || []).filter((a) => a.decision);
  const lastVal = (m.validations || []).at(-1);
  const record = { schema: 'prajna.bundle.v1', exportedAt: Date.now(), mission: { ...m, runScript: undefined, deferredCost: undefined }, artifact: artifact || null };
  const eventRow = (e) => {
    const what = e.detail || e.text || e.note || e.prompt || (e.type === 'step.status' ? `${plan.find((p) => p.id === e.stepId)?.title || e.stepId} → ${e.status}` : '') || (e.type === 'cost' ? `+${e.delta} → ${e.total} cr` : '') || (e.type === 'gate' ? `${e.cleared ? 'cleared' : 'NOT cleared'}` : '') || '';
    return `<tr><td>${e.seq ?? ''}</td><td>${when(e.at)}</td><td><code>${esc(e.type)}${e.label ? ` · ${esc(e.label)}` : ''}</code>${e.live === true ? ' <span class="live">live</span>' : e.live === false ? ' <span class="scripted">scripted</span>' : ''}</td><td>${esc(what)}</td></tr>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.serial)}, audit bundle</title>
<style>
:root{--ink:#14140f;--paper:#f6f4ee;--acc:#8a4b13;--rule:#d9d4c8;--good:#1d5c3a;--bad:#a12e2e}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,'Segoe UI',system-ui,sans-serif}
.wrap{max-width:70rem;margin:0 auto;padding:2.5rem 1.5rem 5rem}
h1{font-size:1.7rem;margin:0 0 .2rem}h2{font-size:.82rem;letter-spacing:.16em;text-transform:uppercase;color:var(--acc);margin:2.4rem 0 .7rem;padding-top:1rem;border-top:1px solid var(--rule)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.6rem 1.4rem;margin:1rem 0}.kv div{background:#fff;border:1px solid var(--rule);padding:.6rem .8rem;border-radius:6px}.kv span{display:block;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#777}.kv b{font-size:1rem}
table{width:100%;border-collapse:collapse;font-size:.84rem;background:#fff}th{text-align:left;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#777;border-bottom:2px solid var(--ink);padding:.4rem .5rem}td{border-bottom:1px solid var(--rule);padding:.4rem .5rem;vertical-align:top}code{font-size:.78rem}
.live{color:var(--good);font-weight:700;font-size:.7rem}.scripted{color:#777;font-size:.7rem}.ok{color:var(--good);font-weight:700}.no{color:var(--bad);font-weight:700}
iframe{width:100%;height:80vh;border:1px solid var(--rule);background:#fff;border-radius:6px}
details summary{cursor:pointer;font-weight:700}
.note{font-size:.8rem;color:#666}
.replay{background:var(--ink);color:#f3efe4;margin:-2.5rem -1.5rem 2.5rem;padding:2.6rem 1.5rem 2rem}
.replay .eyebrow{margin:0 0 .6rem;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#d9b45a}
.replay .ask{font-size:clamp(1.5rem,3.2vw,2.4rem);line-height:1.15;margin:0 0 1.4rem;max-width:32ch;color:#fff}
.phases{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.8rem;margin:0 0 1.4rem}
.phase{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.9rem 1rem}
.phase span{display:block;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#d9b45a;margin-bottom:.35rem}.phase b{display:block;color:#fff;margin-bottom:.3rem}.phase p{margin:0;font-size:.84rem;color:#cfc9ba}
.acts{display:flex;flex-wrap:wrap;gap:.6rem;margin:0 0 1.2rem}
.btn{display:inline-block;background:#d9b45a;color:#14140f;font-weight:700;text-decoration:none;padding:.6rem 1rem;border-radius:6px;min-height:44px;line-height:1.6}.btn.alt{background:transparent;color:#f3efe4;border:1px solid rgba(255,255,255,.35)}.btn:hover{filter:brightness(1.08)}
.player{display:grid;grid-template-columns:auto auto auto auto 1fr;gap:.5rem;align-items:center;background:rgba(0,0,0,.35);border-radius:8px;padding:.6rem .8rem;font-size:.84rem}
.player button{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:4px;min-width:2.2rem;min-height:2.2rem;cursor:pointer;font:inherit}.player .p-count{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#d9b45a}
.player .p-line{grid-column:1/-1;margin:.3rem 0 0;color:#e9e4d6;min-height:1.4em}.player code{color:#d9b45a}.player .live{color:#8fd19e}.player .scripted{color:#aaa}
@media(max-width:600px){.replay{margin:-2.5rem -1.5rem 2rem}}
</style></head><body><div class="wrap">
${replay(m, artifact, opts)}
<h1>${esc(m.serial)} · ${esc(m.subject || m.goal)}</h1>
<p class="note">Prajñā audit bundle · exported ${when(record.exportedAt)} · ${esc(m.deskName)} · status ${esc(m.status)}${m.partial ? ' · PARTIAL' : ''}${m.voided ? ' · VOIDED' : ''}. Everything below is the record as kept by the house; the machine-readable copy is at the end.</p>
<div class="kv">
<div><span>Goal</span><b>${esc(m.goal)}</b></div>
<div><span>Bench</span><b>${esc((m.councilNames || []).join(' · '))}</b></div>
<div><span>Mode</span><b>${m.authored?.live ? `live, substance by ${esc(m.authored.model)}` : (m.seats || []).some((s) => s.live) ? 'hybrid' : 'scripted'}</b></div>
<div><span>Estimate / ceiling / settled</span><b>${m.contract.estimate} / ${m.contract.ceiling} / ${Number(m.spent || 0).toFixed(1)} cr</b></div>
<div><span>Launched → finished</span><b>${when(m.launchedAt)} → ${when(m.filledAt)}</b></div>
<div><span>Lineage</span><b>${m.lineage ? `v${m.lineage.version}, supersedes ${esc(m.lineage.parentSerial)}` : 'v1'}</b></div>
</div>

${m.narrative ? `<h2>In plain words</h2><p>${esc(m.narrative)}</p>` : ''}
${(() => { const d = missionDelta(m); return d && d.lines.length ? `<h2>Since v${d.parent.version}, ${esc(d.parent.serial)}, this ${d.reason}</h2><ul>${d.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''; })()}
<h2>Contract</h2>
${m.contract.why ? `<p>${esc(m.contract.why)}</p>` : ''}
<table><thead><tr><th>#</th><th>Step</th><th>Tool</th><th>Access</th><th>Cost</th><th>Status</th><th>Why</th></tr></thead><tbody>
${plan.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.title)}</td><td><code>${esc(p.tool)}</code></td><td>${esc(p.access)}${p.requiresConfirmation ? ' · approval' : ''}</td><td>${p.cost} cr${(p.seats || []).length ? `<br><small>${p.seats.map((s) => `${esc(s.name)} ${s.live ? '0 cr (own key)' : `${s.cost} cr`}`).join(' · ')}</small>` : ''}</td><td>${esc(p.status)}</td><td class="note">${esc(p.rationale || '')}</td></tr>`).join('')}
</tbody></table>
${m.contract.edited ? `<p class="note">Plan edited before stamping: ${m.contract.edited.edits} edit(s), ${m.contract.edited.added} added, ${m.contract.edited.removed} removed.</p>` : ''}

<h2>Definition of done</h2>
<table><thead><tr><th>Assertion</th><th>Owner</th><th>Status</th><th>Scrutiny</th><th>Surface</th></tr></thead><tbody>
${(m.contract.assertions || []).map((a) => { const sc = lastVal?.rows?.find((r) => r.id === a.id && r.lane === 'scrutiny'); const su = lastVal?.rows?.find((r) => r.id === a.id && r.lane === 'surface'); const cell = (r) => (r ? `<span class="${r.passed ? 'ok' : 'no'}">${r.passed ? 'pass' : 'fail'}</span>${r.detail ? ` <small>${esc(r.detail)}</small>` : ''}` : '–'); return `<tr><td><code>${esc(a.id)}</code><br>${esc(a.title)}</td><td>${esc(plan.find((p) => p.id === a.owner)?.title || a.owner)}</td><td>${esc(a.status)}</td><td>${cell(sc)}</td><td>${cell(su)}</td></tr>`; }).join('')}
</tbody></table>
<p class="note">${(m.validations || []).length} validation round(s)${(m.patches || []).length ? ` · patched: ${esc(m.patches.join(', '))}` : ''}${(m.acceptedRisks || []).length ? ` · accepted risks: ${esc(m.acceptedRisks.join(', '))}` : ''}${m.review ? ` · terminal review: ${m.review.verdict}${m.review.gaps?.length ? ` (${m.review.gaps.map((g) => g.id).join(', ')})` : ''}` : ''}</p>

<h2>Human decisions on the record</h2>
${decisions.length ? `<table><thead><tr><th>When</th><th>Kind</th><th>Prompt</th><th>Decision</th><th>Justification</th></tr></thead><tbody>${decisions.map((d) => `<tr><td>${when(d.decidedAt)}</td><td>${esc(d.kind)}</td><td class="note">${esc(d.prompt)}</td><td><b>${esc(d.decision)}</b></td><td>${esc(d.justification)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">None were required.</p>'}

<h2>Sources on the table</h2>
${(m.sources || []).length ? `<table><thead><tr><th>#</th><th>Source</th><th>Engine</th><th>Retrieved</th></tr></thead><tbody>${m.sources.map((s, i) => `<tr><td>[${i + 1}]</td><td>${s.url ? `<a href="${esc(s.url)}" rel="noreferrer">${esc(s.title)}</a>` : esc(s.title)}</td><td>${esc(s.engine || s.kind)}</td><td>${esc(s.retrieved)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">No sources were retrieved or supplied for this mission.</p>'}
${(m.critiques || []).length ? `<h2>Adviser critiques</h2><table><thead><tr><th>Adviser</th><th>Verdict</th><th>Issues</th></tr></thead><tbody>${m.critiques.map((c) => `<tr><td>${esc(c.model)}</td><td>${esc(c.verdict || c.error || '')}</td><td>${esc((c.issues || []).join(' · '))}</td></tr>`).join('')}</tbody></table>` : ''}

<h2>The tape: ${events.length} events</h2>
<details open><summary>Every move, in order</summary>
<table><thead><tr><th>Seq</th><th>When</th><th>Event</th><th>Detail</th></tr></thead><tbody>${events.map(eventRow).join('')}</tbody></table></details>

<h2>Settlement</h2>
<p>${m.settlement ? `${m.settlement.reserved} cr reserved · ${m.settlement.settled} cr settled · ${m.settlement.released} cr released back to the house.` : `Nothing settled${m.status === 'OPEN' ? ', the ticket was never stamped' : ''}.`}</p>

<h2 id="delivery">Delivered artifact${artifact ? ` · ${esc(artifact.title)} (v${artifact.version})` : ''}</h2>
${artifactHtml ? `<iframe sandbox="allow-scripts" srcdoc="${esc(artifactHtml)}" title="Delivered artifact"></iframe><p class="note">Embedded and sandboxed; the artifact carries its own provenance block.</p>` : '<p class="note">No artifact was delivered.</p>'}

<h2>Machine-readable record</h2>
<p class="note"><code>prajna.bundle.v1</code>, the complete mission record and artifact metadata as JSON.</p>
<script type="application/json" id="prajna-bundle">${JSON.stringify(record).replace(/</g, '\\u003c')}</script>
<script>(${replayScript.toString()})();</script>
</div></body></html>`;
}
