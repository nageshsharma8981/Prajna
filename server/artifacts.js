// Artifact generators. Every mission ends in one of these, a standalone,
// self-contained HTML document with its own editorial design and a provenance
// footer. Demo-mode content is authored at full fidelity and labeled synthetic
// here (not fabricated commercial claims: all figures are marked illustrative).

import { authored, str } from './author.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Derive a clean subject line from the user's goal.
export function subjectOf(goal) {
  let s = goal.trim().replace(/[.?!]+$/, '');
  s = s.replace(/^(should we|can we|is|are|what is|what are|state of|build|create|make|design|draft|write|give me|analy[sz]e)\s+/i, (m) => m);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Machine-readable provenance: a schema'd JSON block plus a rendered panel.
// Honest by construction, mode says "scripted" until real model calls land.
function provenanceObject(mission) {
  return {
    schema: 'prajna.provenance.v1',
    mode: mission.authored?.live ? 'live' : mission.authored?.composed ? 'composed' : (mission.seats || []).some((x) => x.live) ? 'hybrid' : 'scripted',
    retrieval: mission.retrieval ? { ...mission.retrieval, sources: (mission.sources || []).map((s) => ({ id: s.id, title: s.title, url: s.url, engine: s.engine || null, retrieved: s.retrieved, extract: (s.extract || '').slice(0, s.engine === 'attachment' || s.engine === 'connector' ? 4000 : 700) })) } : null,
    computed: mission.computed && !mission.computed.none ? mission.computed : null,
    data: mission.data ? { name: mission.data.name, rows: mission.data.rows, columns: mission.data.columns, series: mission.data.series?.column || null, segments: mission.data.segments?.column || null } : null,
    attachments: (mission.sources || []).filter((s) => s.engine === 'attachment').map((s) => ({ name: s.title, extract: (s.extract || '').slice(0, 4000) })),
    deliveries: (mission.deliveries || []).map((d) => ({ connector: d.connector, ok: d.ok, id: d.id || null, url: d.url || null, where: d.where || null, link: d.link || null, linkOk: d.linkOk ?? null, linkRevokedAt: d.linkRevokedAt || null, error: d.error || null })),
    dissent: mission.dissent || null,
    narration: Array.isArray(mission.narration) && mission.narration.length ? { count: mission.narration.length, model: mission.narration[0].model, voice: mission.narration[0].voice, seconds: Math.round(mission.narration.reduce((a, n) => a + (n.seconds || 0), 0)) } : null,
    visuals: Array.isArray(mission.visuals) && mission.visuals.length ? { count: mission.visuals.length, model: mission.visuals[0].model, files: mission.visuals.map((v) => v.file) } : null,
    critiques: (mission.critiques || []).map((c) => ({ model: c.model, verdict: c.verdict || 'unavailable', issues: c.issues || [], error: c.error || null })),
    writtenBy: mission.writtenBy || null,
    houseBrief: mission.houseBrief || null,
    keyUse: mission.keyUse || null,
    authored: mission.authored ? { live: !!mission.authored.live, model: mission.authored.model, modelId: mission.authored.modelId, chars: mission.authored.chars || 0, ms: mission.authored.ms || 0, error: mission.authored.error || null, steppedIn: mission.authored.steppedIn || null } : null,
    seats: (mission.seats || []).map((x) => ({ name: x.name, live: !!x.live })),
    serial: mission.serial,
    goal: mission.goal,
    desk: mission.deskName,
    council: mission.councilNames,
    partial: !!mission.partial,
    voided: !!mission.voided,
    contract: {
      plan: mission.contract.plan.map((p) => ({ id: p.id, title: p.title, tool: p.tool, cost: p.cost, status: p.status, contextHash: p.contextHash || null })),
      estimate: mission.contract.estimate,
      ceiling: mission.contract.ceiling,
      dimensions: mission.contract.dimensions || [],
      edited: mission.contract.edited || null,
      why: mission.contract.why || null,
      steps: mission.contract.plan.map((p) => ({ id: p.id, tool: p.tool, cost: p.cost, access: p.access, rationale: p.rationale || null, seats: (p.seats || []).map((s) => ({ name: s.name, live: !!s.live, cost: s.cost })) })),
    },
    lineage: mission.lineage ? { parentId: mission.lineage.parentId, parentSerial: mission.lineage.parentSerial, parentArtifactId: mission.lineage.parentArtifactId, version: mission.lineage.version, feedback: mission.lineage.feedback || [], revisedFromDraft: !!mission.lineage.previousDraft } : null,
    planVsActual: {
      planned: mission.contract.plan.length,
      done: mission.contract.plan.filter((p) => p.status === 'FILLED').length,
      skipped: mission.contract.plan.filter((p) => p.status === 'SKIPPED').map((p) => p.title),
      notReached: mission.contract.plan.filter((p) => p.status === 'QUEUED' || p.status === 'LIVE' || p.status === 'KILLED').length,
      parallelBranches: mission.contract.plan.filter((p) => (p.dependsOn || []).length > 1 || mission.contract.plan.some((q) => q !== p && JSON.stringify(q.dependsOn) === JSON.stringify(p.dependsOn) && (p.dependsOn || []).length)).length,
    },
    access: mission.contract.access || null,
    approvals: (mission.attention || []).filter((a) => a.kind === 'approval' && a.decision).map((a) => ({ stepId: a.stepId, decision: a.decision, justification: a.justification, decidedAt: a.decidedAt })),
    assertions: (mission.contract.assertions || []).map((a) => ({ id: a.id, title: a.title, owner: a.owner, status: a.status })),
    validation: { rounds: (mission.validations || []).length, lanes: ['scrutiny', 'surface'], sealed: mission.gateResult?.sealed || [], acceptedRisks: mission.acceptedRisks || [], patches: mission.patches || [] },
    settlement: mission.settlement || { reserved: mission.contract.ceiling, settled: mission.spent, released: null },
    gate: mission.gate || null,
    review: mission.review || null,
    decisions: (mission.attention || []).filter((a) => a.decision).map((a) => ({ kind: a.kind, decision: a.decision, justification: a.justification, decidedAt: a.decidedAt, by: a.decidedBy || null })),
    events: `mission ${mission.id}, seq 1..${mission.eventSeq || mission.events?.length || 0}`,
  };
}

export function partialBanner(mission) {
  if (mission.voided) {
    return `<div class="partial-banner">ARTIFACT VOIDED on terminal review, retained for audit only. The gap that voided it is recorded in the provenance block below.</div>`;
  }
  if (!mission.partial) return '';
  const filled = mission.contract.plan.filter((p) => p.status === 'FILLED').length;
  return `<div class="partial-banner">PARTIAL ARTIFACT: the run ended at step ${Math.min(filled + 1, mission.contract.plan.length)} of ${mission.contract.plan.length}. Completed work only; the contract's "always an artifact" clause applied.</div>`;
}

function provenance(mission) {
  const prov = provenanceObject(mission);
  const steps = mission.contract.plan.map((p) => `<li>${esc(p.title)} <em>(${esc(p.status.toLowerCase())})</em></li>`).join('');
  const s = prov.settlement;
  const gateLine = prov.gate
    ? `${prov.gate.cleared ? 'cleared' : 'NOT cleared'} · ${prov.gate.rows.length} votes across ${prov.contract.dimensions.length} dimensions`
    : 'not reached';
  const reviewLine = prov.review
    ? (prov.review.verdict === 'pass' ? 'pass, no gaps' : `${prov.review.gaps.length} gap(s): ${prov.review.gaps.map((g) => g.id).join(', ')}`)
    : 'not reached';
  const decisions = prov.decisions.length
    ? prov.decisions.map((d) => `<li><strong>${esc(d.kind)}</strong> → ${esc(d.decision)}, “${esc(d.justification)}”${d.by ? `, decided by ${esc(d.by)}` : ''}</li>`).join('')
    : '<li>none required</li>';
  return `
  <footer class="prov">
    <div class="prov-row"><span>Produced by</span><strong>PRAJÑĀ · ${esc(mission.serial)} · ${prov.mode} run${prov.partial ? ' · PARTIAL' : ''}</strong></div>
    <div class="prov-row"><span>Desk</span><strong>${esc(mission.deskName)}</strong></div>
    <div class="prov-row"><span>Panel</span><strong>${esc(mission.councilNames.join(' · '))}</strong></div>
    <div class="prov-row"><span>Settlement</span><strong>${s.reserved}cr reserved · ${Number(s.settled).toFixed(1)}cr settled${s.released == null ? '' : ` · ${Number(s.released).toFixed(1)}cr released`}</strong></div>
    <div class="prov-row"><span>Panel gate</span><strong>${gateLine}</strong></div>
    <div class="prov-row"><span>Terminal review</span><strong>${reviewLine}</strong></div>
    <div class="prov-row"><span>Definition of done</span><strong>${prov.assertions.length ? `${prov.assertions.filter((a) => a.status === 'SEALED').length}/${prov.assertions.length} assertions sealed by two independent validator lanes${prov.validation.acceptedRisks.length ? ` · ${prov.validation.acceptedRisks.length} accepted risk` : ''}${prov.validation.patches.length ? ` · patched: ${prov.validation.patches.join(', ')}` : ''}` : 'no assertions recorded'}</strong></div>
    <div class="prov-row"><span>Plan vs actual</span><strong>${prov.planVsActual.planned} planned · ${prov.planVsActual.done} done${prov.planVsActual.skipped.length ? ` · ${prov.planVsActual.skipped.length} skipped on the record` : ''}${prov.planVsActual.notReached ? ` · ${prov.planVsActual.notReached} not reached` : ''}${prov.access ? ` · access: ${prov.access.read} read / ${prov.access.write} write / ${prov.access.external} external` : ''}</strong></div>
    ${prov.lineage ? `<div class="prov-row"><span>Lineage</span><strong>v${prov.lineage.version}, supersedes ${esc(prov.lineage.parentSerial)}${prov.lineage.feedback.length ? ` · written against ${prov.lineage.feedback.length} owner note(s)` : ''}</strong></div>` : ''}
    ${prov.lineage && prov.lineage.feedback.length ? `<div class="prov-row"><span>Owner notes</span><strong>${prov.lineage.feedback.map((f) => esc(f)).join(' · ')}${prov.mode === 'live' ? '' : ', scripted substance cannot act on notes; they are recorded, not applied'}</strong></div>` : ''}
    <details><summary>Provenance: how this was made</summary><ol>${steps}</ol>
    <p><strong>Definition of done, assertion verdicts:</strong></p><ul>${prov.assertions.map((a) => `<li><strong>${esc(a.id)}</strong> ${esc(a.title)}, <em>${esc(a.status.toLowerCase())}</em> (owner ${esc(a.owner)})</li>`).join('') || '<li>none</li>'}</ul>
    <p><strong>Human decisions on the record:</strong></p><ul>${decisions}</ul>
    ${prov.planVsActual.skipped.length ? `<p><strong>Skipped by decision:</strong> ${prov.planVsActual.skipped.map(esc).join('; ')}</p>` : ''}
    <p class="note">${prov.mode === 'composed' ? `Composed run: no model was loaded, so the house formed no judgement of its own. Every claim below is a quotation from a source on the table, carrying the address it came from and the date it was read; nothing was invented and nothing was graded. Load a key to have a model weigh the evidence.` : prov.mode === 'live' ? `Live run: the substance of this deliverable was written by ${esc(prov.authored.model)} on your own key at the authoring step${prov.authored.steppedIn ? `, standing in after ${esc(prov.authored.steppedIn.after.join('; '))} refused` : ''}; the house laid it out, two validator lanes gated it, and any panel positions marked live were real calls. Figures and charts remain illustrative until a connector supplies real data.${prov.keyUse ? ` Your own key was called ${prov.keyUse.calls} time${prov.keyUse.calls === 1 ? '' : 's'} for this run${prov.keyUse.reported ? `, using ${prov.keyUse.prompt.toLocaleString('en-GB')} prompt and ${prov.keyUse.completion.toLocaleString('en-GB')} completion tokens as reported by the provider itself` : ', and the provider reported no token counts'}; the house does not guess a price for them.` : ''}` : prov.mode === 'hybrid' ? 'Hybrid run: panel positions from models marked live were real model calls on your own keys; tools and figures remain scripted, illustrative sample data.' : 'Demonstration run (mode: scripted): figures and sources are illustrative sample data, marked throughout.'} The machine-readable record below is the audit object.</p></details>
  </footer>
  <script type="application/json" id="prajna-provenance">${JSON.stringify(prov, null, 1).replace(/</g, '\\u003c')}</script>`;
}

const PROV_CSS = `
.prov{margin-top:4rem;padding-top:1.5rem;border-top:1px solid rgba(0,0,0,.15);font-size:.85rem;color:#555}
.prov-row{display:flex;gap:1rem;margin:.2rem 0}.prov-row span{width:8rem;color:#767268;flex:none}
.prov details{margin-top:.8rem}.prov summary{cursor:pointer}.prov .note{color:#8a6d3b;font-style:italic}
.partial-banner{background:#7c3428;color:#f6e3dd;padding:.7rem 1.2rem;font:700 .8rem/1.4 Verdana,sans-serif;letter-spacing:.06em}
@media print {.prov details{display:none}}`;

/* ---------------------------------- BRIEF --------------------------------- */

// The brief's own runtime. A decision brief exists so somebody can decide;
// the page lets them do the reader's job on it: look at only the evidence
// strong enough to act on, follow a claim to its source and the source back
// to every claim that leans on it, and record the decision with the reason,
// kept on this device under the mission's serial and printed with the brief.
function briefRuntime() {
  const KEY = 'prajna-brief-' + document.documentElement.dataset.serial;
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));
  const claims = $$('.claim-row');
  const counter = $('.filter-count');
  const filter = (min) => {
    const rank = { A: 3, B: 2, C: 1 };
    let shown = 0;
    claims.forEach((c) => { const on = rank[c.dataset.grade] >= rank[min]; c.classList.toggle('dim', !on); c.setAttribute('aria-hidden', on ? 'false' : 'true'); if (on) shown++; });
    $$('.filter button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.min === min ? 'true' : 'false'));
    counter.textContent = shown === claims.length ? 'All ' + claims.length + ' claims shown.' : shown + ' of ' + claims.length + ' claims shown; ' + (claims.length - shown) + ' below the bar dimmed, not removed.';
  };
  $$('.filter button').forEach((b) => b.addEventListener('click', () => filter(b.dataset.min)));
  filter('C');
  // A claim lights its source; a source lights every claim that leans on it.
  const flash = (el) => { if (!el) return; el.classList.add('lit'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.classList.remove('lit'), 1600); };
  $$('a.refmark, a.claim-link').forEach((a) => a.addEventListener('click', (e) => { const to = document.getElementById(a.getAttribute('href').slice(1)); if (!to) return; e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); flash(to); }));
  // The decision.
  const form = $('form.decision'), made = $('.decided');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const show = () => {
    const d = load();
    if (d && d.choice) {
      form.hidden = true; made.hidden = false;
      $('.d-line', made).textContent = 'You decided: ' + d.choice + ', on ' + new Date(d.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
      $('.d-why', made).textContent = d.why;
    } else { form.hidden = false; made.hidden = true; }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const choice = (form.querySelector('input[name=choice]:checked') || {}).value; const why = form.querySelector('[name=why]').value.trim(); const err = $('.err', form);
    if (!choice) { err.textContent = 'Pick one.'; return; }
    if (why.length < 12) { err.textContent = 'Say why, in at least a sentence. The reason is the record.'; form.querySelector('[name=why]').focus(); return; }
    try { localStorage.setItem(KEY, JSON.stringify({ choice, why, at: Date.now() })); } catch (x) { err.textContent = 'This browser will not keep the decision. It was not saved.'; return; }
    err.textContent = ''; show(); made.focus();
  });
  $('.d-edit', made).addEventListener('click', () => { const d = load() || {}; form.hidden = false; made.hidden = true; const r = form.querySelector('input[value="' + d.choice + '"]'); if (r) r.checked = true; form.querySelector('[name=why]').value = d.why || ''; form.querySelector('[name=why]').focus(); });
  show();
}

export function briefArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);

  // Citation integrity: a sealed source registry. Claims carry refs; the
  // References section renders ONLY from refs actually cited, and a claim
  // without a ref fails the artifact build. Sources are illustrative samples.
  const A = authored(mission);
  const today = new Date().toISOString().slice(0, 10);
  const R = mission.sources || [];
  const SOURCES = A ? Object.fromEntries(A.claims.slice(0, 5).map((c, i) => { const r = R[Number(c.src) - 1]; return [`src-${i + 1}`, r ? { title: r.title, url: r.url, kind: r.kind, retrieved: r.retrieved } : { title: str(c.source?.title, 'Source class stated by the lead model, not retrieved'), kind: str(c.source?.kind, 'analysis'), retrieved: today }]; })) : {
    'src-1': { title: 'Sector regulatory filing digest (sample)', kind: 'primary', retrieved: '2026-09-03' },
    'src-2': { title: 'Independent market-size analysis, methodology visible (sample)', kind: 'analysis', retrieved: '2026-09-03' },
    'src-3': { title: 'Incumbent annual report, segment notes (sample)', kind: 'primary', retrieved: '2026-09-03' },
    'src-4': { title: 'Practitioner interviews, n=9 (sample)', kind: 'field', retrieved: '2026-09-02' },
    'src-5': { title: 'Trade-press coverage sweep (sample, directional only)', kind: 'press', retrieved: '2026-09-03' },
  };
  const CLAIMS = A ? A.claims.slice(0, 5).map((c, i) => ({ text: str(c.text, 'Claim'), grade: /^[ABC]$/.test(c.grade) ? c.grade : 'C', ref: `src-${i + 1}`, snippet: str(c.detail).slice(0, 140), detail: str(c.detail) })) : [
    { text: 'The demand signal is real but younger than the headlines imply.', grade: 'A', ref: 'src-1', snippet: 'primary indicators point the same direction across independent sources; the disagreement is about slope, not sign', detail: 'Primary indicators point the same direction across independent sources; the disagreement is about slope, not sign.' },
    { text: 'The economics clear the bar only in the focused segment.', grade: 'B', ref: 'src-2', snippet: 'unit economics in the broad market remain marginal; the narrow segment clears the threshold', detail: 'Unit economics in the broad market remain marginal; in the narrow segment identified in §3 they clear the threshold with room to spare.' },
    { text: 'Incumbents are structurally slow here.', grade: 'B', ref: 'src-3', snippet: 'the capability is organizationally expensive for incumbents to build', detail: 'The capability that matters is organizationally expensive for incumbents to build; the window is real but not indefinite, the panel’s median estimate is 18–30 months.' },
  ];
  for (const c of CLAIMS) {
    if (!c.ref || !SOURCES[c.ref]) throw new Error(`Artifact build refused: claim "${c.text.slice(0, 40)}…" has no registered source ref.`);
  }
  const citedRefs = [...new Set(CLAIMS.map((c) => c.ref))];
  // What the house checked: the words this claim shares with the source it
  // rests on. A reader can see the support without taking anyone's word.
  const cites = mission.citations || [];
  const support = (text) => {
    const row = cites.find((x) => String(x.text).slice(0, 40) === String(text).slice(0, 40));
    if (!row || !row.judged) return '';
    if (!row.shared?.length) return `<span class="cite-check gone">the source named here does not mention ${esc((row.missing || []).slice(0, 3).join(', '))}; accepted on the record</span>`;
    // Show the line, not a report about the line. A reader can judge whether
    // the source really says this without leaving the page.
    if (row.quote?.line) return `<span class="cite-check">rests on ${esc(row.title)}, which says: <q>${esc(row.quote.line)}</q></span>`;
    return `<span class="cite-check">rests on ${esc(row.title)}, which uses ${row.shared.slice(0, 4).map((w) => `<em>${esc(w)}</em>`).join(', ')}, though no single line of it carries the claim</span>`;
  };
  const claimsHtml = `<div class="filter" role="group" aria-label="Evidence bar"><span>Show claims graded</span><button type="button" data-min="C" aria-pressed="true">All</button><button type="button" data-min="B" aria-pressed="false">B and above</button><button type="button" data-min="A" aria-pressed="false">A only</button><span class="filter-count" aria-live="polite"></span></div>\n`
    + CLAIMS.map((c, i) => `<p class="claim-row" id="claim-${i + 1}" data-grade="${c.grade}"><strong class="claim" data-ref="${c.ref}" data-snippet="${esc(c.snippet)}">${esc(c.text)}</strong><span class="grade g${c.grade}">${c.grade}</span><a class="refmark" href="#${c.ref}">[${c.ref.replace('src-', '')}]</a> ${esc(c.detail)}${support(c.text)}</p>`).join('\n');
  const referencesHtml = citedRefs.map((r) => {
    const s = SOURCES[r];
    const leaning = CLAIMS.map((c, i) => (c.ref === r ? i + 1 : null)).filter(Boolean);
    return `<tr id="${r}"><td>[${r.replace('src-', '')}]</td><td>${s.url ? `<a href="${esc(s.url)}" rel="noreferrer">${esc(s.title)}</a>` : esc(s.title)}</td><td>${esc(s.kind)}</td><td>${esc(s.retrieved)}</td><td class="cited-by">${leaning.map((n) => `<a class="claim-link" href="#claim-${n}">claim ${n}</a>`).join(', ')}</td></tr>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en" data-serial="${esc(mission.serial)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}, Decision Brief</title>
<style>
:root{--ink:#1b1b18;--paper:#fbfaf7;--accent:#8a4b13;--rule:#d9d4c8}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);
font:16px/1.65 Georgia,'Times New Roman',serif}
.wrap{max-width:46rem;margin:0 auto;padding:4rem 1.5rem 6rem}
h1{font-size:2.4rem;line-height:1.15;margin:0 0 .4rem;letter-spacing:-.01em}
.docline{font:600 .74rem/1 Verdana,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:.2rem 0 1rem;padding-bottom:.8rem;border-bottom:2px solid var(--ink)}
.stand{font-size:1.15rem;color:#4c4a44;font-style:italic;margin:0 0 2.2rem}
h2{font:700 1.05rem/1.3 Verdana,sans-serif;letter-spacing:.02em;margin:2.6rem 0 .8rem;padding-top:1.4rem;border-top:1px solid var(--rule)}
.verdict{background:#f2ede2;border:1px solid var(--rule);padding:1.2rem 1.4rem;margin:1.4rem 0}
.verdict b{font-family:Verdana,sans-serif;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:.4rem}
.grade{display:inline-block;font:700 .68rem/1 Verdana,sans-serif;padding:.22em .5em;border-radius:2px;vertical-align:2px;margin-left:.4em}
.gA{background:#1d5c3a;color:#fff}.gB{background:#6a7f2a;color:#fff}.gC{background:#a86a1c;color:#fff}
.refmark{font:700 .72rem/1 Verdana,sans-serif;color:var(--accent);text-decoration:none;vertical-align:2px;margin-left:.25em}
.refmark:hover{text-decoration:underline}
.claim{cursor:help}
.cite-check{display:block;font:400 .72rem/1.5 Verdana,sans-serif;color:#6b6857;margin:.2em 0 0}
.cite-check em{font-style:normal;border-bottom:1px solid #c9c2ab}
.cite-check q{color:#4c4a44;font-style:italic}
.cite-check.gone{color:#a2402f}
.filter{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;font:600 .72rem/1 Verdana,sans-serif;letter-spacing:.06em;color:#6b6857;margin:0 0 1rem}
.filter button{font:inherit;background:#fff;border:1px solid var(--rule);border-radius:999px;padding:.45rem .8rem;cursor:pointer;color:var(--ink);min-height:32px}.filter button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.filter-count{margin-left:auto;font-weight:400;letter-spacing:0}
.claim-row{transition:opacity .25s}.claim-row.dim{opacity:.32}
.lit{background:#fff3cf;box-shadow:0 0 0 6px #fff3cf;transition:background .3s}
.cited-by a{color:var(--accent);font-size:.85rem;text-decoration:none;border-bottom:1px solid #d9c9a6}
.decision fieldset{border:1px solid var(--rule);padding:.8rem 1rem;margin:0 0 .8rem}.decision legend{font:700 .72rem/1 Verdana,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6b6857;padding:0 .4rem}
.decision label{display:block;padding:.3rem 0;cursor:pointer}.decision input[type=radio]{margin-right:.5rem;transform:scale(1.2)}
.decision .why{font:700 .72rem/1 Verdana,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6b6857}.decision textarea{display:block;width:100%;margin-top:.4rem;font:inherit;padding:.7rem .9rem;border:1px solid var(--rule);border-radius:6px;background:#fff;color:var(--ink)}
.decision .err{color:#a2402f;font-size:.9rem;min-height:1.3em;margin:.4rem 0}
.d-save,.d-edit{font:700 .78rem/1 Verdana,sans-serif;letter-spacing:.08em;background:var(--ink);color:var(--paper);border:none;border-radius:6px;padding:.75rem 1.1rem;cursor:pointer;min-height:44px}.d-edit{background:none;color:var(--accent);border:1px solid var(--rule);margin-top:.6rem}
.decided{border:1px solid var(--ink);padding:1rem 1.2rem;background:#fff}.decided b{display:block;margin-bottom:.3rem}.decided p{margin:0;color:#4c4a44}
@media print{.filter,.d-save,.d-edit,.decision .err{display:none}.claim-row.dim{opacity:1}.decision{border:1px solid #999;padding:.6rem}.decision[hidden]{display:none}.decided{border:1px solid #000}}
table{width:100%;border-collapse:collapse;font-size:.9rem;margin:1rem 0}
th{font:700 .72rem/1.3 Verdana,sans-serif;letter-spacing:.1em;text-transform:uppercase;text-align:left;color:#777;border-bottom:2px solid var(--ink);padding:.5rem .6rem .4rem 0}
td{border-bottom:1px solid var(--rule);padding:.55rem .6rem .55rem 0;vertical-align:top}
.dissent{border:1px solid var(--rule);background:#f6efe3;padding:.9rem 1.2rem;margin:1.2rem 0;color:#4c4a44}
.dissent b{font-family:Verdana,sans-serif;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.dissent small{display:block;margin-top:.5em;font-size:.75rem;color:#6b6857}
${PROV_CSS}
</style></head><body>${partialBanner(mission)}<div class="wrap">
<h1>${t}</h1>
<p class="docline">Prajñā decision brief · ${esc(mission.serial)}</p>
<p class="stand">${A ? esc(str(A.stand, 'A graded-evidence brief written by the lead model for this goal.')) : 'A graded-evidence brief: every claim carries its source strength, and the strongest case against the recommendation is included, not buried.'}</p>

<div class="verdict"><b>The verdict</b>
${A ? esc(A.verdict) : 'The panel recommends a <strong>staged commitment</strong>: enter with a narrow, reversible first move within two quarters, gated on the two signals in §4. A full commitment now outruns the evidence; standing still concedes the window.'}</div>

<h2>1 · What the evidence supports</h2>
<p>Three findings survived cross-examination by the full council. Every claim carries its source ref, a claim without one cannot ship:</p>
${claimsHtml}

<h2>2 · What the evidence does not support</h2>
${A && Array.isArray(A.refuted) && A.refuted.length ? `<p>Claims commonly made that did not survive grading: ${A.refuted.slice(0, 4).map((r) => `${esc(str(r))}<span class="grade gC">C</span>`).join(', ')}. The brief refuses them as planning assumptions.</p>` : '<p>Claims commonly made in this space that did not survive grading: that the market is winner-take-all<span class="grade gC">C</span>, that regulation will remain favorable by default<span class="grade gC">C</span>, and that early entrants hold durable data advantages<span class="grade gC">C</span>. Each rests on analogy rather than measurement. The brief refuses them as planning assumptions.</p>'}

${mission.data && mission.data.series ? `<h2>2b · Data on the table, ${esc(mission.data.name)}</h2>
<p>${mission.data.rows} rows, ${mission.data.columns.length} columns, attached by the owner. ${esc(mission.data.series.column)}${mission.data.series.labelColumn ? ` by ${esc(mission.data.series.labelColumn)}` : ''}: sum ${mission.data.stats.sum}, mean ${mission.data.stats.mean}, range ${mission.data.stats.min}–${mission.data.stats.max}.${mission.data.segments ? ` By ${esc(mission.data.segments.column)}: ${mission.data.segments.items.map((s) => `${esc(s.name)} ${s.value}`).join(', ')}.` : ''} Parsed, not verified; figures in this brief that trace to it are marked as owner data.</p>
<table><thead><tr><th>${esc(mission.data.series.labelColumn || '#')}</th><th>${esc(mission.data.series.column)}</th></tr></thead><tbody>
${mission.data.series.points.slice(0, 12).map((p, i) => `<tr><td>${esc(p.label || String(i + 1))}</td><td>${p.value}</td></tr>`).join('')}
${mission.data.series.points.length > 12 ? `<tr><td colspan="2">… ${mission.data.series.points.length - 12} more rows in the attachment</td></tr>` : ''}
</tbody></table>` : ''}

<h2>3 · The narrow move</h2>
<table><thead><tr><th>Move</th><th>Commitment</th><th>Reversibility</th><th>What it buys</th></tr></thead><tbody>
${A && Array.isArray(A.moves) && A.moves.length ? A.moves.slice(0, 4).map((mv) => `<tr><td>${esc(str(mv.move))}</td><td>${esc(str(mv.commitment))}</td><td>${esc(str(mv.reversibility))}</td><td>${esc(str(mv.buys))}</td></tr>`).join('\n') : `<tr><td>Focused pilot in the identified segment</td><td>Small, time-boxed</td><td>High</td><td>Direct demand measurement, not survey proxy</td></tr>
<tr><td>Partnership before build</td><td>Contractual only</td><td>High</td><td>Distribution learning at near-zero capex</td></tr>
<tr><td>Full build-out</td><td>Large</td><td>Low</td><td>Deferred: gated on §4 signals</td></tr>`}
</tbody></table>

<h2>4 · Tripwires: when to change your mind</h2>
${A ? `<p>${esc(str(A.tripwires, 'Tripwires were not stated by the lead model, treat the recommendation as unconditional at your own risk.'))}</p>` : '<p>Commit further only when <strong>both</strong> hold: (1) pilot conversion sustains above the threshold for two consecutive months; (2) the cost curve continues its current decline through the next cycle. If either fails, exit the pilot with learning banked, the position was sized to make that cheap.</p>'}

${(() => {
  // A real objection, made by a named model that actually read the draft,
  // beats one the lead wrote about itself. When an adviser objected, that is
  // the dissent, and the document says whether the draft answered it.
  const D = mission.dissent;
  if (D?.live) return `<div class="dissent"><b>Recorded dissent: ${esc(D.model)}</b><br>
${esc(D.text)}<br><small>${D.answered ? 'The draft was revised in answer to this, and the revision is on the tape.' : 'The draft stands as written. The objection was not answered.'}</small></div>`;
  return `<div class="dissent"><b>Recorded dissent: ${A ? esc(str(A.dissent?.seat, 'an adviser')) : 'DeepSeek R2'}</b><br>
${A ? esc(str(A.dissent?.text, 'The lead model recorded no dissent. That absence is itself on the record.')) : "One panel member argued the staged path underweights speed: in this member's read, the window closes faster than the median estimate, and the pilot's chief risk is being too small to generate the very signals it gates on. The panel holds its recommendation but records the dissent; if early pilot data is ambiguous, revisit sizing rather than waiting the full two months."}</div>`;
})()}

<h2>4b · Your decision</h2>
<p class="docline" style="border:0;margin:0 0 .6rem">Recorded on this device under ${esc(mission.serial)}, printed with the brief, sent nowhere.</p>
<form class="decision" novalidate>
  <fieldset><legend>On the verdict above</legend>
    <label><input type="radio" name="choice" value="Agree"> Agree, proceed as recommended</label>
    <label><input type="radio" name="choice" value="Disagree"> Disagree, do not proceed</label>
    <label><input type="radio" name="choice" value="Need more"> Need more before deciding</label>
  </fieldset>
  <label class="why">Because<textarea name="why" rows="3" maxlength="600" placeholder="The reason is the record. One sentence at least."></textarea></label>
  <p class="err" role="alert" aria-live="assertive"></p>
  <button type="submit" class="d-save">Record the decision</button>
</form>
<div class="decided" hidden tabindex="-1" role="status"><b class="d-line"></b><p class="d-why"></p><button type="button" class="d-edit">Change it</button></div>

<h2>5 · References: cited sources only</h2>
<p>This table is generated exclusively from refs cited by claims above; an uncited source cannot appear here, and an unreferenced claim fails the build. ${A ? (R.length ? 'Linked entries were retrieved by the house at the sweep step and cited by the lead model; unlinked entries are source classes the model named without a retrieved document.' : 'Source classes were stated by the lead model; no document was fetched, treat each as a pointer to verify, not a verified citation.') : 'All entries are illustrative samples in this demonstration run.'}</p>
<table><thead><tr><th>Ref</th><th>Source</th><th>Class</th><th>Retrieved</th><th>Leaned on by</th></tr></thead><tbody>
${referencesHtml}
</tbody></table>
${!A && R.length ? `<h2>6 · Retrieved reading: not cited</h2>
<p>The house retrieved these real sources at the sweep step. The claims above are house-scripted samples and were not derived from them, so they are listed here for the reader, not cited as evidence.</p>
<table><thead><tr><th>Source</th><th>Class</th><th>Retrieved</th></tr></thead><tbody>${R.map((r) => `<tr><td><a href="${esc(r.url)}" rel="noreferrer">${esc(r.title)}</a></td><td>${esc(r.kind)}</td><td>${esc(r.retrieved)}</td></tr>`).join('')}</tbody></table>` : ''}
${provenance(mission)}
</div>
<script>(${briefRuntime.toString()})();</script>
</body></html>`;
  return { title: `${subject}, Decision Brief`, kind: 'brief', html };
}

/* ----------------------------------- DECK --------------------------------- */

import { DECK_TEMPLATES } from './workspace.js';

// The deck's own runtime. A deck is presented, not scrolled: every slide has
// an address, the keys a presenter reaches for all work, F is fullscreen,
// N opens the presenter panel with this slide's notes, the next slide and a
// clock, Esc shows every slide at once, a swipe turns the page on a phone,
// and a thin bar shows how far along the room is.
function deckRuntime() {
  const deck = document.getElementById('deck');
  const slides = Array.from(deck.querySelectorAll('.slide'));
  const n = slides.length;
  const bar = document.querySelector('.progress i');
  const panel = document.querySelector('.presenter');
  const grid = document.querySelector('.overview');
  const hint = document.querySelector('.hint');
  let i = 0, started = null, tick = null;
  const at = () => Math.max(0, Math.min(n - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
  const show = (k, push) => {
    i = Math.max(0, Math.min(n - 1, k));
    deck.scrollTo({ left: i * deck.clientWidth, behavior: 'smooth' });
    if (push !== false && location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1));
    bar.style.transform = 'scaleX(' + ((i + 1) / n) + ')';
    slides.forEach((s, j) => s.setAttribute('aria-hidden', j === i ? 'false' : 'true'));
    if (!panel.hidden) fillPanel();
  };
  const go = (d) => show(i + d);
  const clock = () => { const s = Math.floor((Date.now() - started) / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const fillPanel = () => {
    const cur = slides[i], next = slides[i + 1];
    panel.querySelector('.p-now').textContent = (i + 1) + ' / ' + n + ' · ' + (cur.querySelector('h1,h2') || {}).textContent;
    panel.querySelector('.p-notes').textContent = (cur.querySelector('.notes') || {}).textContent || 'No notes for this slide.';
    panel.querySelector('.p-next').textContent = next ? 'Next: ' + (next.querySelector('h1,h2') || {}).textContent : 'This is the last slide.';
    panel.querySelector('.p-clock').textContent = clock();
  };
  const togglePanel = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { if (!started) started = Date.now(); fillPanel(); clearInterval(tick); tick = setInterval(() => { panel.querySelector('.p-clock').textContent = clock(); }, 1000); }
    else clearInterval(tick);
  };
  const toggleGrid = () => {
    grid.hidden = !grid.hidden;
    if (!grid.hidden) {
      grid.innerHTML = '';
      slides.forEach((s, j) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb' + (j === i ? ' on' : '');
        b.innerHTML = '<span class="t-n">' + (j + 1) + '</span><span class="t-h"></span>'; b.querySelector('.t-h').textContent = (s.querySelector('h1,h2') || {}).textContent || '';
        b.addEventListener('click', (e) => { e.stopPropagation(); grid.hidden = true; show(j); }); grid.appendChild(b);
      });
      (grid.querySelector('.on') || grid.firstChild).focus();
    }
  };
  const fullscreen = () => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); };
  addEventListener('keydown', (e) => {
    const t = e.target; if (t && typeof t.closest === 'function' && t.closest('input,textarea')) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); go(-1); }
    else if (e.key === 'Home') show(0); else if (e.key === 'End') show(n - 1);
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'n' || e.key === 'N') togglePanel();
    else if (e.key === 'Escape') toggleGrid();
    else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) show(Number(e.key) - 1);
  });
  deck.addEventListener('click', (e) => { if (e.target.closest('a,button')) return; go(1); });
  let tx = null;
  deck.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  addEventListener('hashchange', () => { if (at() !== i) show(at(), false); });
  addEventListener('resize', () => deck.scrollTo({ left: i * deck.clientWidth }));
  document.querySelector('.btn-notes').addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  document.querySelector('.btn-full').addEventListener('click', (e) => { e.stopPropagation(); fullscreen(); });
  document.querySelector('.btn-grid').addEventListener('click', (e) => { e.stopPropagation(); toggleGrid(); });
  setTimeout(() => hint.classList.add('fade'), 4000);
  show(at(), false);
}

// The nine slides a deck lays out, from the model's six beats or the
// house's own. Shared with the engine, which illustrates the same list.
// The film. The same nine slides, played as a sequence: each picture in
// slow motion under its headline, the narration timed to it, full screen,
// and exportable as a real video file with the audio in it, made in the
// browser with no server and no upload. The narration is the house's spoken
// track when one was recorded on a key, and the browser's own voice when
// not, in which case the exported file carries no narration and says so.
function deckFilm() {
  const slides = Array.from(document.querySelectorAll('#deck .slide')).map((s) => ({
    el: s, title: (s.querySelector('h1,h2') || {}).textContent || '', sub: (s.querySelector('.sub') || {}).textContent || '',
    label: (s.querySelector('.run') || {}).textContent || '', notes: (s.querySelector('.notes') || {}).textContent || '',
    img: s.querySelector('img.visual') ? s.querySelector('img.visual').getAttribute('src') : null,
    audio: s.dataset.narration ? '/api/media/' + s.dataset.narration : null,
    kind: s.classList.contains('title') ? 'title' : s.classList.contains('big') ? 'big' : s.classList.contains('end') ? 'end' : 'claim',
  }));
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#b0472f';
  const stage = document.querySelector('.film'); const canvas = stage.querySelector('canvas'); const ctx = canvas.getContext('2d');
  const status = stage.querySelector('.film-status'); const W = 1920, H = 1080; canvas.width = W; canvas.height = H;
  let playing = false, recorder = null, chunks = [], ac = null, dest = null, stopFlag = false;
  // A frame on the next animation frame, or on a timer if the browser is
  // withholding frames (a background tab): the film keeps time either way.
  const tick = (fn) => { let done = false; const go = () => { if (done) return; done = true; fn(); }; requestAnimationFrame(go); setTimeout(go, 50); };
  const spoken = slides.some((s) => s.audio);
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const wrap = (text, maxW, font) => { ctx.font = font; const words = String(text).split(/\s+/); const lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; };
  const draw = (s, im, t, fadeIn, fadeOut) => {
    ctx.fillStyle = '#0a0a08'; ctx.fillRect(0, 0, W, H);
    if (im) {
      const k = 1.04 + 0.08 * t; const w = W * k, h = H * k; const dx = (W - w) * (0.3 + 0.4 * t), dy = (H - h) * 0.5;
      ctx.drawImage(im, dx, dy, w, h);
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(10,10,8,0.85)'); g.addColorStop(0.5, 'rgba(10,10,8,0.55)'); g.addColorStop(1, 'rgba(10,10,8,0.1)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (s.kind === 'big') { ctx.fillStyle = acc; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const rise = Math.min(1, t * 4); const y0 = H * 0.42 + (1 - rise) * 30;
    ctx.globalAlpha = rise; ctx.fillStyle = '#fbf7ee'; ctx.textBaseline = 'alphabetic';
    const big = s.kind === 'title' ? 'bold 96px Helvetica Neue, Helvetica, Arial, sans-serif' : 'bold 78px Helvetica Neue, Helvetica, Arial, sans-serif';
    const lines = wrap(s.title, W * 0.55, big); let y = y0;
    for (const l of lines) { ctx.font = big; ctx.fillText(l, 150, y); y += s.kind === 'title' ? 104 : 86; }
    ctx.globalAlpha = Math.min(1, Math.max(0, t * 4 - 0.6)); ctx.fillStyle = '#e6ddcc'; const small = '36px Helvetica Neue, Helvetica, Arial, sans-serif';
    for (const l of wrap(s.sub, W * 0.5, small)) { ctx.font = small; ctx.fillText(l, 150, y + 24); y += 48; }
    if (s.label) { ctx.globalAlpha = 0.9; ctx.font = 'bold 22px Helvetica Neue, Helvetica, Arial, sans-serif'; ctx.fillStyle = acc; ctx.fillText(s.label.toUpperCase(), 150, H - 90); }
    ctx.globalAlpha = 1;
    const fade = Math.min(fadeIn, fadeOut); if (fade < 1) { ctx.fillStyle = 'rgba(10,10,8,' + (1 - fade) + ')'; ctx.fillRect(0, 0, W, H); }
  };
  const speak = (s) => new Promise((res) => {
    if (s.audio) {
      const a = new Audio(s.audio); a.crossOrigin = 'anonymous';
      if (dest && ac) { try { ac.createMediaElementSource(a).connect(dest); } catch (e) { /* once per element */ } }
      a.onended = () => res(); a.onerror = () => res(); a.play().catch(() => res());
      return;
    }
    if (window.speechSynthesis && s.notes) { const u = new SpeechSynthesisUtterance(s.notes); u.rate = 0.95; u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u); return; }
    res();
  });
  const run = async (exporting) => {
    playing = true; stopFlag = false; stage.hidden = false; document.body.classList.add('filming');
    if (exporting) {
      ac = new (window.AudioContext || window.webkitAudioContext)(); dest = ac.createMediaStreamDestination();
      const stream = canvas.captureStream(30); if (spoken) dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      chunks = []; recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; recorder.start(500);
    }
    const imgs = await Promise.all(slides.map((s) => loadImg(s.img)));
    for (let i = 0; i < slides.length && !stopFlag; i++) {
      const s = slides[i]; const im = imgs[i]; const t0 = performance.now(); let done = false;
      status.textContent = (i + 1) + ' / ' + slides.length + (exporting ? ' · recording' : '');
      const said = speak(s).then(() => { done = true; });
      const minMs = s.kind === 'title' || s.kind === 'end' ? 5000 : 6500; let tEnd = null;
      await new Promise((res) => { const frame = () => { const el = performance.now() - t0; if (done && tEnd == null) tEnd = Math.max(el, minMs) + 900; const total = tEnd == null ? Math.max(minMs, el + 1) : tEnd; const t = Math.min(1, el / Math.max(total, 8000)); draw(s, im, t, Math.min(1, el / 700), tEnd == null ? 1 : Math.min(1, (tEnd - el) / 700)); if (stopFlag || (tEnd != null && el >= tEnd)) return res(); tick(frame); }; tick(frame); });
      await said;
    }
    ctx.fillStyle = '#0a0a08'; ctx.fillRect(0, 0, W, H);
    if (exporting && recorder) {
      await new Promise((res) => { recorder.onstop = res; recorder.stop(); });
      const blob = new Blob(chunks, { type: 'video/webm' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = document.documentElement.dataset.serial + '-film.webm'; a.click();
      status.textContent = 'Saved ' + Math.round(blob.size / 1024) + ' KB' + (spoken ? ' with narration.' : '. The browser voice cannot be recorded, so this file has no narration; load a speech key and re-run the deck for a spoken track.');
      try { ac.close(); } catch (e) { /* fine */ }
    } else status.textContent = stopFlag ? 'Stopped.' : 'The end.';
    playing = false; if (!exporting) setTimeout(() => { if (!playing) { stage.hidden = true; document.body.classList.remove('filming'); } }, 1500);
  };
  const stop = () => { stopFlag = true; try { speechSynthesis.cancel(); } catch (e) { /* fine */ } };
  document.querySelector('.btn-film').addEventListener('click', (e) => { e.stopPropagation(); if (!playing) run(false); });
  stage.querySelector('.film-export').addEventListener('click', (e) => { e.stopPropagation(); if (!playing) run(true); });
  stage.querySelector('.film-close').addEventListener('click', (e) => { e.stopPropagation(); stop(); stage.hidden = true; document.body.classList.remove('filming'); });
  addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') { if (!playing) run(false); } else if (e.key === 'Escape' && !stage.hidden) { stop(); stage.hidden = true; document.body.classList.remove('filming'); } });
  stage.querySelector('.film-note').textContent = spoken ? 'Narrated by the house on your key. Export saves a video file with the narration in it.' : 'No speech key was held when this deck ran, so the browser reads the notes aloud; an exported file has no narration.';
}

export function deckSlides(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const A = authored(mission);
  return A ? [
    { k: 'title', h: t, s: esc(str(A.sub, 'The argument in nine slides.')), notes: 'Say the title and the one line, then stop. Let the room read it. Do not narrate the agenda.' },
    ...A.slides.slice(0, 2).map((x) => ({ k: 'claim', n: esc(str(x.n, 'Beat')), h: esc(str(x.h)), s: esc(str(x.s)), notes: esc(str(x.notes)) })),
    { k: 'big', h: 'One sentence.', s: esc(str(A.one, t)), notes: 'Read the sentence aloud exactly as written, once. This is the line the room should be able to repeat back at the end.' },
    ...A.slides.slice(2, 6).map((x) => ({ k: 'claim', n: esc(str(x.n, 'Beat')), h: esc(str(x.h)), s: esc(str(x.s)), notes: esc(str(x.notes)) })),
    { k: 'end', h: 'The close', s: esc(str(A.close, 'End on the claim.')), notes: 'End on the claim, not on thank you. Leave this slide up while you take questions.' },
  ] : [
    { k: 'title', h: t, s: 'The argument in nine slides, one idea per slide, evidence beneath assertion.', notes: 'Say the title and the one line, then stop. Let the room read it. Do not narrate the agenda.' },
    { k: 'claim', n: 'The problem', h: 'The status quo has a cost, and it compounds.', s: 'Name the pain precisely: who bleeds, how much, how often. A problem the room already feels needs one slide, not three.', notes: 'Name one person who has this problem and what it costs them this month. Then stop; the room will supply the rest.' },
    { k: 'claim', n: 'The shift', h: 'Something changed that makes now different.', s: 'Timing is the investor question under every other question. State the enabling shift, technical, regulatory, or behavioral, and date it.', notes: 'Give the date the shift happened. If you cannot date it, it is not a shift, it is a hope.' },
    { k: 'big', h: 'One sentence.', s: `${t}, stated so plainly that a skeptic could repeat it back.`, notes: 'Read the sentence aloud exactly as written, once. This is the line the room should be able to repeat back at the end.' },
    { k: 'claim', n: 'The mechanism', h: 'How it works, shown, not adjectived.', s: 'The demo slide. Walk one concrete case end to end. If the mechanism needs three slides, it is not yet understood.', notes: 'Walk one real case from start to finish, in the order the user meets it. No adjectives; verbs only.' },
    { k: 'claim', n: 'The proof', h: 'Evidence a competitor could not copy-paste.', s: 'Illustrative placeholder: replace with your real traction, pilot results, or signed intent. The deck refuses invented numbers.', notes: 'Say only what you can show. If the number is not on the slide, do not say it out loud either.' },
    { k: 'claim', n: 'The economics', h: 'The unit that makes money, and when.', s: 'One unit, its cost, its price, its payback window. Illustrative placeholder: wire in your model before the room.', notes: 'One unit, three numbers: what it costs, what it earns, when it pays back. Say them in that order and stop.' },
    { k: 'claim', n: 'The ask', h: 'What you want, what it buys, what it proves.', s: 'A specific amount, a specific runway, and the two milestones that de-risk the next round.', notes: 'The amount, the months it buys, the two things that will be true at the end. Then ask for the meeting, not the money.' },
    { k: 'end', h: 'The close', s: 'End on the claim, not on “thank you”. Leave the one sentence on screen while you take questions.', notes: 'End on the claim, not on thank you. Leave this slide up while you take questions.' },
  ];
}

// The house's own drawing for a slide that has no generated image: a
// deterministic composition from the slide's words, so two runs of the same
// deck look the same and no slide is ever a blank wall of text.
function houseVisual(sl, i, acc, ink) {
  const seed = [...String(sl.h || '') + i].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = (n) => ((seed >> (n % 24)) % 97) / 97;
  const shapes = Array.from({ length: 5 }, (_, j) => `<circle cx="${Math.round(1100 + r(j * 3) * 700)}" cy="${Math.round(150 + r(j * 5) * 700)}" r="${Math.round(120 + r(j * 7) * 260)}" fill="${j % 2 ? acc : ink}" opacity="${(0.08 + r(j * 11) * 0.14).toFixed(2)}"/>`).join('');
  return `<svg class="visual house" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1920" height="1080" fill="${ink}" opacity="0.04"/>${shapes}<path d="M0 ${Math.round(700 + r(2) * 200)} Q 960 ${Math.round(500 + r(4) * 300)} 1920 ${Math.round(760 + r(6) * 200)}" stroke="${acc}" stroke-width="3" fill="none" opacity="0.35"/></svg>`;
}

export function deckArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const tpl = DECK_TEMPLATES.find((x) => x.id === mission.template)?.theme || null;
  const paper = tpl ? tpl.paper : '#f4f1e8', ink = tpl ? tpl.ink : '#14140f', acc = tpl ? tpl.acc : '#b0472f', font = tpl ? tpl.font : "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const A = authored(mission);
  const slides = deckSlides(mission);
  const visuals = Array.isArray(mission.visuals) ? mission.visuals : [];
  const visualOf = (sl, i) => {
    const v = visuals.find((x) => x.slide === i);
    if (v) return { html: `<img class="visual" src="/api/media/${esc(v.id)}" alt="${esc(v.prompt.replace(/^.*?Subject: /, '').slice(0, 200))}" loading="${i === 0 ? 'eager' : 'lazy'}">`, attr: ` data-visual="${esc(v.file)}"`, cls: ' has-visual' };
    if (sl.k === 'title' || sl.k === 'claim') return { html: houseVisual(sl, i, acc, ink), attr: '', cls: ' has-visual house-visual' };
    return { html: '', attr: '', cls: '' };
  };
  const narration = Array.isArray(mission.narration) ? mission.narration : [];
  const narrOf = (i) => { const n = narration.find((x) => x.slide === i); return n ? ` data-narration="${esc(n.id)}"` : ''; };
  const notesOf = (sl) => sl.notes ? `<aside class="notes" hidden>${sl.notes}</aside>` : '';
  const slideHtml = slides.map((sl, i) => {
    const V = visualOf(sl, i);
    if (sl.k === 'title') return `<section class="slide title${V.cls}" id="slide-1"${V.attr}${narrOf(0)}>${V.html}<div><h1>${sl.h}</h1><p class="sub">${sl.s}</p></div><p class="run">Prajñā deck · ${esc(mission.serial)}</p><p class="pg">1 / ${slides.length}</p>${notesOf(sl)}</section>`;
    if (sl.k === 'big') return `<section class="slide big" id="slide-${i + 1}"${narrOf(i)}><div><h2>${sl.h}</h2><p class="sub">${sl.s}</p></div><p class="pg">${i + 1} / ${slides.length}</p>${notesOf(sl)}</section>`;
    if (sl.k === 'end') return `<section class="slide end" id="slide-${i + 1}"${narrOf(i)}><div><h2>${sl.h}</h2><p class="sub">${sl.s}</p>${mission.dissent ? `<p class="deck-dissent"><b>Recorded dissent, ${esc(mission.dissent.model)}:</b> ${esc(mission.dissent.text)}</p>` : ''}</div><p class="pg">${i + 1} / ${slides.length}</p>${notesOf(sl)}</section>`;
    return `<section class="slide${V.cls}" id="slide-${i + 1}"${V.attr}${narrOf(i)}>${V.html}<div><h2>${sl.h}</h2><p class="sub">${sl.s}</p></div><p class="run">${sl.n}</p><p class="pg">${i + 1} / ${slides.length}</p>${notesOf(sl)}</section>`;
  }).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}, Deck</title>
<style>
:root{--ink:${ink};--paper:${paper};--acc:${acc}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--ink);font:16px/1.5 ${font};overflow:hidden}
.deck{height:100%;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth}
.slide{min-width:100%;height:100%;scroll-snap-align:start;background:var(--paper);color:var(--ink);
display:flex;flex-direction:column;justify-content:center;padding:6vh 8vw;position:relative;border-right:2px solid var(--ink)}
.run{position:absolute;bottom:2.2vh;left:3vw;font-size:.75rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--acc);margin:0}
h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:1.04;margin:0 0 1.2rem;letter-spacing:-.02em;max-width:18ch}
h2{font-size:clamp(1.8rem,4.5vw,3.4rem);line-height:1.08;margin:0 0 1.2rem;letter-spacing:-.02em;max-width:22ch}
.sub{font-size:clamp(1rem,1.6vw,1.25rem);color:#54524a;max-width:52ch;margin:0}
.big{background:var(--acc)}.big h2,.big .sub{color:#f8ede8}.big .sub{color:#eed3c9}
.end{background:var(--ink)}.end h2{color:var(--paper)}.end .sub{color:#a5a294}
.deck-dissent{margin:2rem 0 0;max-width:60ch;font-size:.9rem;color:#d7c9a5;border-left:3px solid var(--acc);padding-left:.9rem}.deck-dissent b{color:var(--paper)}
.pg{position:absolute;bottom:2.2vh;right:3vw;font-size:.75rem;letter-spacing:.1em;color:#98948a;margin:0}
.visual{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.slide.has-visual>div{position:relative;z-index:2;max-width:56%}
.slide.has-visual:not(.house-visual)::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(10,10,8,.82) 0%,rgba(10,10,8,.62) 45%,rgba(10,10,8,.15) 100%)}
.slide.has-visual:not(.house-visual) h1,.slide.has-visual:not(.house-visual) h2{color:#fbf7ee}.slide.has-visual:not(.house-visual) .sub{color:#e6ddcc}
.slide.has-visual:not(.house-visual) .pg{color:#cfc8b8}.slide.has-visual .run,.slide.has-visual .pg{z-index:2}
@media(max-width:700px){.slide.has-visual>div{max-width:100%}.slide.has-visual:not(.house-visual)::before{background:linear-gradient(180deg,rgba(10,10,8,.25) 0%,rgba(10,10,8,.85) 60%)}}
.hint{position:fixed;bottom:2.2vh;left:50%;transform:translateX(-50%);font-size:.75rem;letter-spacing:.08em;color:#98948a;z-index:2;transition:opacity .6s}.hint.fade{opacity:0}
.progress{position:fixed;top:0;left:0;right:0;height:3px;background:rgba(0,0,0,.15);z-index:5}.progress i{display:block;height:100%;background:var(--acc);transform-origin:left;transform:scaleX(0);transition:transform .3s}
.chrome{position:fixed;top:1.2vh;right:3vw;z-index:5;display:flex;gap:.4rem}
.chrome button{background:rgba(0,0,0,.55);color:#f4f1e8;border:none;font:600 .7rem/1 inherit;letter-spacing:.1em;text-transform:uppercase;padding:.55rem .8rem;border-radius:4px;cursor:pointer;min-height:32px}.chrome button:hover{background:var(--acc)}
[hidden]{display:none!important}
.film{position:fixed;inset:0;z-index:8;background:#0a0a08;display:flex;flex-direction:column}
.film canvas{flex:1;width:100%;height:auto;object-fit:contain;min-height:0}
.film-bar{display:flex;align-items:center;gap:1rem;padding:.6rem 3vw;background:#111;color:#ddd;font-size:.8rem;border-top:2px solid var(--acc)}
.film-status{font:700 .8rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--acc);min-width:6rem}.film-note{flex:1;color:#999}
.film-bar button{background:rgba(255,255,255,.1);color:#f4f1e8;border:none;font:600 .7rem/1 inherit;letter-spacing:.1em;text-transform:uppercase;padding:.55rem .8rem;border-radius:4px;cursor:pointer;min-height:32px}.film-bar button:hover{background:var(--acc)}
body.filming .chrome,body.filming .hint,body.filming .progress{display:none}
.presenter{position:fixed;left:0;right:0;bottom:0;z-index:6;background:#111;color:#eee;padding:1rem 3vw 1.2rem;display:grid;grid-template-columns:1fr auto;gap:.4rem 2rem;border-top:3px solid var(--acc);max-height:38vh;overflow:auto;font-size:.95rem}
.presenter .p-now{grid-column:1;font-weight:700;color:#fff;margin:0}.presenter .p-clock{grid-column:2;grid-row:1/3;font:700 2rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--acc);align-self:start}
.presenter .p-notes{grid-column:1;margin:0;color:#ddd;max-width:70ch;line-height:1.5}.presenter .p-next{grid-column:1;margin:0;font-size:.8rem;color:#999}
.overview{position:fixed;inset:0;z-index:7;background:rgba(0,0,0,.92);padding:6vh 6vw;display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem;overflow:auto;align-content:start}
.thumb{background:var(--paper);color:var(--ink);border:3px solid transparent;border-radius:6px;padding:1rem;text-align:left;cursor:pointer;min-height:8rem;display:flex;flex-direction:column;gap:.4rem;font:inherit}.thumb.on,.thumb:focus{border-color:var(--acc);outline:none}
.thumb .t-n{font-size:.7rem;letter-spacing:.14em;color:var(--acc);font-weight:700}.thumb .t-h{font-weight:700;line-height:1.2}
@media print{body{overflow:visible;background:#fff}.deck{display:block;height:auto;overflow:visible}.slide{min-width:0;width:100%;height:auto;min-height:60vh;page-break-after:always;border:1px solid #ccc;margin:0 0 1rem}.slide .notes{display:block!important;margin:2rem 0 0;padding-top:1rem;border-top:1px dashed #999;font-size:.9rem;color:#333}.hint,.chrome,.progress,.presenter,.overview,.prov,.prov-tab{display:none!important}}
${PROV_CSS}
.prov{position:fixed;inset:auto 0 0 0;transform:translateY(100%);background:var(--paper);padding:1rem 3vw;margin:0;transition:transform .25s ease;z-index:3}
.prov:focus-within,.prov:hover{transform:none}
.prov-tab{position:fixed;bottom:0;right:3vw;z-index:4;background:var(--ink);color:var(--paper);border:none;font:700 .68rem/1 'Helvetica Neue',sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:4px 4px 0 0}
</style></head><body>${partialBanner(mission)}
<div class="progress" aria-hidden="true"><i></i></div>
<div class="chrome"><button type="button" class="btn-grid" title="All slides (Esc)">Slides</button><button type="button" class="btn-notes" title="Presenter notes and clock (N)">Notes</button><button type="button" class="btn-film" title="Play as a narrated film (P)">Film</button><button type="button" class="btn-full" title="Fullscreen (F)">Full</button></div>
<div class="film" hidden role="dialog" aria-label="Film"><canvas></canvas><div class="film-bar"><span class="film-status"></span><span class="film-note"></span><button type="button" class="film-export">Export video</button><button type="button" class="film-close">Close</button></div></div>
<div class="deck" id="deck">${slideHtml}</div>
<div class="presenter" hidden role="region" aria-label="Presenter"><p class="p-now"></p><p class="p-clock">00:00</p><p class="p-notes"></p><p class="p-next"></p></div>
<div class="overview" hidden role="dialog" aria-label="All slides"></div>
<button class="prov-tab" onclick="document.querySelector('.prov').style.transform=document.querySelector('.prov').style.transform?'':'none';event.stopPropagation()">Provenance</button>
<p class="hint">← → or click to advance · N notes · P film · F fullscreen · Esc all slides · print for a handout with notes</p>
<script>(${deckRuntime.toString()})();(${deckFilm.toString()})();</script>${provenance(mission)}</body></html>`;
  return { title: `${subject}, Deck`, kind: 'deck', html };
}

/* ----------------------------------- SITE --------------------------------- */

// The landing page's own runtime, serialised into the artifact the same way
// the app's is. The page has one job, to get a visitor to act, so the action
// has to work: the form validates in its own words, keeps what it captures
// on this device under the mission's serial until a connector gives it
// somewhere to go, confirms plainly, and says exactly where the entry went.
function siteRuntime() {
  const KEY = 'prajna-site-' + document.documentElement.dataset.serial;
  const $ = (q, el) => (el || document).querySelector(q);
  const form = $('form.join');
  const email = $('[name=email]', form), name = $('[name=name]', form), err = $('.err', form), ok = $('.joined');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const count = () => { const n = load().length; $('.count').textContent = n ? (n === 1 ? 'One person on the list, kept on this device.' : n + ' people on the list, kept on this device.') : ''; };
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1); const to = id && document.getElementById(id);
    if (!to) return; e.preventDefault(); to.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (id === 'join') setTimeout(() => email.focus({ preventScroll: true }), 450);
    history.replaceState(null, '', '#' + id);
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault(); err.textContent = '';
    const v = email.value.trim(), n = name.value.trim();
    if (!v) { err.textContent = 'An email address is needed.'; email.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = 'That does not look like an email address.'; email.focus(); return; }
    const list = load();
    if (list.some((x) => x.email.toLowerCase() === v.toLowerCase())) { err.textContent = 'That address is already on the list.'; email.focus(); return; }
    list.push({ email: v, name: n, at: Date.now() });
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (x) { err.textContent = 'This browser will not keep the entry. It was not saved.'; return; }
    form.hidden = true; ok.hidden = false; ok.querySelector('b').textContent = n ? 'Thanks, ' + n + '.' : 'Thanks.'; ok.focus(); count();
  });
  $('.again').addEventListener('click', () => { form.hidden = false; ok.hidden = true; form.reset(); email.focus(); });
  count();
}

export function siteArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const A = authored(mission);
  const proofPatched = (mission.patches || []).includes('VAL-PROOF-REAL');
  const why = A ? A.why.slice(0, 3).map((w) => ({ k: esc(str(w.k, 'Why')), h: esc(str(w.h)), p: esc(str(w.p)) })) : null;
  const html = `<!doctype html><html lang="en" data-serial="${esc(mission.serial)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>
:root{--ink:#101c16;--ground:#eef1ea;--acc:#1d5c3a;--acc2:#dbe8d2}
html{scroll-behavior:smooth}
*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:17px/1.6 'Avenir Next','Segoe UI',system-ui,sans-serif}
nav{display:flex;justify-content:space-between;align-items:center;padding:1.2rem 5vw;max-width:72rem;margin:0 auto}
.logo{font-weight:800;letter-spacing:.04em}
nav a.cta{background:var(--ink);color:#fff;text-decoration:none;padding:.6rem 1.2rem;border-radius:999px;font-size:.9rem;font-weight:600}
.hero{max-width:72rem;margin:0 auto;padding:9vh 5vw 6vh;display:grid;grid-template-columns:1.2fr 1fr;gap:4rem;align-items:center}
h1{font-size:clamp(2.4rem,5vw,4rem);line-height:1.05;letter-spacing:-.025em;margin:0 0 1.4rem}
.hero p{font-size:1.15rem;color:#3d4a41;max-width:44ch;margin:0 0 2rem}
.actions{display:flex;gap:1rem;align-items:center}
.btn{background:var(--acc);color:#fff;text-decoration:none;padding:.9rem 1.8rem;border-radius:999px;font-weight:700}
.ghost{color:var(--ink);text-decoration:none;font-weight:600;border-bottom:2px solid var(--acc)}
.vis{background:var(--acc);border-radius:1.2rem;aspect-ratio:4/5;position:relative;overflow:hidden}
.vis::after{content:"";position:absolute;inset:0;background:
radial-gradient(circle at 30% 20%,rgba(255,255,255,.25),transparent 45%),
repeating-linear-gradient(-35deg,transparent 0 26px,rgba(255,255,255,.09) 26px 28px)}
.vis span{position:absolute;bottom:1.4rem;left:1.4rem;color:#dbe8d2;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}
.vis.has-visual::after{display:none}.vis .visual{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.strip{background:var(--ink);color:#c8d4c9;padding:1rem 5vw;text-align:center;font-size:.9rem;letter-spacing:.06em}
.why{max-width:72rem;margin:0 auto;padding:6vh 5vw;display:grid;grid-template-columns:repeat(3,1fr);gap:3rem}
.why h3{font-size:1.15rem;margin:0 0 .5rem}.why h3 em{font-style:normal;color:var(--acc)}
.why p{color:#3d4a41;font-size:.95rem;margin:0}
.final{background:var(--acc2);margin-top:4vh;padding:9vh 5vw;text-align:center}
.final h2{font-size:clamp(1.8rem,3.6vw,2.8rem);letter-spacing:-.02em;margin:0 0 1.6rem}
footer{padding:2rem 5vw;font-size:.85rem;color:#6c7a70;max-width:72rem;margin:0 auto}
.join{display:grid;grid-template-columns:1fr 1.4fr auto;gap:.8rem;align-items:end;max-width:44rem;margin:0 auto;text-align:left}
.join label{display:flex;flex-direction:column;gap:.3rem;font-size:.8rem;font-weight:600;color:#3d4a41}
.join input{font:inherit;padding:.8rem 1rem;border:1px solid #b9c7ba;border-radius:.7rem;background:#fff;color:var(--ink);min-height:44px}
.join input:focus{outline:2px solid var(--acc);outline-offset:1px}
.join .btn{border:none;font:inherit;cursor:pointer;min-height:44px}
.join .err{grid-column:1/-1;margin:0;min-height:1.4em;color:#a2402f;font-size:.9rem}
.joined{max-width:44rem;margin:0 auto;font-size:1rem;color:#3d4a41}.joined b{color:var(--ink)}
.again{background:none;border:none;color:var(--acc);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline;padding:.4rem;min-height:44px}
.count{font-size:.85rem;color:#6c7a70;margin:1rem 0 0}
@media(max-width:800px){.join{grid-template-columns:1fr}}
@media(max-width:800px){.hero{grid-template-columns:1fr;padding-top:5vh}.why{grid-template-columns:1fr;gap:2rem}}
${PROV_CSS}
</style></head><body>${partialBanner(mission)}
<nav><span class="logo">${A ? esc(str(A.brand, t.split(/\s+/).slice(0, 2).join(' '))) : t.split(/\s+/).slice(0, 2).join(' ')}</span><a class="cta" href="#join">${A ? esc(str(A.primary, 'Get early access')) : 'Get early access'}</a></nav>
<header class="hero">
  <div>
    <h1>${A ? esc(str(A.headline, subject)) : t}</h1>
    <p>${A ? esc(str(A.sub)) : 'One promise, kept: the thing this page announces, working, in your hands, without the noise the category insists on.'}</p>
    <div class="actions"><a class="btn" href="#join">${A ? esc(str(A.primary, 'Get early access')) : 'Get early access'}</a><a class="ghost" href="#how">${A ? esc(str(A.secondary, 'See how it works')) : 'See how it works'}</a></div>
  </div>
  ${(() => {
    // The hero: the picture generated on the owner's key when there is one,
    // the honest placeholder when there is not.
    const v = Array.isArray(mission.visuals) ? mission.visuals.find((x) => x.slide === 0) : null;
    if (v) return `<div class="vis has-visual"><img class="visual" src="/api/media/${esc(v.id)}" alt="${esc(String(v.prompt).replace(/^.*?Subject: /, '').slice(0, 200))}"></div>`;
    return `<div class="vis"><span>${(mission.patches || []).includes('VAL-PROOF-REAL') ? 'Evidence pending: supplied by the owner' : 'Product still: replace with real capture'}</span></div>`;
  })()}
</header>
<div class="strip">${A ? esc(str(A.strip, 'Built by Prajñā')) : 'Built by Prajñā · copy structured as promise → proof → action · placeholder claims marked for replacement'}</div>
<section class="why" id="how">
${why ? `  <div><h3><em>${why[0].k}</em>, ${why[0].h}</h3><p>${why[0].p}</p></div>
  <div><h3><em>${why[1].k}</em>, ${why[1].h}</h3><p>${proofPatched ? 'Evidence pending: supplied by the owner. This section is deliberately unpopulated until a real case study exists; no invented numbers.' : `${why[1].p} <em>This slot awaits your real case study.</em>`}</p></div>
  <div><h3><em>${why[2].k}</em>, ${why[2].h}</h3><p>${why[2].p}</p></div>` : `  <div><h3><em>Why now</em>, the moment is specific</h3><p>State the shift that makes this possible today and impossible last year. Dated, not vibed.</p></div>
  <div><h3><em>The proof</em>, one real case</h3><p>${proofPatched ? 'Evidence pending: supplied by the owner. This section is deliberately unpopulated until a real case study exists; no invented numbers.' : 'A single concrete before/after beats a wall of adjectives. This slot awaits your real case study.'}</p></div>
  <div><h3><em>The practice</em>, opinionated by design</h3><p>The product makes choices so the user doesn't have to. Name the three it makes.</p></div>`}
</section>
${mission.dissent ? `<aside class="carried-dissent" style="max-width:72rem;margin:0 auto;padding:1.2rem 5vw;font-size:.92rem;color:#3d4a41;border-top:1px solid #c9d3c7"><b>Recorded dissent, ${esc(mission.dissent.model)}:</b> ${esc(mission.dissent.text)}</aside>` : ''}
<section class="final" id="join">
  <h2>${A ? esc(str(A.closing?.h, 'Be first through the door.')) : 'Be first through the door.'}</h2>
  <form class="join" novalidate aria-label="Join">
    <label><span>Your name</span><input name="name" type="text" maxlength="80" autocomplete="name" placeholder="Optional"></label>
    <label><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email" required placeholder="you@example.com"></label>
    <button class="btn" type="submit">${A ? esc(str(A.closing?.cta, 'Join the waitlist')) : 'Join the waitlist'}</button>
    <p class="err" role="alert" aria-live="assertive"></p>
  </form>
  <div class="joined" hidden tabindex="-1" role="status"><b>Thanks.</b> You are on the list. The entry is kept on this device until the house connects this page to a mailbox or a sheet; nothing has been sent anywhere. <button type="button" class="again">Add another</button></div>
  <p class="count" aria-live="polite"></p>
</section>
<footer>${provenance(mission)}</footer>
<script>(${siteRuntime.toString()})();</script>
</body></html>`;
  return { title: `${subject}, Landing page`, kind: 'site', html };
}

/* --------------------------------- ANALYSIS ------------------------------- */

// The analysis's own runtime. A chart you cannot read by pointing at it is
// a picture of a chart. Point at or tab to any point or bar and a readout
// says what it is; the table beneath sorts by any column and marks the
// outlier; the mean line can be shown; the data leaves as a CSV made on the
// page, so a shared copy of this document still carries its numbers.
function analysisRuntime() {
  const DATA = JSON.parse(document.getElementById('app-data').textContent);
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100));
  const readouts = { trend: $('.readout[data-for=trend]'), bars: $('.readout[data-for=bars]') };
  const say = (which, text) => { readouts[which].textContent = text; };
  const idle = { trend: 'Point at a period, or tab to it, to read its value.', bars: 'Point at a bar, or tab to it, to read its value.' };
  $$('circle[data-i]').forEach((c) => {
    const i = Number(c.dataset.i); const v = DATA.series[i];
    const d = i > 0 ? v - DATA.series[i - 1] : null;
    const text = (DATA.labels[i] || 'Period ' + (i + 1)) + ': ' + fmt(v) + (d == null ? '' : ' (' + (d >= 0 ? '+' : '') + fmt(d) + ' on the period before)') + (v === DATA.peak ? ' · peak' : v === DATA.trough ? ' · trough' : '');
    ['mouseover', 'focus'].forEach((ev) => c.addEventListener(ev, () => { say('trend', text); c.setAttribute('r', '6'); }));
    ['mouseout', 'blur'].forEach((ev) => c.addEventListener(ev, () => { say('trend', idle.trend); c.setAttribute('r', '3.5'); }));
  });
  $$('rect[data-i]').forEach((r) => {
    const i = Number(r.dataset.i); const b = DATA.bars[i];
    const share = DATA.barTotal ? Math.round((b.value / DATA.barTotal) * 1000) / 10 : null;
    const text = b.name + ': ' + fmt(b.value) + (share == null ? '' : ' (' + share + '% of the total)') + (i === DATA.outlier ? ' · furthest from the mean' : '');
    ['mouseover', 'focus'].forEach((ev) => r.addEventListener(ev, () => { say('bars', text); r.setAttribute('opacity', '0.75'); }));
    ['mouseout', 'blur'].forEach((ev) => r.addEventListener(ev, () => { say('bars', idle.bars); r.setAttribute('opacity', '1'); }));
  });
  say('trend', idle.trend); say('bars', idle.bars);
  // The mean line, off until asked for.
  const meanLine = $('.mean-line'); const meanBtn = $('.btn-mean');
  meanBtn.addEventListener('click', () => { const on = meanLine.getAttribute('opacity') !== '1'; meanLine.setAttribute('opacity', on ? '1' : '0'); meanBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); meanBtn.textContent = on ? 'Hide the mean (' + fmt(DATA.mean) + ')' : 'Show the mean'; });
  // The table: every row, sortable by any column, the outlier marked.
  const rows = DATA.labels.map((l, i) => ({ label: l || 'P' + (i + 1), value: DATA.series[i], change: i > 0 ? DATA.series[i] - DATA.series[i - 1] : null, i }));
  let sortKey = 'i', sortDir = 1;
  const table = $('table.data');
  const render = () => {
    const sorted = rows.slice().sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    $('tbody', table).innerHTML = sorted.map((r) => '<tr' + (r.value === DATA.peak ? ' class="peak"' : r.value === DATA.trough ? ' class="trough"' : '') + '><td>' + esc(r.label) + '</td><td class="num">' + fmt(r.value) + '</td><td class="num">' + (r.change == null ? '' : (r.change >= 0 ? '+' : '') + fmt(r.change)) + '</td></tr>').join('');
    $$('th', table).forEach((th) => th.setAttribute('aria-sort', th.dataset.key === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'));
  };
  $$('th', table).forEach((th) => th.addEventListener('click', () => { if (sortKey === th.dataset.key) sortDir = -sortDir; else { sortKey = th.dataset.key; sortDir = 1; } render(); }));
  render();
  // The data leaves as a file made here, not fetched from anywhere.
  const csv = 'label,value\n' + rows.map((r) => '"' + String(r.label).replace(/"/g, '""') + '",' + r.value).join('\n') + (DATA.bars.length ? '\n\nsegment,value\n' + DATA.bars.map((b) => '"' + String(b.name).replace(/"/g, '""') + '",' + b.value).join('\n') : '') + '\n';
  const a = $('.btn-csv'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = DATA.file;
}

export function analysisArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  // Owner data when a CSV was attached; otherwise a deterministic sample
  // series from the mission serial, labelled as such.
  const D = mission.data && mission.data.series ? mission.data : null;
  const seedNum = [...mission.serial].reduce((a, c) => a + c.charCodeAt(0), 0);
  const series = D ? D.series.points.map((p) => p.value) : Array.from({ length: 12 }, (_, i) => {
    const base = 42 + ((seedNum * (i + 3)) % 23);
    return Math.round(base + Math.sin(i / 1.7 + seedNum) * 9 + i * 2.1);
  });
  const labels = D ? D.series.points.map((p) => p.label || '') : series.map((_, i) => `P${i + 1}`);
  const n = series.length;
  const max = Math.max(...series.map((v) => Math.abs(v)), 1) * 1.15;
  const mean = series.reduce((a, v) => a + v, 0) / Math.max(1, n);
  const peak = Math.max(...series), trough = Math.min(...series);
  const pts = series.map((v, i) => `${(i / Math.max(1, n - 1)) * 560},${180 - (Math.max(0, v) / max) * 180}`).join(' ');
  const barItems = D && D.segments && D.segments.items.length >= 5
    ? D.segments.items.slice(0, 8).map((s) => ({ name: s.name, value: s.value }))
    : series.slice(-8).map((v, i) => ({ name: labels[n - Math.min(8, n) + i] || `P${i + 1}`, value: v }));
  const bmax = Math.max(...barItems.map((b) => Math.abs(b.value)), 1) * 1.15;
  const outlier = barItems.reduce((best, b, i) => (Math.abs(b.value - (barItems.reduce((a, x) => a + x.value, 0) / barItems.length)) > Math.abs(barItems[best].value - (barItems.reduce((a, x) => a + x.value, 0) / barItems.length)) ? i : best), 0);
  const bars = barItems.map((b, i) => {
    const h = (Math.max(0, b.value) / bmax) * 140;
    return `<rect data-i="${i}" tabindex="0" x="${i * 68 + 8}" y="${150 - h}" width="44" height="${h}" rx="3" fill="${i === outlier ? '#b0472f' : '#28463a'}"><title>${esc(String(b.name))} ${b.value}</title></rect>
<text x="${i * 68 + 30}" y="168" text-anchor="middle" font-size="11" fill="#77837b">${esc(String(b.name).slice(0, 8))}</text>`;
  }).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}, Analysis</title>
<style>
:root{--ink:#182420;--paper:#f7f6f1;--acc:#b0472f;--good:#28463a;--rule:#ddd8cc}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 'Helvetica Neue',Arial,sans-serif}
.wrap{max-width:60rem;margin:0 auto;padding:3.5rem 1.5rem 5rem}
.docline{font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--acc);margin:.3rem 0 1.2rem;padding-bottom:.7rem;border-bottom:2px solid var(--ink)}
h1{font-size:2rem;letter-spacing:-.015em;margin:0 0 .3rem}
.read{font-size:1.05rem;color:#4d564f;max-width:60ch;margin:0 0 2.5rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.panel{border:1px solid var(--rule);background:#fff;padding:1.3rem 1.5rem}
.panel h2{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:#77837b;margin:0 0 1rem;font-weight:700}
.headline{font-size:1.05rem;margin:.8rem 0 0;line-height:1.5}
.headline b{color:var(--acc)}
.caveat{margin-top:2rem;border:1px dashed var(--acc);padding:1rem 1.3rem;font-size:.92rem;color:#6b4438;background:#fbf2ee}
.caveat b{letter-spacing:.1em;text-transform:uppercase;font-size:.75rem}
svg{width:100%;height:auto;display:block}
circle[data-i],rect[data-i]{cursor:pointer;outline:none}circle[data-i]:focus,rect[data-i]:focus{stroke:#b0472f;stroke-width:3}
.readout{margin:.6rem 0 0;font-size:.85rem;color:#4d564f;min-height:1.4em}
.btn-mean{margin-top:.6rem;background:none;border:1px solid var(--rule);border-radius:999px;padding:.35rem .8rem;font:inherit;font-size:.8rem;color:var(--ink);cursor:pointer;min-height:32px}.btn-mean[aria-pressed=true]{border-color:var(--acc);color:var(--acc)}
.table-panel{margin-top:1.5rem}
table.data{width:100%;border-collapse:collapse;font-size:.9rem}table.data th{text-align:left;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#77837b;border-bottom:2px solid var(--ink);padding:.5rem .6rem .4rem 0;cursor:pointer;user-select:none}
table.data th.num,table.data td.num{text-align:right;font-variant-numeric:tabular-nums}table.data th[aria-sort=ascending]::after{content:" ↑"}table.data th[aria-sort=descending]::after{content:" ↓"}
table.data td{border-bottom:1px solid var(--rule);padding:.45rem .6rem .45rem 0}table.data tr.peak td{background:#eef4ef}table.data tr.trough td{background:#fbf2ee}
.table-note{font-size:.8rem;color:#77837b;margin:.8rem 0 0}.swatch{display:inline-block;width:.9em;height:.9em;vertical-align:-.1em;border:1px solid var(--rule)}.swatch.peak{background:#eef4ef}.swatch.trough{background:#fbf2ee}
.btn-csv{color:var(--acc);font-weight:700}
.sr{position:absolute;left:-9999px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
@media print{body{background:#fff}.btn-mean,.btn-csv{display:none}.panel{break-inside:avoid;border-color:#bbb}.readout{display:none}}
${PROV_CSS}
</style></head><body>${partialBanner(mission)}<div class="wrap">
<h1>${t}</h1>
<p class="docline">Prajñā analysis · ${esc(mission.serial)} · ${D ? `data: ${esc(D.name)}, ${D.rows} rows` : 'sample data, marked'}</p>
<p class="read">${authored(mission) ? esc(str(authored(mission).read)) : 'The one-paragraph read: the trend is real, it is concentrated in a single segment, and the obvious explanation is wrong, the driver is mix shift, not performance. Everything below defends that paragraph.'}</p>
<div class="grid">
  <div class="panel"><h2>${D ? `${esc(D.series.column)} · ${n} points${D.series.labelColumn ? ` by ${esc(D.series.labelColumn)}` : ''}` : 'The trend · 12 periods (sample)'}</h2>
    <svg viewBox="0 0 560 190" role="img" aria-label="12-period trend line, rising with a dip mid-series">
      <line class="mean-line" x1="0" x2="560" y1="${180 - (Math.max(0, mean) / max) * 180}" y2="${180 - (Math.max(0, mean) / max) * 180}" stroke="#b0472f" stroke-width="1.5" stroke-dasharray="6 5" opacity="0"/>
      <polyline points="${pts}" fill="none" stroke="#28463a" stroke-width="3" stroke-linejoin="round"/>
      ${series.map((v, i) => `<circle data-i="${i}" tabindex="0" cx="${(i / Math.max(1, n - 1)) * 560}" cy="${180 - (Math.max(0, v) / max) * 180}" r="3.5" fill="#28463a"><title>${esc(labels[i] || '')} ${v}</title></circle>`).join('')}
    </svg>
    <p class="readout" data-for="trend" aria-live="polite"></p>
    <button type="button" class="btn-mean" aria-pressed="false">Show the mean</button>
    <p class="headline">${authored(mission) ? esc(str(authored(mission).trend)) : 'Up and to the right, but the slope <b>halves</b> after period 8. The topline hides it; the segments below explain it.'}</p>
  </div>
  <div class="panel"><h2>${D && D.segments && D.segments.items.length >= 5 ? `By ${esc(D.segments.column)} · ${barItems.length} segments` : D ? `Latest ${barItems.length} points` : 'By segment · latest 8 (sample)'}</h2>
    <svg viewBox="0 0 560 175" role="img" aria-label="Segment bar chart with one outlier segment highlighted">${bars}</svg>
    <p class="readout" data-for="bars" aria-live="polite"></p>
    <p class="headline">${authored(mission) ? esc(str(authored(mission).segment)) : 'One segment (<b>highlighted</b>) moves opposite to the rest. Remove it and the story reverses. That is the finding.'}</p>
  </div>
</div>
<div class="panel table-panel">
  <h2>Every point, sortable</h2>
  <table class="data"><caption class="sr">The plotted series, one row per point. Click a heading to sort.</caption>
    <thead><tr><th scope="col" data-key="i" aria-sort="ascending">Period</th><th scope="col" data-key="value" class="num">Value</th><th scope="col" data-key="change" class="num">Change</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="table-note"><span class="swatch peak"></span> peak · <span class="swatch trough"></span> trough · <a class="btn-csv" href="#" download>Download the data as CSV</a>, made on this page, nothing fetched.</p>
</div>
<div class="caveat"><b>Caveats attached, as promised</b><br>
${authored(mission) ? esc(str(authored(mission).caveat)) + (D ? ` The plotted series is your own data from ${esc(D.name)} (${D.rows} rows); the house has not verified the file beyond parsing it.` : ' The plotted series is illustrative demonstration data, attach a CSV to run this on your real numbers.') : (D ? `The plotted series is your own data from ${esc(D.name)} (${D.rows} rows): ${esc(D.series.column)} summing to ${D.stats.sum}, mean ${D.stats.mean}, range ${D.stats.min}–${D.stats.max}. The reading above is house-scripted sample prose; load a key so a live model reads your numbers.${mission.computed && !mission.computed.none ? ` Computed by the code interpreter: change first to last ${mission.computed.growthPct == null ? 'n/a' : `${mission.computed.growthPct}%`}, peak ${esc(mission.computed.peak)}, trough ${esc(mission.computed.trough)}, mean ${mission.computed.mean}, sd ${mission.computed.sd}${mission.computed.topSegment ? `, top segment ${esc(mission.computed.topSegment)}` : ''}.` : ''}` : 'Sample size in the highlighted segment is small; treat direction as reliable, magnitude as ±40%. The series is illustrative demonstration data, attach a CSV to run this on your real numbers.')}</div>
${provenance(mission)}
</div>
<script type="application/json" id="app-data">${JSON.stringify({ labels, series, bars: barItems, outlier, mean: Math.round(mean * 100) / 100, peak, trough, barTotal: barItems.reduce((a, b) => a + b.value, 0), file: `${String(subject).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'analysis'}-${mission.serial}.csv` }).replace(/</g, '\\u003c')}</script>
<script>(${analysisRuntime.toString()})();</script>
</body></html>`;
  return { title: `${subject}, Analysis`, kind: 'analysis', html };
}

/* ---------------------------------- MOBILE -------------------------------- */

// The app's own runtime. Serialised into the artifact as a function, so it
// is real JavaScript here and real JavaScript there. Everything a user can
// do lives in this one function: navigate, search, open an item, add one,
// mark it done, delete it, change a setting, reset. State is kept on the
// device under the mission's serial and survives a reload. A hash route per
// screen and per item means the phone's Back button does what it should.
function mobileRuntime() {
  const DATA = JSON.parse(document.getElementById('app-data').textContent);
  const KEY = 'prajna-app-' + DATA.serial;
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.items) return v; } catch (e) { /* fresh */ } return null; };
  let state = load() || { items: Object.fromEntries(DATA.screens.map((sc) => [sc.id, sc.items.map((it, i) => ({ id: sc.id + '-' + i, title: it.b, note: it.s, done: false, at: Date.now() }))])), prefs: { theme: 'light' }, seeded: true };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('This browser will not keep data between visits.'); } };
  let toastTimer = null;
  const toast = (msg) => { const t = $('.toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800); };
  const screenOf = (id) => DATA.screens.find((sc) => sc.id === id) || DATA.screens[0];
  const route = () => { const h = location.hash.replace(/^#\/?/, ''); const [sid, sub, iid] = h.split('/'); return { sid: screenOf(sid).id, sub: sub || null, iid: iid || null }; };
  const go = (path) => { location.hash = '#' + path; };
  const applyTheme = () => { document.documentElement.dataset.theme = state.prefs.theme; };

  function renderList(sc, root) {
    const q = (root.dataset.q || '').toLowerCase();
    const items = state.items[sc.id].filter((it) => !q || (it.title + ' ' + it.note).toLowerCase().includes(q));
    const open = items.filter((it) => !it.done), done = items.filter((it) => it.done);
    const row = (it) => '<button class="card" data-open="' + esc(it.id) + '"' + (it.done ? ' data-done="1"' : '') + '><span class="dot"></span><span class="txt"><b>' + esc(it.title) + '</b><span>' + esc(it.note || '') + '</span></span><span class="chev">›</span></button>';
    root.innerHTML = '<h2>' + esc(sc.title) + '</h2><p>' + esc(sc.body) + '</p>'
      + '<label class="search"><input type="search" placeholder="Search ' + esc(sc.plural) + '" value="' + esc(root.dataset.q || '') + '" aria-label="Search ' + esc(sc.plural) + '"></label>'
      + (items.length ? open.map(row).join('') + (done.length ? '<div class="sect">Done · ' + done.length + '</div>' + done.map(row).join('') : '') : '<div class="empty"><b>' + (q ? 'Nothing matches “' + esc(root.dataset.q) + '”' : 'No ' + esc(sc.plural) + ' yet') + '</b><span>' + (q ? 'Try fewer words.' : 'Add the first one with the button below.') + '</span></div>')
      + '<button class="cta" data-add="' + esc(sc.id) + '">' + esc(sc.cta) + '</button>';
    const inp = $('input[type=search]', root);
    inp.addEventListener('input', () => { root.dataset.q = inp.value; const pos = inp.selectionStart; renderList(sc, root); const again = $('input[type=search]', root); again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* fine */ } });
    $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => go(sc.id + '/item/' + b.dataset.open)));
    $('[data-add]', root).addEventListener('click', () => openSheet(sc));
  }
  function renderDetail(sc, root, iid) {
    const it = state.items[sc.id].find((x) => x.id === iid);
    if (!it) { go(sc.id); return; }
    root.innerHTML = '<button class="back" data-back>‹ ' + esc(sc.tab) + '</button><h2>' + esc(it.title) + '</h2><p class="note">' + (it.note ? esc(it.note) : '<i>No note.</i>') + '</p>'
      + '<p class="meta">' + (it.done ? 'Done' : 'Open') + ' · added ' + new Date(it.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + '</p>'
      + '<button class="cta" data-toggle>' + (it.done ? 'Reopen' : 'Mark done') + '</button>'
      + '<button class="cta ghost" data-edit>Edit</button>'
      + '<button class="cta danger" data-del>Delete</button>';
    $('[data-back]', root).addEventListener('click', () => go(sc.id));
    $('[data-toggle]', root).addEventListener('click', () => { it.done = !it.done; save(); toast(it.done ? 'Marked done' : 'Reopened'); go(sc.id); });
    $('[data-edit]', root).addEventListener('click', () => openSheet(sc, it));
    $('[data-del]', root).addEventListener('click', () => { if (!confirm('Delete “' + it.title + '”?')) return; state.items[sc.id] = state.items[sc.id].filter((x) => x.id !== it.id); save(); toast('Deleted'); go(sc.id); });
  }
  function openSheet(sc, it) {
    const sh = $('.sheet');
    sh.innerHTML = '<form class="sheet-body" novalidate><h3>' + (it ? 'Edit ' : 'New ') + esc(sc.noun) + '</h3>'
      + '<label>Title<input name="title" required maxlength="80" value="' + esc(it ? it.title : '') + '" autocomplete="off"></label>'
      + '<label>Note<textarea name="note" rows="3" maxlength="300">' + esc(it ? it.note : '') + '</textarea></label>'
      + '<p class="err" role="alert"></p>'
      + '<div class="row"><button type="button" class="cta ghost" data-cancel>Cancel</button><button type="submit" class="cta">' + (it ? 'Save' : 'Add') + '</button></div></form>';
    sh.classList.add('on'); $('.scrim').classList.add('on');
    const form = $('form', sh); const title = $('[name=title]', form);
    setTimeout(() => title.focus(), 50);
    const close = () => { sh.classList.remove('on'); $('.scrim').classList.remove('on'); };
    $('[data-cancel]', form).addEventListener('click', close);
    $('.scrim').onclick = close;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = title.value.trim(); const n = $('[name=note]', form).value.trim();
      if (!t) { $('.err', form).textContent = 'A title is needed.'; title.focus(); return; }
      if (state.items[sc.id].some((x) => x.id !== (it && it.id) && x.title.toLowerCase() === t.toLowerCase())) { $('.err', form).textContent = 'There is already one called that.'; title.focus(); return; }
      if (it) { it.title = t; it.note = n; toast('Saved'); } else { state.items[sc.id].unshift({ id: sc.id + '-' + Date.now().toString(36), title: t, note: n, done: false, at: Date.now() }); toast('Added'); }
      save(); close(); render();
    });
  }
  function openSettings() {
    const sh = $('.sheet');
    const counts = DATA.screens.map((sc) => '<li><span>' + esc(sc.tab) + '</span><b>' + state.items[sc.id].filter((x) => !x.done).length + ' open · ' + state.items[sc.id].filter((x) => x.done).length + ' done</b></li>').join('');
    sh.innerHTML = '<div class="sheet-body"><h3>Settings</h3><ul class="counts">' + counts + '</ul>'
      + '<label class="switch"><span>Dark theme</span><input type="checkbox" data-pref-theme' + (state.prefs.theme === 'dark' ? ' checked' : '') + '></label>'
      + '<p class="meta">Data lives on this device only. Nothing here is sent anywhere.</p>'
      + '<div class="row"><button type="button" class="cta danger" data-reset>Reset all data</button><button type="button" class="cta" data-close>Done</button></div></div>';
    sh.classList.add('on'); $('.scrim').classList.add('on');
    const close = () => { sh.classList.remove('on'); $('.scrim').classList.remove('on'); };
    $('[data-close]', sh).addEventListener('click', close); $('.scrim').onclick = close;
    $('[data-pref-theme]', sh).addEventListener('change', (e) => { state.prefs.theme = e.target.checked ? 'dark' : 'light'; save(); applyTheme(); });
    $('[data-reset]', sh).addEventListener('click', () => { if (!confirm('Reset the app to its starting data?')) return; try { localStorage.removeItem(KEY); } catch (e) { /* fine */ } location.reload(); });
  }
  function render() {
    const r = route();
    $$('.tab').forEach((b) => { const on = b.dataset.go === r.sid; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    $$('.screen').forEach((el) => {
      const on = el.dataset.screen === r.sid; el.classList.toggle('on', on);
      if (!on) return;
      const sc = screenOf(r.sid);
      if (r.sub === 'item') renderDetail(sc, el, r.iid); else renderList(sc, el);
    });
    document.title = screenOf(r.sid).title + ' · ' + DATA.name;
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('.gear').addEventListener('click', openSettings);
  window.addEventListener('hashchange', render);
  applyTheme();
  if (!location.hash) history.replaceState(null, '', '#' + DATA.screens[0].id);
  render();
}

export function mobileArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const short = t.replace(/^Build a mobile app for (a |an )?/i, '').replace(/^\w/, (c) => c.toUpperCase());
  const A = authored(mission);
  const nounOf = (sc, fallback) => str(sc && sc.noun, fallback).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().slice(0, 24) || fallback;
  const plural = (n) => (/s$/.test(n) ? n : /y$/.test(n) && !/[aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`);
  const screens = (A ? A.screens.slice(0, 4).map((sc, i) => ({ id: `s${i}`, tab: str(sc.tab, `Tab ${i + 1}`).slice(0, 10), title: str(sc.title, i === 0 ? str(A.short, short) : `Screen ${i + 1}`), body: str(sc.body), items: Array.isArray(sc.items) ? sc.items.slice(0, 3).map((it) => ({ b: str(it.b, 'Item'), s: str(it.s) })) : [], cta: str(sc.cta, ''), noun: nounOf(sc, 'item') })) : [
    { id: 'home', tab: 'Home', title: short, body: 'The one thing this app is for, reachable in one tap. Everything else is a tab away.', noun: 'task', items: [{ b: 'First task', s: 'Tap to open it, or add your own.' }, { b: 'Second task', s: 'Search filters as you type.' }, { b: 'Third task', s: 'Mark done from the detail view.' }] },
    { id: 'browse', tab: 'Browse', title: 'Browse', body: 'A scannable list with real hierarchy: title, one line of context, one action.', noun: 'entry', items: [{ b: 'An entry', s: 'One line of context.' }, { b: 'Another entry', s: 'Everything here is editable.' }, { b: 'A third', s: 'Delete from the detail view.' }] },
    { id: 'detail', tab: 'Activity', title: 'Activity', body: 'What happened, when, and what to do next. Empty state written first.', noun: 'note', items: [] },
    { id: 'me', tab: 'You', title: 'You', body: 'Your own list. The settings are behind the dots at the top.', noun: 'reminder', items: [] },
  ]).map((sc) => ({ ...sc, plural: plural(sc.noun), cta: sc.cta && !/^(do the one thing|take the action)$/i.test(sc.cta) ? sc.cta : `Add ${sc.noun}` }));
  const name = A ? str(A.short, short) : short;
  const data = { serial: mission.serial, name, screens };
  const manifest = encodeURIComponent(JSON.stringify({ name, short_name: name.slice(0, 12), display: 'standalone', start_url: './', background_color: '#f7f6f1', theme_color: '#1d5c3a' }));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(name)}">
<link rel="manifest" href="data:application/manifest+json,${manifest}">
<title>${esc(name)}, working app</title>
<style>
:root{--ink:#131a17;--paper:#f7f6f1;--card:#fff;--line:#e3e6e1;--acc:#1d5c3a;--muted:#6b756f;--danger:#a2402f}
:root[data-theme="dark"]{--ink:#eef1ec;--paper:#151a17;--card:#1e2521;--line:#2c3530;--acc:#5fc28f;--muted:#9aa59e}
*{box-sizing:border-box}body{margin:0;background:#dfe3dd;font:15px/1.45 -apple-system,'SF Pro Text','Segoe UI',system-ui,sans-serif;color:var(--ink);display:flex;flex-direction:column;align-items:center;padding:2rem 1rem 3rem;gap:1rem}
h1{font-size:1.05rem;margin:0;color:#3e4842;font-weight:600}
.phone{width:min(390px,94vw);aspect-ratio:390/780;background:#000;border-radius:44px;padding:12px;box-shadow:0 30px 60px rgba(0,0,0,.35);position:relative}
.glass{background:var(--paper);color:var(--ink);border-radius:34px;height:100%;overflow:hidden;display:flex;flex-direction:column;position:relative}
.notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:120px;height:30px;background:#000;border-radius:20px}
.status{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.2rem 0 1.4rem;font-size:.8rem;font-weight:600}
.gear{background:none;border:none;color:var(--muted);font:700 1.1rem inherit;min-height:44px;min-width:44px;border-radius:12px;cursor:pointer}.gear:hover{color:var(--acc)}
.screen{display:none;flex:1;padding:1rem 1.3rem 1.4rem;overflow:auto;-webkit-overflow-scrolling:touch}
.screen.on{display:block}
.screen h2{font-size:1.7rem;letter-spacing:-.02em;margin:1rem 0 .3rem}
.screen p{color:var(--muted);margin:0 0 .8rem}
.search{display:block;margin:0 0 .6rem}.search input{width:100%;min-height:44px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:12px;padding:.6rem .9rem;font:inherit}
.card{width:100%;text-align:left;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:.8rem .9rem;margin:.5rem 0;display:flex;align-items:center;gap:.8rem;min-height:44px;font:inherit;cursor:pointer}
.card:active{transform:scale(.99)}.card[data-done]{opacity:.55}.card[data-done] b{text-decoration:line-through}
.card .dot{width:34px;height:34px;border-radius:10px;background:var(--acc);opacity:.85;flex:none}
.card .txt{flex:1;min-width:0}.card b{display:block;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .txt span{font-size:.8rem;color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .chev{color:var(--muted);font-size:1.3rem}
.sect{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:1rem 0 .2rem}
.empty{border:1px dashed var(--line);border-radius:14px;padding:1.4rem 1rem;text-align:center;margin:.6rem 0}.empty b{display:block}.empty span{font-size:.85rem;color:var(--muted)}
.cta{display:block;width:100%;background:var(--acc);color:#fff;border:none;border-radius:14px;padding:.95rem;font:600 1rem inherit;min-height:44px;margin-top:.8rem;cursor:pointer}
.cta.ghost{background:transparent;color:var(--acc);border:1px solid var(--acc)}.cta.danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
.back{background:none;border:none;color:var(--acc);font:600 1rem inherit;padding:.4rem 0;min-height:44px;cursor:pointer}
.note{font-size:1rem;color:var(--ink)!important}.meta{font-size:.8rem}
.tabs{display:flex;border-top:1px solid var(--line);background:var(--card);padding:.5rem .4rem 1.4rem}
.tab{flex:1;background:none;border:none;font:600 .7rem inherit;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:.3rem;min-height:44px;min-width:44px;padding:.3rem;border-radius:10px;cursor:pointer}
.tab .ico{width:22px;height:22px;border-radius:7px;background:currentColor;opacity:.35}
.tab.on{color:var(--acc)}.tab.on .ico{opacity:1}
.scrim{position:absolute;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s;border-radius:34px}.scrim.on{opacity:1;pointer-events:auto}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--card);color:var(--ink);border-radius:22px 22px 34px 34px;padding:1rem 1.2rem 2rem;transform:translateY(105%);transition:transform .25s;max-height:85%;overflow:auto}.sheet.on{transform:none}
.sheet h3{margin:.2rem 0 .8rem}.sheet label{display:block;font-size:.8rem;color:var(--muted);margin:.6rem 0}.sheet input,.sheet textarea{display:block;width:100%;margin-top:.3rem;min-height:44px;border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:12px;padding:.6rem .8rem;font:inherit}
.sheet .row{display:flex;gap:.6rem}.sheet .row .cta{margin-top:.6rem}.sheet .err{color:var(--danger);font-size:.85rem;min-height:1.2em;margin:.2rem 0}
.switch{display:flex!important;justify-content:space-between;align-items:center;font-size:1rem!important;color:var(--ink)!important;min-height:44px}.switch input{width:auto;min-height:0;transform:scale(1.4);margin:0 .4rem}
.counts{list-style:none;padding:0;margin:0 0 .6rem}.counts li{display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--line);font-size:.9rem}
.toast{position:absolute;left:50%;bottom:6.2rem;transform:translate(-50%,10px);background:var(--ink);color:var(--paper);padding:.5rem .9rem;border-radius:999px;font-size:.85rem;opacity:0;transition:.2s;pointer-events:none}.toast.on{opacity:1;transform:translate(-50%,0)}
.hint{font-size:.8rem;color:#5a655f;max-width:min(390px,94vw);text-align:center}
@media (max-width:480px){body{padding:0;background:var(--paper)}h1,.hint,.carried-dissent{display:none}.phone{width:100%;height:100dvh;aspect-ratio:auto;border-radius:0;padding:0;box-shadow:none}.glass,.scrim{border-radius:0}.notch{display:none}.status{padding-top:max(.6rem,env(safe-area-inset-top))}.tabs{padding-bottom:max(1rem,env(safe-area-inset-bottom))}.prov{display:none}}
${PROV_CSS}
.prov{max-width:min(390px,94vw)}
</style></head><body>${partialBanner(mission)}
<h1>${esc(name)}, working app</h1>
<div class="phone"><div class="glass"><div class="notch"></div>
<div class="status"><span>9:41</span><button class="gear" aria-label="Settings" title="Settings">⋯</button></div>
${screens.map((s, i) => `<section class="screen${i === 0 ? ' on' : ''}" data-screen="${s.id}" aria-label="${esc(s.title)}"></section>`).join('')}
<nav class="tabs" aria-label="Sections">${screens.map((s, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-go="${s.id}"><span class="ico"></span>${esc(s.tab)}</button>`).join('')}</nav>
<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"></div><div class="toast" role="status" aria-live="polite"></div>
</div></div>
${mission.dissent ? `<p class="carried-dissent" style="max-width:min(390px,94vw);font-size:.82rem;color:#3e4842;border-left:3px solid var(--acc);padding-left:.8rem;margin:0"><b>Recorded dissent, ${esc(mission.dissent.model)}:</b> ${esc(mission.dissent.text)}</p>` : ''}
<p class="hint">A working app, not a picture of one: search, open, add, edit, mark done, delete, settings, all live. Data stays on this device. On a phone it runs full screen and can be added to the home screen. It is a web app, not a native build. Built by Prajñā · ${A ? `content written by ${esc(mission.authored.model)}` : 'starting content by the house'}.</p>
<script type="application/json" id="app-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>(${mobileRuntime.toString()})();</script>
${provenance(mission)}
</body></html>`;
  return { title: `${subject}, Working app`, kind: 'mobile', html };
}

/* ------------------------------- DESIGN DRAFT ----------------------------- */

export function designArtifact(mission, base) {
  // A design draft wraps the built deliverable's structure in an annotated
  // wireframe: regions labeled with intent, no final styling promised.
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const A = authored(mission);
  const notes = A ? A.regions.slice(0, 7).map((r) => str(r.note, 'intent, content and state notes live here')) : null;
  const regions = A ? A.regions.slice(0, 7).map((r) => str(r.name, 'Region')) : mission.desk === 'mobile'
    ? ['Status bar', 'Screen title', 'Primary content list', 'Primary action', 'Tab bar (4)']
    : ['Nav + primary CTA', 'Hero: promise + action', 'Proof strip', 'Why now / proof / practice', 'Closing CTA', 'Footer + provenance'];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}, Design draft</title>
<style>
body{margin:0;background:#f2f2ef;color:#222;font:15px/1.5 'Helvetica Neue',Arial,sans-serif}
.wrap{max-width:60rem;margin:0 auto;padding:3rem 1.5rem 5rem}
h1{font-size:1.6rem;margin:0 0 .3rem}.sub{color:#666;margin:0 0 2rem}
.frame{border:2px dashed #9aa;border-radius:8px;padding:1rem;background:#fff;display:grid;gap:.8rem}
.region{border:1px dashed #6a8;background:repeating-linear-gradient(45deg,#f6faf7 0 8px,#eef5f0 8px 16px);padding:1rem;display:flex;justify-content:space-between;align-items:center;min-height:64px}
.region b{font:700 .78rem/1 monospace;letter-spacing:.1em;text-transform:uppercase;color:#2a5}
.region span{font-size:.8rem;color:#667}
${PROV_CSS}
</style></head><body>${partialBanner(mission)}<div class="wrap">
<h1>${t}</h1><p class="sub">Design draft: layout, hierarchy and states decided; no final styling promised. Switch to Build to produce the working deliverable.</p>
<div class="frame">${regions.map((r, i) => `<div class="region"><b>${String(i + 1).padStart(2, '0')} · ${esc(r)}</b><span>${notes ? esc(notes[i]) : 'intent, content and state notes live here'}</span></div>`).join('')}</div>
${provenance(mission)}
</div></body></html>`;
  return { title: `${subject}, Design draft`, kind: 'design', html };
}

export const GENERATORS = {
  brief: briefArtifact, deck: deckArtifact,
  site: (m) => (m.variant === 'design' ? designArtifact(m) : siteArtifact(m)),
  mobile: (m) => (m.variant === 'design' ? designArtifact(m) : mobileArtifact(m)),
  analysis: analysisArtifact,
};
