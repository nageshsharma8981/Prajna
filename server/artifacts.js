// Artifact generators. Every mission ends in one of these — a standalone,
// self-contained HTML document with its own editorial design and a provenance
// footer. Demo-mode content is authored at full fidelity and labeled synthetic
// here (not fabricated commercial claims: all figures are marked illustrative).

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Derive a clean subject line from the user's goal.
export function subjectOf(goal) {
  let s = goal.trim().replace(/[.?!]+$/, '');
  s = s.replace(/^(should we|can we|is|are|what is|what are|state of|build|create|make|design|draft|write|give me|analy[sz]e)\s+/i, (m) => m);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function provenance(mission) {
  const steps = mission.contract.plan.map((p) => `<li>${esc(p.title)}</li>`).join('');
  return `
  <footer class="prov">
    <div class="prov-row"><span>Produced by</span><strong>PRAXIS · ${esc(mission.serial)}</strong></div>
    <div class="prov-row"><span>Desk</span><strong>${esc(mission.deskName)}</strong></div>
    <div class="prov-row"><span>Council</span><strong>${esc(mission.councilNames.join(' · '))}</strong></div>
    <div class="prov-row"><span>Cost</span><strong>${mission.spent.toFixed(1)} credits</strong></div>
    <details><summary>Provenance — how this was made</summary><ol>${steps}</ol>
    <p class="note">Demonstration run: figures and sources below are illustrative sample data, marked throughout.</p></details>
  </footer>`;
}

const PROV_CSS = `
.prov{margin-top:4rem;padding-top:1.5rem;border-top:1px solid rgba(0,0,0,.15);font-size:.85rem;color:#555}
.prov-row{display:flex;gap:1rem;margin:.2rem 0}.prov-row span{width:8rem;color:#999}
.prov details{margin-top:.8rem}.prov summary{cursor:pointer}.prov .note{color:#996;font-style:italic}
@media print {.prov details{display:none}}`;

/* ---------------------------------- BRIEF --------------------------------- */

export function briefArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t} — Decision Brief</title>
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
table{width:100%;border-collapse:collapse;font-size:.9rem;margin:1rem 0}
th{font:700 .72rem/1.3 Verdana,sans-serif;letter-spacing:.1em;text-transform:uppercase;text-align:left;color:#777;border-bottom:2px solid var(--ink);padding:.5rem .6rem .4rem 0}
td{border-bottom:1px solid var(--rule);padding:.55rem .6rem .55rem 0;vertical-align:top}
.dissent{border:1px solid var(--rule);background:#f6efe3;padding:.9rem 1.2rem;margin:1.2rem 0;color:#4c4a44}
.dissent b{font-family:Verdana,sans-serif;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
${PROV_CSS}
</style></head><body><div class="wrap">
<h1>${t}</h1>
<p class="docline">Praxis decision brief · ${esc(mission.serial)}</p>
<p class="stand">A graded-evidence brief: every claim carries its source strength, and the strongest case against the recommendation is included, not buried.</p>

<div class="verdict"><b>The verdict</b>
The council recommends a <strong>staged commitment</strong>: enter with a narrow, reversible first move within two quarters, gated on the two signals in §4. A full commitment now outruns the evidence; standing still concedes the window.</div>

<h2>1 · What the evidence supports</h2>
<p>Three findings survived cross-examination by the full council:</p>
<p><strong>The demand signal is real but younger than the headlines imply.</strong><span class="grade gA">A</span> Primary indicators point the same direction across independent sources; the disagreement is about slope, not sign.</p>
<p><strong>The economics clear the bar only in the focused segment.</strong><span class="grade gB">B</span> Unit economics in the broad market remain marginal; in the narrow segment identified in §3 they clear the threshold with room to spare.</p>
<p><strong>Incumbents are structurally slow here.</strong><span class="grade gB">B</span> The capability that matters is organizationally expensive for incumbents to build; the window is real but not indefinite — the council's median estimate is 18–30 months.</p>

<h2>2 · What the evidence does not support</h2>
<p>Claims commonly made in this space that did not survive grading: that the market is winner-take-all<span class="grade gC">C</span>, that regulation will remain favorable by default<span class="grade gC">C</span>, and that early entrants hold durable data advantages<span class="grade gC">C</span>. Each rests on analogy rather than measurement. The brief refuses them as planning assumptions.</p>

<h2>3 · The narrow move</h2>
<table><thead><tr><th>Move</th><th>Commitment</th><th>Reversibility</th><th>What it buys</th></tr></thead><tbody>
<tr><td>Focused pilot in the identified segment</td><td>Small, time-boxed</td><td>High</td><td>Direct demand measurement, not survey proxy</td></tr>
<tr><td>Partnership before build</td><td>Contractual only</td><td>High</td><td>Distribution learning at near-zero capex</td></tr>
<tr><td>Full build-out</td><td>Large</td><td>Low</td><td>Deferred — gated on §4 signals</td></tr>
</tbody></table>

<h2>4 · Tripwires — when to change your mind</h2>
<p>Commit further only when <strong>both</strong> hold: (1) pilot conversion sustains above the threshold for two consecutive months; (2) the cost curve continues its current decline through the next cycle. If either fails, exit the pilot with learning banked — the position was sized to make that cheap.</p>

<div class="dissent"><b>Recorded dissent — DeepSeek R2</b><br>
One council member argued the staged path underweights speed: in this member's read, the window closes faster than the median estimate, and the pilot's chief risk is being too small to generate the very signals it gates on. The council holds its recommendation but records the dissent; if early pilot data is ambiguous, revisit sizing rather than waiting the full two months.</div>

<h2>5 · Sources & grading</h2>
<table><thead><tr><th>Source class</th><th>Count</th><th>Grade basis</th></tr></thead><tbody>
<tr><td>Primary data & filings <em>(illustrative)</em></td><td>7</td><td>A — direct measurement</td></tr>
<tr><td>Sector analyses <em>(illustrative)</em></td><td>9</td><td>B — triangulated, methodology visible</td></tr>
<tr><td>Press & commentary <em>(illustrative)</em></td><td>12</td><td>C — directional only, never load-bearing</td></tr>
</tbody></table>
${provenance(mission)}
</div></body></html>`;
  return { title: `${subject} — Decision Brief`, kind: 'brief', html };
}

/* ----------------------------------- DECK --------------------------------- */

export function deckArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const slides = [
    { k: 'title', h: t, s: 'The argument in nine slides — one idea per slide, evidence beneath assertion.' },
    { k: 'claim', n: 'The problem', h: 'The status quo has a cost, and it compounds.', s: 'Name the pain precisely: who bleeds, how much, how often. A problem the room already feels needs one slide, not three.' },
    { k: 'claim', n: 'The shift', h: 'Something changed that makes now different.', s: 'Timing is the investor question under every other question. State the enabling shift — technical, regulatory, or behavioral — and date it.' },
    { k: 'big', h: 'One sentence.', s: `${t} — stated so plainly that a skeptic could repeat it back.` },
    { k: 'claim', n: 'The mechanism', h: 'How it works — shown, not adjectived.', s: 'The demo slide. Walk one concrete case end to end. If the mechanism needs three slides, it is not yet understood.' },
    { k: 'claim', n: 'The proof', h: 'Evidence a competitor could not copy-paste.', s: 'Illustrative placeholder: replace with your real traction, pilot results, or signed intent. The deck refuses invented numbers.' },
    { k: 'claim', n: 'The economics', h: 'The unit that makes money, and when.', s: 'One unit, its cost, its price, its payback window. Illustrative placeholder — wire in your model before the room.' },
    { k: 'claim', n: 'The ask', h: 'What you want, what it buys, what it proves.', s: 'A specific amount, a specific runway, and the two milestones that de-risk the next round.' },
    { k: 'end', h: 'The close', s: 'End on the claim, not on “thank you”. Leave the one sentence on screen while you take questions.' },
  ];
  const slideHtml = slides.map((sl, i) => {
    if (sl.k === 'title') return `<section class="slide title"><div><h1>${sl.h}</h1><p class="sub">${sl.s}</p></div><p class="run">Praxis deck · ${esc(mission.serial)}</p><p class="pg">1 / ${slides.length}</p></section>`;
    if (sl.k === 'big') return `<section class="slide big"><div><h2>${sl.h}</h2><p class="sub">${sl.s}</p></div><p class="pg">${i + 1} / ${slides.length}</p></section>`;
    if (sl.k === 'end') return `<section class="slide end"><div><h2>${sl.h}</h2><p class="sub">${sl.s}</p></div><p class="pg">${i + 1} / ${slides.length}</p></section>`;
    return `<section class="slide"><div><h2>${sl.h}</h2><p class="sub">${sl.s}</p></div><p class="run">${sl.n}</p><p class="pg">${i + 1} / ${slides.length}</p></section>`;
  }).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t} — Deck</title>
<style>
:root{--ink:#14140f;--paper:#f4f1e8;--acc:#b0472f}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--ink);font:16px/1.5 'Helvetica Neue',Helvetica,Arial,sans-serif;overflow:hidden}
.deck{height:100%;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth}
.slide{min-width:100%;height:100%;scroll-snap-align:start;background:var(--paper);color:var(--ink);
display:flex;flex-direction:column;justify-content:center;padding:6vh 8vw;position:relative;border-right:2px solid var(--ink)}
.run{position:absolute;bottom:2.2vh;left:3vw;font-size:.75rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--acc);margin:0}
h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:1.04;margin:0 0 1.2rem;letter-spacing:-.02em;max-width:18ch}
h2{font-size:clamp(1.8rem,4.5vw,3.4rem);line-height:1.08;margin:0 0 1.2rem;letter-spacing:-.02em;max-width:22ch}
.sub{font-size:clamp(1rem,1.6vw,1.25rem);color:#54524a;max-width:52ch;margin:0}
.big{background:var(--acc)}.big h2,.big .sub{color:#f8ede8}.big .sub{color:#eed3c9}
.end{background:var(--ink)}.end h2{color:var(--paper)}.end .sub{color:#a5a294}
.pg{position:absolute;bottom:2.2vh;right:3vw;font-size:.75rem;letter-spacing:.1em;color:#98948a;margin:0}
.hint{position:fixed;bottom:2.2vh;left:50%;transform:translateX(-50%);font-size:.75rem;letter-spacing:.08em;color:#98948a;z-index:2}
${PROV_CSS}
.prov{display:none}
</style></head><body>
<div class="deck" id="deck">${slideHtml}</div>
<p class="hint">← → arrow keys · click to advance</p>
<script>
const deck=document.getElementById('deck');let i=0;const n=${slides.length};
function go(d){i=Math.max(0,Math.min(n-1,i+d));deck.scrollTo({left:i*deck.clientWidth,behavior:'smooth'})}
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')go(1);if(e.key==='ArrowLeft')go(-1)});
deck.addEventListener('click',()=>go(1));
</script></body></html>`;
  return { title: `${subject} — Deck`, kind: 'deck', html };
}

/* ----------------------------------- SITE --------------------------------- */

export function siteArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>
:root{--ink:#101c16;--ground:#eef1ea;--acc:#1d5c3a;--acc2:#dbe8d2}
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
.strip{background:var(--ink);color:#c8d4c9;padding:1rem 5vw;text-align:center;font-size:.9rem;letter-spacing:.06em}
.why{max-width:72rem;margin:0 auto;padding:6vh 5vw;display:grid;grid-template-columns:repeat(3,1fr);gap:3rem}
.why h3{font-size:1.15rem;margin:0 0 .5rem}.why h3 em{font-style:normal;color:var(--acc)}
.why p{color:#3d4a41;font-size:.95rem;margin:0}
.final{background:var(--acc2);margin-top:4vh;padding:9vh 5vw;text-align:center}
.final h2{font-size:clamp(1.8rem,3.6vw,2.8rem);letter-spacing:-.02em;margin:0 0 1.6rem}
footer{padding:2rem 5vw;font-size:.85rem;color:#6c7a70;max-width:72rem;margin:0 auto}
@media(max-width:800px){.hero{grid-template-columns:1fr;padding-top:5vh}.why{grid-template-columns:1fr;gap:2rem}}
${PROV_CSS}
</style></head><body>
<nav><span class="logo">${t.split(/\s+/).slice(0, 2).join(' ')}</span><a class="cta" href="#join">Get early access</a></nav>
<header class="hero">
  <div>
    <h1>${t}</h1>
    <p>One promise, kept: the thing this page announces, working, in your hands — without the noise the category insists on.</p>
    <div class="actions"><a class="btn" href="#join">Get early access</a><a class="ghost" href="#how">See how it works</a></div>
  </div>
  <div class="vis"><span>Product still — replace with real capture</span></div>
</header>
<div class="strip">Built by Praxis · copy structured as promise → proof → action · placeholder claims marked for replacement</div>
<section class="why" id="how">
  <div><h3><em>Why now</em> — the moment is specific</h3><p>State the shift that makes this possible today and impossible last year. Dated, not vibed.</p></div>
  <div><h3><em>The proof</em> — one real case</h3><p>A single concrete before/after beats a wall of adjectives. This slot awaits your real case study.</p></div>
  <div><h3><em>The practice</em> — opinionated by design</h3><p>The product makes choices so the user doesn't have to. Name the three it makes.</p></div>
</section>
<section class="final" id="join">
  <h2>Be first through the door.</h2>
  <a class="btn" href="#">Join the waitlist</a>
</section>
<footer>${provenance(mission)}</footer>
</body></html>`;
  return { title: `${subject} — Landing page`, kind: 'site', html };
}

/* --------------------------------- ANALYSIS ------------------------------- */

export function analysisArtifact(mission) {
  const subject = subjectOf(mission.goal);
  const t = esc(subject);
  // Deterministic sample series from the mission serial so re-runs differ.
  const seedNum = [...mission.serial].reduce((a, c) => a + c.charCodeAt(0), 0);
  const series = Array.from({ length: 12 }, (_, i) => {
    const base = 42 + ((seedNum * (i + 3)) % 23);
    return Math.round(base + Math.sin(i / 1.7 + seedNum) * 9 + i * 2.1);
  });
  const max = Math.max(...series) * 1.15;
  const pts = series.map((v, i) => `${(i / 11) * 560},${180 - (v / max) * 180}`).join(' ');
  const bars = series.slice(4).map((v, i) => {
    const h = (v / max) * 140;
    return `<rect x="${i * 68 + 8}" y="${150 - h}" width="44" height="${h}" rx="3" fill="${i === 5 ? '#b0472f' : '#28463a'}"/>
<text x="${i * 68 + 30}" y="168" text-anchor="middle" font-size="11" fill="#77837b">P${i + 5}</text>`;
  }).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t} — Analysis</title>
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
@media(max-width:760px){.grid{grid-template-columns:1fr}}
${PROV_CSS}
</style></head><body><div class="wrap">
<h1>${t}</h1>
<p class="docline">Praxis analysis · ${esc(mission.serial)} · sample data, marked</p>
<p class="read">The one-paragraph read: the trend is real, it is concentrated in a single segment, and the obvious explanation is wrong — the driver is mix shift, not performance. Everything below defends that paragraph.</p>
<div class="grid">
  <div class="panel"><h2>The trend · 12 periods (sample)</h2>
    <svg viewBox="0 0 560 190" role="img" aria-label="12-period trend line, rising with a dip mid-series">
      <polyline points="${pts}" fill="none" stroke="#28463a" stroke-width="3" stroke-linejoin="round"/>
      ${series.map((v, i) => `<circle cx="${(i / 11) * 560}" cy="${180 - (v / max) * 180}" r="3.5" fill="#28463a"/>`).join('')}
    </svg>
    <p class="headline">Up and to the right — but the slope <b>halves</b> after period 8. The topline hides it; the segments below explain it.</p>
  </div>
  <div class="panel"><h2>By segment · latest 8 (sample)</h2>
    <svg viewBox="0 0 560 175" role="img" aria-label="Segment bar chart with one outlier segment highlighted">${bars}</svg>
    <p class="headline">One segment (<b>highlighted</b>) moves opposite to the rest. Remove it and the story reverses. That is the finding.</p>
  </div>
</div>
<div class="caveat"><b>Caveats attached, as promised</b><br>
Sample size in the highlighted segment is small; treat direction as reliable, magnitude as ±40%. The series is illustrative demonstration data — wire a connector (Sheets, Stripe, Linear) to run this on your real numbers.</div>
${provenance(mission)}
</div></body></html>`;
  return { title: `${subject} — Analysis`, kind: 'analysis', html };
}

export const GENERATORS = { brief: briefArtifact, deck: deckArtifact, site: siteArtifact, analysis: analysisArtifact };
