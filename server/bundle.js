// The audit bundle: one self-contained HTML file that carries a mission's
// whole record, contract, tape, decisions, validation, sources, settlement,
// the delivered artifact (embedded, sandboxed) and the machine-readable
// mission record, so a delivery can be handed over with its evidence.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const when = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '–');

export function auditBundle(mission, artifact, artifactHtml) {
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
</style></head><body><div class="wrap">
<h1>${esc(m.serial)} · ${esc(m.subject || m.goal)}</h1>
<p class="note">Prajñā audit bundle · exported ${when(record.exportedAt)} · ${esc(m.deskName)} · status ${esc(m.status)}${m.partial ? ' · PARTIAL' : ''}${m.voided ? ' · VOIDED' : ''}. Everything below is the record as kept by the house; the machine-readable copy is at the end.</p>
<div class="kv">
<div><span>Goal</span><b>${esc(m.goal)}</b></div>
<div><span>Panel</span><b>${esc((m.councilNames || []).join(' · '))}</b></div>
<div><span>Mode</span><b>${m.authored?.live ? `live, substance by ${esc(m.authored.model)}` : (m.seats || []).some((s) => s.live) ? 'hybrid' : 'scripted'}</b></div>
<div><span>Estimate / ceiling / settled</span><b>${m.contract.estimate} / ${m.contract.ceiling} / ${Number(m.spent || 0).toFixed(1)} cr</b></div>
<div><span>Launched → finished</span><b>${when(m.launchedAt)} → ${when(m.filledAt)}</b></div>
<div><span>Lineage</span><b>${m.lineage ? `v${m.lineage.version}, supersedes ${esc(m.lineage.parentSerial)}` : 'v1'}</b></div>
</div>

${m.narrative ? `<h2>In plain words</h2><p>${esc(m.narrative)}</p>` : ''}
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

<h2>Delivered artifact${artifact ? ` · ${esc(artifact.title)} (v${artifact.version})` : ''}</h2>
${artifactHtml ? `<iframe sandbox="allow-scripts" srcdoc="${esc(artifactHtml)}" title="Delivered artifact"></iframe><p class="note">Embedded and sandboxed; the artifact carries its own provenance block.</p>` : '<p class="note">No artifact was delivered.</p>'}

<h2>Machine-readable record</h2>
<p class="note"><code>prajna.bundle.v1</code>, the complete mission record and artifact metadata as JSON.</p>
<script type="application/json" id="prajna-bundle">${JSON.stringify(record).replace(/</g, '\\u003c')}</script>
</div></body></html>`;
}
