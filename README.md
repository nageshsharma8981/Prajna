# Prajñā: The Outcome Exchange

An agent workspace where every request becomes a **mission with a visible contract**:
the agent states the deliverable, the plan, and the price *before* running, executes
in the open, every step, tool call, and model deliberation streamed live, and ends
with a tangible, versioned artifact.

Built as a direct answer to chat-with-a-spinner agent platforms (Zenith et al.).

## The three refusals (the UVP)

1. **Contract before action.** The house writes an order ticket, full plan, credit
   estimate, hard ceiling, and nothing runs until you stamp it.
2. **Work in the open.** The run deck streams the tape live: tool calls, the model
   panel's positions, challenges, verdict, and recorded dissent, never erased.
3. **Artifacts, not answers.** Every mission ends in a versioned artifact in the
   Artifacts list (decision brief, deck, landing page, analysis) with provenance and cost
   stamped on it. A mission that ends in prose has failed.

## v0.2: the contract made mechanical

- **Event ledger.** Every run event carries a monotonic `seq` (`prajna.event.v1`);
  SSE honors `Last-Event-ID`, and `GET /api/missions/:id/events?after=N` replays
  the ledger. Live view, reconnect, and history are one code path.
- **Settlement.** The ceiling is a reservation: every run ends with
  reserved / settled / released printed on the tape and in the artifact. A live
  burn-down meter shows settled-vs-estimate variance per step.
- **Always an artifact.** Kill a live position or hit the ceiling, the run
  pauses or closes with a *partial artifact*, stamped as such. No terminal state
  ends in nothing.
- **Panel gate.** The panel votes pass / fail / unverifiable per acceptance
  dimension; *unverifiable counts as fail*, and the patch + re-vote that clears
  the gate is on the record.
- **Terminal review.** A reviewer that sees only the goal and the artifact,
  never the run, judges the result; gaps go on the record or void the artifact.
- **Attention queue.** Every mid-run decision (ceiling raise, gap acceptance)
  demands a justification, recorded in the ledger and the artifact. First write
  wins; nothing is silently relabeled to fit the budget.
- **Citation integrity.** Brief references render *only* from sources actually
  cited; an unreferenced claim fails the artifact build.
- **Machine-readable provenance.** Every artifact embeds
  `prajna.provenance.v1`, contract, settlement, gate table, review, decisions,
  honest `mode: "scripted"` label, refreshed at settlement.

## v0.3: perfected after a 100-agent full-app audit

- **Vocabulary rule: world-nouns stay, workflow-verbs go plain.** Open a
  *mission*, *stamp & run*, *stop run*, DONE / STOPPED / HOLDING, *Connectors*
  (not "instruments"), *Missions* (not "the floor"), *Artifacts* (not "ledger"). Tickets, tape, panel, desks, credits are
  unchanged, they explain themselves and carry the world.
- **Real reservations.** Stamping a ticket reserves its ceiling from house
  credits; each cost settles from the reservation; closing releases the rest.
  `credits + reserved + spent` always reconciles to the funded pool, and the
  house refuses to stamp a ticket it cannot fund.
- **Skills shape plans.** A skill on the desk is a plan step on every future
  ticket; take it off and the step disappears from the next contract.
- **Hardened API**: bounded, object-only body parsing; a process-level fault
  guard; catalog-validated desks, models, skills and connectors; validated
  ledger cursors; artifact download.
- **Honest client**: SPA links that never full-reload, palette desk hand-off
  via URL, real void from the missions page, stale deep links get a not-found state,
  live polling keeps every surface current during a run, a two-step stop,
  honest copy on connectors (queued intent, OAuth on the roadmap).
- **Accessibility**: a real radio group for desks, explicit Lead buttons on
  panel chips (no double-click-only path), a modal palette with focus trap
  and announced selection, drawer focus management and `inert`, focus + title
  + scroll reset on route change, a quiet live region instead of a chatty one,
  gate votes as a real table with readable rationale, a pausable ticker.

## v0.4: bring your own keys (BYOK)

- **Your keys** page: Anthropic, OpenAI-compatible (OpenAI, DeepSeek, Groq,
  Together, Ollama… via base URL) and Google Gemini keys: **never saved**: held in
  server memory for the session only, masked in every response, never sent to the browser, gone on restart. **Test** proves
  a key with a real round-trip.
- **Your models**: add any model id your provider serves; it becomes a panel
  seat like a house seat.
- **Live seats**: a seat whose provider has a key goes *live*, its panel
  position on the tape is a real model call (green dot on the chip, "live on
  your key" on the tape). A failed call falls back to the scripted voice and
  the failure is recorded, never hidden.
- **Billing honesty**: live seats bill your provider, so the panel step's house
  cost is reduced pro rata; artifact provenance reports `mode: "hybrid"` with
  per-seat live flags. Tools and artifacts remain scripted until live execution
  ships.

## v0.5: mechanisms adopted from ii-agent (independent implementations, no code copied)

- **Plans are milestone graphs.** Every step declares what it depends on and its
  access class (read / write / external). Independent steps run side by side on
  the tape; the ticket shows "after 2 & 3"; the artifact carries a plan-vs-actual
  diff (planned / done / skipped / not reached).
- **Approval checkpoints.** External steps (a queued connector's "post the
  delivery to Slack") always hold for a signed approval before they run; skip
  drops the step on the record. The contract states up front how many steps
  act outside the workspace.
- **Per-seat panel pricing.** The panel step is priced per seat on the ticket;
  a BYOK seat is priced at 0 house credits ("your key").
- **Amend & re-run.** Fork any finished mission into a new ticket on the same
  desk and panel; its delivery becomes v2 and its provenance names what it
  supersedes.
- `AGENTS.md` records the mandatory rules for changing the engine.

## v0.6: connectors that actually connect

- **Real OAuth sign-in** for Google (one app covers Gmail, Drive, Calendar, Sheets,
  YouTube), Slack, Notion and GitHub: zero dependencies, standard authorization-code
  flow, state-checked callbacks at `/api/oauth/<provider>/callback`.
- **Bring your own provider app**: register an OAuth app once in each provider's
  console, paste its client id/secret under *Your keys* (memory-only, never saved),
  and Connect from the Connectors page. Tokens are memory-only too.
- **Connected sources do work**: every mission's first step prints live, read-only
  evidence lines from each connected source (recent Gmail threads, latest Drive
  files, upcoming Calendar events, Slack channels, recently edited Notion pages,
  recently pushed GitHub repos); Slack/Notion/Gmail also add a delivery step that
  holds for your approval. Failures are printed on the tape, never hidden.
- Sources without a wired provider (Outlook, Linear, Jira, HubSpot, Stripe, Figma,
  X, RSS) say so honestly instead of pretending.

## v0.7: stopping discipline from Zenith (independent implementation)

Studied the Zenith harness (Apache-2.0; report CC BY) and adopted its control
mechanisms without copying code:

- **Definition of done as atomic assertions.** Every ticket carries testable
  promises about the deliverable (`VAL-…`), each owned by exactly one plan step
 , Zenith's two-layer shape: many assertions → fewer work steps.
- **Two independent validator lanes, real checks.** After the artifact exists, a
  *scrutiny* lane and a *surface* lane each prove every assertion against the
  actual HTML (structure, behavior, parseable provenance, cited-only refs, nine
  slides, responsive rules…). No scripted votes.
- **A gate that seals or refuses.** An assertion seals only when both lanes
  pass; lanes disagreeing is *dissent*, no lane covering is *missing*, both
  block. A refused gate raises a decision: **patch & re-validate** (the
  earliest wrong artifact is regenerated and both lanes run again), **accept
  the risk on the record**, or **stop**.
- **Never relabel unfinished scope.** Closure reports sealed / accepted-risk /
  open counts; a mission with open promises closes as *incomplete*, and the
  artifact's provenance carries every verdict.
- **Performance:** gzip on every text response, immutable caching for hashed
  assets, and a lean bootstrap that no longer ships event ledgers to the boards.

## The world

Trading floor / Solari board: split-flap lettering, amber LED dot-matrix telemetry,
color-coded paper order tickets, mono tape logs. Dark "night hall" default; "day
desk" light theme. Full keyboard operation with a ⌘K palette.

## Run it

```bash
cd web && npm install && npx vite build && cd ..
node server/server.js        # http://localhost:3005
```

Dev loop: `cd web && npm run dev` (Vite on 5205, proxying /api to 3005).

## Architecture

- `server/`, zero-dependency Node HTTP server: REST + SSE streaming, JSON-file
  persistence in `data/` (gitignored), mission engine, artifact generators.
- `web/`, React 19 + Vite SPA, hand-written CSS design system in
  `src/styles/app.css`, self-hosted variable fonts (Archivo, Doto, Spline Sans Mono).
- Demo mode ships scripted runs that produce real artifacts; the engine has a seam
  for live model calls when `ANTHROPIC_API_KEY` is present (future work).

## Rollback

Every release is tagged; `stable-v0.1` is a frozen branch of the reviewed v0.1 baseline.

```bash
git checkout v0.1.0          # inspect the baseline
git reset --hard v0.1.0      # roll main back to it (then: git push --force-with-lease)
```

Or run the old version side-by-side without touching main:

```bash
git worktree add ../prajna-v0.1 v0.1.0
```

Data note: `data/` is gitignored runtime state; deleting it reseeds the demo workspace.

## Deploy (Railway)

Live at **https://www.prajñā.com** (punycode `www.xn--praj-jqa0h.com`; the ASCII prajna.com is not ours) and https://prajna-production.up.railway.app, Railway project **Prajna**,
service `prajna`, a persistent volume mounted at `/data` (`PRAJNA_DATA_DIR=/data`),
Nixpacks build via `railway.json` (`npm run build` → `npm start`, health check on
`/api/bootstrap`). Deploys are CLI-driven from this directory:

```bash
railway up --service prajna --detach
```

Custom domain: `railway domain yourdomain.com` prints the CNAME target; add that
record at your DNS host and Railway issues the certificate automatically.
Single process, port from `PORT`, no external services.

## v0.8: Zenith-parity workspace (2026-09-04)

The front end now mirrors the surfaces of agent.ii.inc so every feature has a
home before we make each one better:

- **Chat-first home**, greeting, one composer, mode chips (Website, Mobile App,
  Slide Deck, Research, Analysis), model picker with LIVE / YOURS / PRO badges,
  Model Council (lead + advisers), deck template picker, Fast/Deep research,
  Build/Design variant, attachments and mic.
- **Chats**, every prompt lives in a thread (`/c/:id`); mode prompts turn into
  missions and render a live run card in the thread (steps, cost, Decision
  needed / Open delivery / Watch the tape). Plain chat answers with a live
  seat when a key is loaded and says so honestly when not.
- **Sidebar**, New chat, Plugins, Factory (CLI / Community / Skills / Assets /
  Projects), Boards (beta: Mission board + Tickets & runs), Chats, and the
  footer tools (Connectors, Skills, Tools, Your keys), plan pill and user menu.
- **Boards**, Kanban of every mission plus a task map of each plan by
  dependency depth. **Tools**, Task agent, Media, Browser switches + MCP
  servers. **Connectors**, 50-app catalog with search, categories, Popular
  grid and Connected accounts (Google/Slack/Notion/GitHub run real OAuth).
- **Account**, profile, dashboard, assets, personalization, language,
  subscription tiers (demo billing), invoices, settings, help. **Media**,
  local procedural image/motion studio; hosted models route once a key is
  loaded.
- New desk: **Mobile** (phone-framed artifact) and a **Design** variant for
  website missions.

Server additions live in `server/workspace.js` (chats, projects, plugins,
tools, MCP registry, profile, plan tiers, boards, deck templates, connector
catalog) and the `/api/chats*`, `/api/projects*`, `/api/plugins`, `/api/tools`,
`/api/mcp`, `/api/profile|personalization|language|plan`, `/api/boards`
routes. Keys and OAuth tokens remain memory-only.

## v0.9: Live authoring (2026-09-04)

The first "better than Zenith" move: when the lead seat is live (a BYOK key is
loaded for its provider), the lead model **writes the substance of the
deliverable itself** at the compose / build / design step, brief claims,
verdict and dissent; deck beats; site copy; mobile screens; analysis read and
caveats; design regions. The house lays it out, the two validator lanes gate
it exactly as they gate scripted output, and the provenance block records
`mode: "live"` with the model, character count and latency. No key → scripted
substance, labeled as such. A model reply that misses the required shape is
recorded on the tape and the scripted substance is used instead, nothing is
silently swapped.

Also fixed: two validator surface lanes (deck one-idea, chart accessibility)
were reading the house's own provenance footer as part of the deliverable.
Validators now scan the deliverable body only.

`server/author.js` holds the per-desk shapes and the authoring call.

## v0.10: Streaming chat and real retrieval (2026-09-04)

- **Streaming replies.** Plain chat now streams token by token from the live
  seat over SSE (`POST /api/chats/:id/stream`), for Anthropic, OpenAI-compatible
  and Gemini keys alike. The first message from the home composer is handed
  to the thread so the reply streams there instead of blocking navigation.
- **Real sources for the research desk.** The sweep step retrieves real,
  linked, dated sources from the open Wikipedia API: no key needed. A live
  author cites them by number and the references table links them; the
  scripted brief lists them under "Retrieved reading: not cited" because its
  sample claims were not derived from them. Retrieval success, count and
  latency go on the tape and into the provenance block (`retrieval`).

`server/retrieve.js` holds the retriever; `streamModel` in `server/providers.js`
holds the streaming adapters.

## v0.11: Search key, sources on the panel's table, quality analytics (2026-09-04)

- **Brave Search key (BYOK).** A web-search key on the Your keys page widens
  the research desk's sweep to the live web; the open encyclopedia still runs
  alongside. Memory-only like every key. The tape and the provenance block
  record which engines served each sweep and how many sources each returned.
- **Panel reads the sources.** Live panel seats receive the retrieved sources
  and refer to them by number when they state positions.
- **Quality from the ledger.** The dashboard now computes gate-cleared-first-
  time rate, patched-before-delivery rate, accepted risks, live-authored share,
  estimate variance and per-desk delivery from the mission ledger.

## v0.12: Access gate and share links (2026-09-04)

- **Access gate.** Set `PRAJNA_ACCESS_CODE` on the host (Railway → Variables)
  and every API call needs a session cookie minted by that code; the app shows
  a locked-house screen until it is entered. The cookie is an HMAC of the
  code (HttpOnly, SameSite=Lax, Secure behind TLS, 30 days), so restarts do
  not log anyone out and nothing secret is written to disk. Twelve wrong
  attempts per ten minutes per address. Unset, the house is open (local
  development). Log out clears the cookie.
- **Share links.** Any delivered artifact can be shared at `/s/<token>`,
  public, `noindex`, provenance block included, and revoked at any time from
  the artifact bar. The token lives on the artifact record.

```bash
railway variables --service prajna --set PRAJNA_ACCESS_CODE=your-code
```

## v0.13: Hosted media on your own key (2026-09-04)

The media studio now generates real images on the user's own OpenAI-compatible
key (`gpt-image-1`) or Google key (`gemini-2.5-flash-image`) through
`POST /api/media/generate`. Bytes are kept under the data directory and served
from `/api/media/:id`; the record (prompt, provider, model, size, latency) is on
the workspace ledger and can be deleted. No key → an honest refusal, never a
silent fallback. The local procedural engine remains the keyless option; hosted
video is not wired and the page says so.

## v0.14: Community showcase and the CLI (2026-09-04)

- **Community showcase.** Any fully delivered, unvoided artifact can be
  submitted from Factory → Assets. It goes public at its share link with the
  provenance block intact, the showcase card shows the run mode and how many
  assertions sealed, anyone can clone the prompt into a chat, and the house
  grants 200 credits (a demo grant, recorded on the ledger). Withdraw any time.
- **CLI.** `cli/prajna.mjs`, zero dependencies, Node 22+. `npm link` in the
  repo installs the `prajna` command:

```bash
prajna login https://www.prajñā.com --code <access-code>
prajna run research "Should we enter the EU home-battery market?" --fast
prajna run website "A landing page for a Bengaluru coffee roaster" --auto --out ./deliveries
```

  `run` streams the tape, stops at every decision the house raises (or takes
  the first option with `--auto`, on the record with that justification), and
  saves the delivered artifact. `status`, `tape <mission-id>`, `artifacts` and
  `get <artifact-id>` cover the rest. The session file under
  `~/.config/prajna` holds the workspace URL and the server-minted session
  cookie only, never the access code, never a provider key.

## v0.15: The honesty lane (2026-09-04)

A new assertion on every content desk, `VAL-FIGURES-SOURCED`: in a
live-authored deliverable, every figure (percentages, money, counts with units,
ratios, n=) must trace to the goal or to a retrieved source's text. The
scrutiny lane is strict; the surface lane forgives figures the text itself
labels illustrative, so a labelled example produces dissent, not a silent
pass. Verdicts now carry a detail string (which figures, why) that appears on
the tape and in the decision prompt.

On **patch**, a live author revises its own draft against the gate's finding
(the house never edits authored text); the revision is logged with model,
size and latency, then both lanes run again. If the seat cannot revise, the
draft stands and the gate says so. Scripted substance is house-labelled sample
and is not figure-checked.

## v0.16: Advisers critique the draft; the companion starts missions (2026-09-04)

- **Critique before the gate.** When the lead seat is live, every live
  adviser reads the lead's draft and returns pass or revise with concrete
  issues. One revise sends the lead back once, on the record (`council.critique`
  and `revise` events on the tape; `critiques` in the provenance block). The
  house never edits authored text itself.
- **The companion starts missions.** In plain chat, a live seat may end its
  reply with a `PRAJNA-MISSION: <mode> | <goal>` line when the user clearly
  asks for a deliverable; the house strips it, writes the ticket, launches, and
  drops the run card into the thread. Without a live seat, a plain-language
  request ("build a pitch deck for…") is read directly and started the same way.

## v0.17: Edit the plan before you stamp it (2026-09-04)

An unstamped ticket is editable from the run view: retitle, reorder, remove
or add steps (any house tool, up to twelve). On save the contract is
recomputed, estimate, ceiling, access counts, assertion ownership, and the
edit is recorded on the contract (`contract.edited`: count, added, removed)
and in every artifact's provenance. `PATCH /api/missions/:id/plan` refuses
anything but an OPEN ticket, unknown tools and oversized plans.

## v0.18: Why this plan, and what each step costs (2026-09-04)

Every ticket now shows the cost, access class and approval flag of each step,
the per-seat price on the panel step (live seats on your own key are priced
at 0 house credits, house seats share the panel cost), and a house-written
"Why this plan", a contract-level explanation of depth, variant, removed
skill steps, connector steps and the ceiling rule, plus a one-line rationale
per step. All of it is carried in the provenance block (`contract.why`,
`contract.steps`). Deterministic and honest: the house explains its own
reasoning; it does not ask a model to invent one.

## v0.19: Amend from notes (2026-09-04)

Leave notes on any delivery (artifact view → Notes) and amend with them: the
next version's ticket carries the notes in its lineage, the lead author is
written against them and against its own previous draft, and the artifact's
provenance records the notes it was written to address. A scripted version
records the notes too and says plainly that scripted substance cannot act on
them. `POST/DELETE /api/artifacts/:id/notes`, `POST /api/missions/:id/fork
{feedback: [...]}`.

## v0.20: Brand mark, and your own evidence on the table (2026-09-04)

- **Logo.** The supplied Prajñā mark replaces the split-flap wordmark in the
  sidebar, the locked-house screen and the favicon; "Outcome Exchange" is gone
  from the interface. The PNG's white ground multiplies onto the day paper and
  is inverted-and-screened in the night hall.
- **Attachments are evidence.** Text files attached to a message (txt, md,
  csv, json, html; up to 200k characters) are read in the browser and travel
  as owner-supplied sources: on the table for the lead author and the panel,
  citable in the brief, listed in provenance (`attachments`), and their figures
  count as sourced for the honesty lane. Non-text files are recorded by name
  only and the chip says so.

## v0.21: Sources on the table (2026-09-04)

The ticket now lists every source on the table, owner attachments, Brave web
hits, encyclopedia entries, with engine, link and retrieval date, updating
live as the sweep lands. Numbered references in panel positions and adviser
critiques resolve to those sources on the tape: `[3]` links to source 3, or
names the owner attachment it points to.

## v0.22: The audit bundle (2026-09-04)

`GET /api/missions/:id/bundle` (add `?download=1`, or `?format=json`) returns
one self-contained HTML file carrying a mission's whole record: goal, panel,
mode, contract with per-step cost and rationale, definition of done with both
lanes' verdicts, every human decision with its justification, sources on the
table, adviser critiques, the full tape, settlement, the delivered artifact
embedded in a sandboxed frame, and the machine-readable record
(`prajna.bundle.v1`). The run view has an "Audit bundle" button; the CLI has
`prajna bundle <mission-id>`.

## v0.23: Hardening and the weekly digest (2026-09-04)

- **Rate limits.** Per-address, memory-only, fixed windows: twelve access-code
  tries per ten minutes, sixty public share-link fetches a minute, sixty
  locked-out API calls a minute. Baseline headers on every response
  (`nosniff`, referrer policy, permissions policy, `SAMEORIGIN` framing for
  the app; shared artifacts remain frameable).
- **What changed.** The dashboard opens with a seven-day digest computed from
  the ledger: delivered vs started, credits settled, gate-first-time count,
  live-authored count, amendments, notes left, showcase submissions.

## v0.24: Mobile pass and keyboard polish (2026-09-04)

Promo cards stack below 700px, the greeting, chat thread, run card and plan
editor tighten for small screens, and no page scrolls sideways on a phone.
`/` focuses the composer from anywhere on a page that has one; `⌘K` still
opens the jump palette and `Esc` closes overlays.

## v0.25: Compare versions (2026-09-04)

`/compare/<older>/<newer>` puts two versions of a delivery side by side with
the owner notes that drove the newer one and a ledger comparison, mode,
assertions sealed, validation rounds, patches, accepted risks, sources,
settled cost, delivery time, with differences highlighted. Every superseding
artifact has a "Compare with v(n-1)" button in its bar.

## v0.26: In plain words (2026-09-04)

When a run ends, delivered or stopped, the house writes a narrative from the
tape: what the ticket was, what the sweep found, who on the panel spoke live,
who wrote the substance, what the advisers asked to change, what the gate
refused and what the owner decided (with the justification), ceiling and
approval decisions, the terminal review, settlement against the estimate, and
what was delivered. Deterministic and ledger-backed; no model is asked to
summarise. It lands in the chat thread as a message, sits at the end of the
tape on the run page, and travels in the audit bundle.

## v0.27: Ask the record (2026-09-04)

A thread that started missions can be asked about them. A live seat receives
the mission record in its prompt, narrative, credits, plan, gate rounds and
findings, owner decisions with justifications, authoring mode, critiques,
sources, review, artifact, with the instruction to answer only from it and
to say when it does not say. Without a live seat the house answers
deterministically from the narrative and ledger ("why did this cost more than
the estimate?", "what did the gate refuse?", "which sources?") and labels the
reply "answered from the record".

## v0.28: Decision needed (2026-09-04)

When a run pauses for a decision the tab title starts with "(n) Decision
needed", the sidebar shows a pulsing "Decision needed" item with a count that
opens the run (or the board when several wait), and the top bar carries a
bell. Browser notifications are opt-in under Settings, stored per browser,
and fire only when the tab is in the background. `prajna watch` rings the
terminal bell and prints the prompt, the options and the run URL.

## v0.29: Housekeeping (2026-09-04)

`POST /api/housekeeping {minutes, apply}` lists, and with `apply`, settles,
what the board has stopped caring about: unstamped tickets older than the
window are voided, runs paused on a decision nobody has taken for that long
are stopped, reserves are released, and every action lands on the tape as
such. Dry run by default. The Tickets & runs page has a Housekeeping control
with a confirm step; the CLI has `prajna sweep [--minutes 60] [--apply]`.

## v0.30: First run (2026-09-04)

A fresh workspace opens with a welcome: the three steps (ask for an outcome,
watch it run, take the delivery with its evidence), a one-minute sample that
writes and runs a fast research ticket into a new chat, and a link to load a
key. Dismissed per browser; Get Help brings it back (`/?welcome=1`).

## v0.31: Decisions in the palette (2026-09-04)

Pending decisions sit at the top of the ⌘K palette, serial, kind and the
prompt, so a run waiting on you is one keystroke away from anywhere, and
typing "decide" or a serial filters to them.

## v0.32: Seats at stamping (2026-09-04)

An unstamped ticket now shows seat health: each seat marked live on your key
or house voice, a plain sentence about what that means for the substance, and
a link to load the missing provider key. No surprises after stamping.

## v0.33: What your keys save (2026-09-04)

The panel step records the house price per seat; a live seat is priced at 0.
The ticket tally shows "Saved by your keys" for any run with live seats, and
the dashboard totals it across the board, the value of bringing your own
keys, in house credits, from the ledger.

## v0.34: Fresh-eyes pass (2026-09-04)

A first-visit walk through the live site at desktop width. One flaw found and
fixed: the promo cards overlapped the welcome card's corner; with the welcome
showing they now sit in a row above it. Home, missions, artifacts and the
console were otherwise clean.

## v0.35: Status page and health (2026-09-04)

`/status` is a public, never-secret page: version, uptime, runs live and
paused, deliveries, last delivery time, data-directory health and memory.
`/api/health` is the machine-readable form. Both stay reachable when the
house is locked, and are rate-limited like the other public routes. Linked
from Settings.

## v0.36: The credit ledger (2026-09-04)

Every movement of house credits is now a line the owner can read back:
reserve on stamping, settlement and release on closing, ceiling raises, plan
grants, showcase grants and top-ups, each with the balance and reserve after
it. Payment & Invoices shows the ledger and offers demo top-ups (an honest
line, no charge); Subscription opens with a plain explanation of what a
credit is and how estimate, ceiling, settlement and live seats relate.

## v0.37: The tape moves to its own file (2026-09-04)

A finished mission's event ledger is archived to `data/tape/<id>.json`
(`prajna.tape.v1`) and the mission record keeps only the count, so the main
missions file stays small and every event flush during a run stays cheap.
Readers that need the events, the run view, replay, the bundle, the record
digest, load the full mission on demand. Existing finished missions are
archived once on boot. Nothing is lost: the tape is the same events, in the
same order, with the run script beside them.

The profile is the visitor's own: no seeded name or email. The greeting says
"Hey there" until a name is given (the first-run welcome asks), the sidebar
shows "Set up your profile" until then, email is editable and validated
under My Profile, and the brand mark sits in the top bar on small screens
where the sidebar is a drawer.

## v0.38: Share the record (2026-09-04)

A finished mission's whole record, the audit bundle with contract, tape,
decisions, sources, settlement and the embedded artifact, can be shared at a
public, `noindex`, revocable link (`/r/<token>`) from the run view, alongside
the download. Unstamped tickets have no record to share. The profile page
nudges for a name while the house does not know one.

## v0.39: Status history (2026-09-04)

The status page and `/api/health` carry seven days of history: runs started,
delivered and stopped per UTC day, and the incidents the house records about
itself, retrieval failures and live seats that could not author. Nothing is
inferred; every count comes from the mission ledger.

## v0.40: The daily digest, by your own Gmail (2026-09-04)

`GET /api/digest` writes the last 24 hours in plain words from the ledger,
started, delivered, stopped, credits settled, gate-first-time, live-authored,
runs waiting on a decision, incidents, deliveries, balance. `POST
/api/digest/send` sends it through the owner's connected Google account
(`gmail.send` scope added to the Google connector) to the profile email; with
no token in memory it says so and sends nothing. Settings offers "Send now"
and an opt-in "every morning at 08:00 UTC while the server holds a Google
token", tokens are memory-only, so a restart means reconnecting.

## v0.41: What the house can and cannot do yet (2026-09-04)

Get Help opens with one honest list: what the house does today and what it
does not do yet, scripted substance without a key, sample chart series,
no hosted video, demo billing, one workspace per house, memory-only keys and
tokens, and which connectors are live versus catalogue entries.

## v0.42: Your data on the analysis desk (2026-09-04)

Attach a CSV to an analysis mission and the charts plot it: the first numeric
column is the series (labelled by the first text column), a second text
column becomes the segment breakdown, and the ingest step says on the tape
exactly what it parsed, rows, columns, series and segments. The live author
and the panel get the numbers in their prompt; the artifact names the file
and carries the profile in provenance (`data`). No CSV → the house sample
series, labelled as such, as before.

## v0.43: Data in the brief (2026-09-04)

A CSV attached to a research mission appears in the brief as "Data on the
table": the file, its shape, the series with sum, mean and range, the segment
breakdown, and the first rows, parsed, not verified, and marked as owner
data. The author gets the same summary in its prompt; figures that trace to
the file pass the honesty lane.

## v0.44: Accessibility pass (2026-09-04)

Measured contrast on the surfaces added today. The amber that reads on the
night hall was far below AA on day paper for the decision cues and the bell;
they now take a darker amber by day. The disclaimer steps up a shade. The
logo link and the hidden file input carry accessible names.

## v0.45: Keyboard-only decision walk (2026-09-04)

Verified without a mouse: ⌘K opens the palette with the pending decision
first, Enter opens the run, the justification field takes focus and text,
Tab lands on the first option, and the option is a native button that Enter
or Space activates in any browser. The test harness cannot emit native button
activation, so that last step was completed by click; everything before it
was driven by keys alone.

## v0.46: Release notes in the app (2026-09-04)

`/releases` lists every version the house has shipped, newest first, parsed
from this README (`GET /api/releases`), with the running version at the top.
Linked from Get Help and the ⌘K palette.

## v0.47: Lighter first load, Escape everywhere (2026-09-04)

The secondary views, run, account, boards, factory, connectors, tools,
media, artifacts, compare, releases, skills, keys, now load on demand, which
takes the first script from 104 KB to 76 KB gzipped; the home, chat and
sidebar stay in the first chunk. In the composer, Escape closes whichever
overlay is open, model picker, depth menu, council, templates.

## v0.48: Ten at once (2026-09-04)

Verified under load: nine missions launched together (a tenth was refused
because the house could not fund its ceiling, the right answer), all nine
delivered, and afterwards the reserve returned exactly to its starting value,
the spent delta equalled the sum of the nine settlements, every tape was
archived, every narrative written, and the ledger held two lines per mission
plus one per ceiling raise. No code changed; this is the record of the check.

## v0.49: Plain words, plain cards (2026-09-04)

Owner feedback, applied everywhere: the black code labels that overlapped
the desk titles are gone and each card is titled by what it delivers
(Decision brief, Slide deck, Landing page, Mobile app prototype, Metrics
dashboard); "Order pad" is now "Write a ticket"; every em dash in the
interface, the artifacts, the tape and these notes became a colon, comma or
full stop; "seat" became "model" wherever a person reads it; and the
"Decision needed" sidebar item and bell are removed, pending decisions stay
reachable from the run card, the board and the palette.

## v0.50: Restart under load (2026-09-04)

Verified: four missions launched, the server killed mid-run and started
again. It rehydrated every in-flight mission from the persisted run script,
all four finished, the reserve returned exactly to its starting value, the
spent delta equalled the four settlements, every tape archived with
contiguous sequence numbers, and every narrative was written. No code
changed; this is the record of the check.

## v0.51: The house rules (2026-09-04)

Terms and Conditions, a Privacy and GDPR Policy and an AI Disclaimer, written
to be explicit: eligibility, the access code, your content and your keys,
acceptable use, credits and demo billing, outputs and no reliance, third-party
services, public links, warranties disclaimed, liability capped, indemnity,
governing law (India, courts at Bengaluru), and for privacy the data
collected, legal bases, cookies, processors, transfers, retention, GDPR and
DPDP rights, security, children and automated decisions. They are public at
/legal/terms, /legal/privacy and /legal/ai, versioned, and must be accepted
together on an acceptance screen before the workspace opens; nothing that
changes the workspace runs until then (403 with consentRequired). The
acceptance is recorded with version, time, name if given, address and agent.
A new version asks again. The CLI has "prajna accept". These documents were
drafted without legal counsel and should be reviewed by one before relying on
them.

## v0.52: Connectors and plugins that do the work (2026-09-04)

A connected app now does two real things on a mission. At the first step it
gathers what it knows about the goal onto the sources table: Gmail messages
(subject, sender, date, snippet), Drive files with the text of Google Docs,
Calendar events, Slack messages, Notion pages with their text, GitHub issues.
At the delivery step, after your approval, it delivers: a Slack post to the
channel you set, a Notion page under the parent you set, a Gmail draft to
your profile email, a GitHub issue in the repository you set, each with its
id or URL on the tape, in provenance ("deliveries") and in the narrative.
Targets are set on the Connectors page. Plugins now name their real effect
and carry a WIRED or INTENT badge: Claude Skills puts skill steps on tickets
(off removes them); Web search makes the sweep use a Brave key; Code
interpreter computes change, peak, trough, mean, spread and top segment over
an attached CSV at the analyze step; Documents reads attached Word,
PowerPoint and Excel files as evidence. Codex delegate, Browser and Claude
Code coordination record intent only, and say so. For tests, API hosts can
be redirected with PRAJNA_API_BASE_<PROVIDER> and tokens seeded with
PRAJNA_TEST_TOKENS; neither is set in production. Set PRAJNA_PUBLIC_URL on
the host so delivered links point at the public address.

## v0.53: Connector evidence counts (2026-09-04)

Figures that trace to evidence a connected app put on the table now pass
the honesty lane in full, the first-run welcome adds "Bring your apps", and
a leftover import is gone.

## v0.54: An honest catalogue (2026-09-04)

Connector cards now say what they are: "Connected", "Connect" when the
provider's OAuth app is registered, "Set up app" when sign-in is wired but
the app is not yet registered, and "Not wired yet" for catalogue entries
with no sign-in behind them. Nothing pretends to connect.

## v0.55: Tools that switch something (2026-09-04)

The three switches under Tools now change behaviour and say so. Task Agent
on: the companion may start a mission from conversation (a live model's
directive, or a plain-language request without a key); off: it only talks
and says why. Media Generation off: the media studio refuses to generate and
says so. Browser: no headless browser exists inside the house; the switch
records intent and the card says so.

## v0.56: The deck carries the dissent (2026-09-04)

When the panel records a dissent, the closing slide carries it, named and
quoted, and a new deck assertion (VAL-DISSENT-CARRIED) fails the gate if a
recorded dissent is missing from the deliverable. The dissent is on the
mission record and in provenance, so the brief and the deck can no longer
quietly drop what an adviser refused to accept.

## v0.57: Every deliverable carries the dissent (2026-09-04)

The landing page (above the closing call to action) and the mobile prototype
(beneath the phone) now carry a recorded dissent, named and quoted, and the
same assertion that guards the deck guards them: a recorded dissent that is
missing from the deliverable fails the gate.

## v0.58: Handover (2026-09-04)

A finished run shows a handover block at the end of its tape: the artifact
and its public link if shared, the audit bundle and the public record link
if shared, and every connector delivery with where it went, its id and a
link, or the recorded failure. Everything that left the house, in one place.

## v0.59: Deliveries that point somewhere (2026-09-04)

A connector delivery now points at a public, revocable link to the artifact
rather than a workspace page a recipient could not open. The approval prompt
says so before you approve. The artifact is produced ahead of the delivery
step when it does not exist yet (validation still follows and the same
artifact is refreshed, never duplicated), and when PRAJNA_PUBLIC_URL is set
the house fetches the link before sending and records whether it resolved,
on the tape, in provenance and in the handover block.

## v0.60: The revoke trail (2026-09-04)

Revoking an artifact's public link after a connector delivered it now marks
every such delivery on the mission with the time of revocation, records the
revocation on the mission, carries it in provenance, and the handover block
says the recipient's link is dead. Sharing again mints a new token; the old
link stays dead.

## v0.61: Deliver again (2026-09-04)

A delivered mission can be delivered again from its handover block: a fresh
public link to the artifact is made (revocable), checked when a public host
is set, and sent to the apps that delivered before, or to any connected app
if none did. Each re-delivery is recorded on the mission, marked "again" in
the handover, and carried into provenance. `POST /api/missions/:id/redeliver`
accepts an optional list of connectors.

## v0.62: Amendments reach the same recipients (2026-09-04)

Amending a mission that delivered through connected apps queues delivery
steps for exactly those apps on the new ticket (a parent that delivered
nowhere queues every connected app, as before), records them in the new
ticket's lineage, and the delivery text says which version it is and what
it supersedes, so a v2 never strands recipients on v1.

## v0.63: One page per deliverable (2026-09-04)

A new version or a re-delivery no longer scatters copies. Notion: the page
the earlier delivery created is retitled and the new version appended
beneath a dated heading. Slack: the post lands in the earlier thread. GitHub:
a comment on the earlier issue. Gmail drafts stay one per delivery. The
earlier delivery is found on the same mission or up the lineage chain, and
the handover names where the update went.

## v0.64: What left the house (2026-09-04)

The Connectors page lists every delivery that ever went out through a
connected app, per app, newest first: the mission, when, where it landed,
its id or link, whether it was a re-delivery, and whether the public link it
carried still resolves or was revoked. Nothing leaves the house without a
place it can be seen.

## v0.64.1: The logo reaches the live site (2026-09-04)

The deploy ignore file excluded every PNG, a rule older than the logo, so
the live site fell back to the app shell for /logo.png and the acceptance
screen showed a broken image on phones. Fixed; the mark, the square mark and
the favicon now ship.

## v0.65: The deploy checks itself (2026-09-04)

`npm run check -- https://www.prajñā.com` (scripts/postdeploy-check.mjs)
fetches every path the app depends on, the shell, logo, marks, favicon,
fonts, health, session, legal pages and status, plus the hashed bundle the
shell references, and fails on any wrong status or content type. Run after
every deploy; it would have caught the missing logo the moment it happened.

## v0.66: The house check (2026-09-04)

Settings → House check runs real tests and shows every row: the data
directory is writable, every archived tape and every artifact file exists,
the reserve equals the in-flight ceilings, the house rules are accepted at
the current version, each connected token still answers, and the last
delivered public link resolves. The status page shows when it last ran and
how many rows passed. `POST /api/housecheck`.

## v0.67: The house checks itself (2026-09-04)

The house check now runs a minute after boot and once a day after that,
without anyone pressing Run. A failing row is logged, named in the daily
digest email, and shown as a notice at the top of Home with a link to the
detail under Settings. The bootstrap payload carries the last result.

## v0.68: The house repairs what it can (2026-09-04)

Settings → House check → Repair. A missing artifact file is regenerated
from the mission record, a lost tape is re-archived when its events are
still in the ledger, and a drifted reserve is reconciled to the in-flight
tickets with a ledger line saying what moved. What only a person can fix,
the house rules or a refused token, is named with where to do it. The
check runs again afterwards so the result shows the house as it now
stands. `POST /api/housecheck/repair`.

## v0.69: Standing orders (2026-09-04)

A delivered ticket can repeat itself. Choose every day or every week on
the run page and press Repeat; each run is a new version in the same
lineage, stamped and reserved like any other, delivered again to the apps
the parent delivered to. When the balance cannot cover the ceiling the run
is skipped and the reason recorded, never silently dropped. Manage orders
under Settings: run now, pause, resume, stop. `GET /api/standing`,
`POST /api/missions/:id/standing`, `POST /api/standing/:id/run|pause`,
`DELETE /api/standing/:id`.

## v0.70: The CLI keeps pace (2026-09-04)

`prajna repeat <mission-id|serial> [daily|weekly]` makes a delivered ticket
a standing order; `prajna standing` lists orders and `prajna standing
run|pause|resume|stop <order-id>` manages them. `prajna check` runs the
house check and exits non-zero on any failing row, so it can sit in a
cron; `prajna repair` puts right what the house can and checks again.
