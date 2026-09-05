# Prajñā

A contract-first agent workspace. Every request becomes a ticket that states the
deliverable, the plan and the price before anything runs; the run happens in the
open, every step, cost and model position on a tape; and every run ends in a
versioned artifact that carries its own evidence. Live at
[www.prajñā.com](https://www.xn--praj-jqa0h.com).

Built as a direct answer to chat-with-a-spinner agent platforms such as Zenith,
first cloned feature for feature, then taken further. Seventy releases in a day,
each one verified on a side instance before it shipped; the list is below and on
the site's release-notes page.

## What the house guarantees

- **Contract before action.** The ticket shows the plan, the estimate and a hard
  ceiling, with a "why this plan" and per-step pricing. Nothing runs until you
  stamp it; the ceiling is a reservation that settles and releases on the ledger.
- **Work in the open.** The tape streams every step, tool call, model position,
  critique, gate verdict and cost, with a monotonic sequence and replay.
- **Artifacts, not answers.** Every run ends in a versioned artifact with
  provenance stamped in: who wrote what, which sources, what was sealed, what
  you decided, what it cost. Dissent is carried into the deliverable, not erased.
- **Honesty lanes.** Validators check that figures are sourced, references are
  cited only, verdicts come first, dissent is recorded; an unverifiable claim
  fails the gate, and every patch is on the record.
- **Decisions with justification.** A ceiling raise, a gap accepted, a gate
  overridden: each needs a written reason that travels with the artifact.
- **Delivery that is checked.** Connected apps put what they know on the table
  and receive the delivery with a public link the house verifies, revokes on
  request and re-sends on amendment; the handover block shows where everything
  went.
- **Standing orders.** A delivered ticket repeats daily or weekly under a
  monthly cap; each run is a new version that says what changed since the last.
- **A house that looks after itself.** A daily house check with repair, daily
  backups kept seven deep, take-your-data export, restore, and erase; a status
  page and a regression suite the deploy refuses to skip.
- **Keys are never saved.** Bring your own keys and OAuth apps; they live in
  memory only, masked in the API, gone on restart.
- **Rules first.** Terms, Privacy and GDPR, and an AI disclaimer must be
  accepted before the workspace does anything; the export and erasure they
  promise exist.

## Against Zenith, in one table

| | Zenith | Prajñā |
|---|---|---|
| Before a run | a prompt | a ticket: plan, estimate, ceiling, why |
| During a run | a spinner and a summary | the tape: every step, cost, position, verdict |
| After a run | an answer in chat | a versioned artifact with provenance and settlement |
| Disagreement among models | invisible | recorded and carried into the deliverable |
| Budget | none visible | reserved, settled, released, on a ledger you can read |
| Recurrence | scheduled tasks | standing orders with a monthly cap and a since-last-run delta |
| Your data | in their account | export, restore, erase and daily backups in your own house |
| Keys | stored | never written to disk |

## Run it, test it, ship it

```bash
npm run build            # installs web deps and builds the SPA
npm start                # http://localhost:3005
npm test                 # thirteen tests on a fresh instance, about half a minute
npm run check -- https://www.xn--praj-jqa0h.com   # post-deploy self-check
```

Environment: `PORT`, `PRAJNA_DATA_DIR`, `PRAJNA_PUBLIC_URL`, `PRAJNA_ACCESS_CODE`
(optional lock), `PRAJNA_API_BASE_<PROVIDER>` (test overrides). Deploys go to
Railway with `railway up --service prajna`; each release is tagged.

The CLI (`cli/prajna.mjs`, `npx prajna`) covers login, run, status, tape,
artifacts, bundle, watch, sweep, accept, repeat, standing, check, repair,
export, import, backup and backups.

## Architecture

- `server/`: a zero-dependency Node 22 HTTP server. REST plus SSE streaming,
  JSON files under `data/` written atomically, the mission engine with a
  persisted run script that survives restarts, validators, live authoring
  through your own keys, connectors, legal, export and backups.
- `web/`: React 19 with Vite, a hand-written router and store, one stylesheet
  as the design system, self-hosted fonts, lazy views.
- `test/`: `node --test`, no framework, boots the real server.

## The world

Trading floor / Solari board: split-flap lettering, amber LED dot-matrix telemetry,
colour-coded paper tickets, mono tape logs. Dark "night hall" default; "day
desk" light theme. Full keyboard operation with a ⌘K palette.

## Releases

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

## v0.71: Standing orders under control (2026-09-04)

A standing order can carry a monthly cap: the most it may settle in any
30 days. A run whose ceiling would break the cap is skipped, its ticket
voided, and the reason recorded, so recurring spend can never run away.
The house check gains a standing-orders row that catches an order whose
ticket is gone or that is overdue by more than an interval; repair pauses
the orphans. `prajna repeat … --cap N`.

## v0.72: Since last run (2026-09-04)

A version now says what changed against its parent, read straight off
the two records rather than written by a model: credits settled against
last time, whether the gate cleared first time or took patches, sources
added and dropped, dissent carried or not, artifact length, where it was
delivered, and the notes that drove the change. It sits on the run page
above the narrative, with a link to the two versions side by side. A
standing-order run reads it as "what is new this week".
`GET /api/missions/:id/delta`.

## v0.73: The delta travels with the record (2026-09-04)

What changed since last run now goes wherever the record goes: the audit
bundle carries it as a section, the public record page with it, the
digest names it against each delivered version ("v2 of PJ-4483: 22.9 cr
more; 2 new sources"), and asking the record "what changed since last
time?" answers from the same figures. A first version says plainly that
it has nothing earlier to compare with.

## v0.74: The house tests itself (2026-09-04)

`npm test` boots a fresh instance on a scratch directory and drives it
through the API the way the owner and the CLI do: the shell and marks,
the consent gate, the seeded house, the house check and repair, a ticket
written, launched, run to delivery and settled within its ceiling with
provenance in the artifact, share links opened and revoked, standing
orders with cap, pause, orphan and stop, the delta of an amendment, the
digest and the status page. Nine tests, zero dependencies, about half a
minute. The deploy runs them first and refuses a red build. Writing the
suite found that the house check and repair routes sat above the consent
gate; they now sit below it.

## v0.75: Take your data, erase your data (2026-09-04)

The Terms and the Privacy Policy promised an export from Settings; now it
exists. Settings → Take your data downloads the whole workspace as one
zip, written without any dependency: every mission with its tape, every
artifact with its provenance, chats, notes, the credit ledger, media,
standing orders and the consent record, all plain JSON and HTML. Keys and
tokens are never in it. Settings → Erase this workspace, behind a typed
ERASE, stops live runs, removes every file and seeds a fresh house,
keeping only the version and time of the rules acceptance as proof. The
policies say so (rules version 2026-09-04.2). `prajna export [--out dir]`.
Two more tests cover both.

## v0.76: Move house (2026-09-04)

An export goes back in whole. Settings → Restore from an export takes a
Take-your-data zip and replaces the workspace with it, behind a typed
REPLACE: missions with their tapes re-archived, artifacts, chats, notes,
ledger, media, standing orders. Runs that were live when the export was
taken close as interrupted, since run scripts do not travel; keys and
tokens never travel and are loaded again after. So a house can move from
a laptop to a server, or come back from a backup, with the record intact.
`prajna import <zip> --replace`. A test exports, erases and restores.

## v0.77: The house keeps its own backups (2026-09-04)

Five minutes after it starts, and once a day after that, the house writes
its own export to the data directory and keeps the last seven. The house
check gains a backups row that fails when the latest is missing, older
than 36 hours or unreadable. Settings lists them with Download and
Restore (typed REPLACE); backups survive an erase, so a mistaken erase has
a way back. `prajna backup`, `prajna backups`. A test writes one, checks
its health, erases the house and restores from it.

## v0.78: The front page tells the truth (2026-09-04)

The README opens with what the house is after seventy releases, what it
guarantees, how it stands against Zenith in one table, and how to run,
test and ship it; the stale sections on running, architecture and rollback
are gone. The last traces of "outcome exchange" left the stylesheet, the
author prompt, the retrieval user agent and the CLI header.

## v0.79: The house on a phone (2026-09-04)

A mobile pass over Home, a delivered run and Settings. Settings was the
casualty: the account body ran wider than the screen and the digest row
squeezed its text to one word per line. On narrow screens a board row now
wraps, the sym and the text on one line, the actions on the next, under
the text, and action groups wrap too; the gate table scrolls inside its
own box instead of pushing the page. Checked at 375 pixels wide with no
horizontal overflow.

## v0.80: The rest of the house on a phone (2026-09-04)

The phone pass reached Connectors, Plugins, Keys, Tools, Media, the
welcome card, chat mode, the assets list, an artifact page, the legal
pages and the status page. Two needed work: the artifact bar, whose title
and meta line collapsed to one word per line beside the buttons at any
width under about 900 pixels, now takes a full line with the buttons
wrapping beneath; and the keys page's OAuth callback address now breaks
instead of running off the edge. Everything else measured clean at 375
pixels. (v0.80.1 widened the bar fix from phones to tablets.)

## v0.81: Reachable by keyboard and screen reader (2026-09-04)

An accessibility pass over Home, a run, Settings, Connectors and Keys:
every control has an accessible name, every input a label, every image
alt text, the document a language, focus is visible and reduced motion
is honoured; that was already so. Two gaps closed: a skip link is now the
first thing a keyboard reaches and jumps to the main landmark, and the
run page's ticket goal is its top-level heading.

## v0.82: The Browser tool reads pages (2026-09-04)

The Browser switch under Tools said "not wired yet". Now it is wired the
honest way: with it on, any web address named in a ticket is read
server-side at the research step, no scripts run, one megabyte and eight
seconds per page, three pages at most, never a private address, and each
page goes on the table as a source with its title, address, date read and
word count, for the author to cite like any other. The read is on the
tape, including any page that could not be read and why. A test names a
page in a ticket and finds it among the sources after delivery.

## v0.83: The companion reads what you paste (2026-09-04)

With the Browser tool on, an address pasted into a conversation is read
the same way a ticket's is: the page is fetched server-side under the
same limits, recorded on your message as "Read: title · words" with a
link, and handed to the live model as material it may quote and must cite
by title. Without a model key the house still reads the page and quotes
its opening, and says plainly that it can quote but not discuss. A page
that cannot be read is named with the reason. The tool's descriptions no
longer speak of a browser session the house never had.

## v0.84: Pages on the table before stamping (2026-09-04)

With the Browser tool on, the pages a goal names are now read when the
ticket is written, not at the research step, so they sit on the table
with their title, address and word count before the owner stamps and
pays; the ticket lists them beside any attachments. The research step
reads only what is not already there, and a page is never counted twice.
The same holds for tickets started from a conversation.

## v0.85: The companion reads what you attach (2026-09-04)

Attach a text file, or a Word, PowerPoint or Excel file with the
Documents plugin on, to a plain conversation and the companion reads it:
the streaming chat path used to record attachments by name only. Now
both chat paths share one parser, the message shows "Read: name · words"
for each file read, the live model receives the text as material it must
cite by name, and without a key the house quotes the opening and says it
can quote but not discuss. A file that is not text is recorded by name
and left unread, and the reply says so by omission rather than pretence.

## v0.86: Ask the house, not only the thread (2026-09-04)

The companion used to answer from the missions of the current
conversation alone. Now a question that names a serial reaches that
mission from any thread, and a question about the last or latest
delivery reaches the three most recent in the house; the live model gets
the same record, and a serial the house does not have is not answered
from the record at all. A test asks about a mission from another thread,
about the latest delivery, and about a serial that does not exist.

## v0.87: The house answers about money and schedule (2026-09-04)

Ask the companion what the house spent this week, what the balance and
reserve are, what the costliest delivery was, or what is scheduled, and
it answers from the ledger and the standing orders, no model needed and
no number invented: settled credits over the period, deliveries counted,
the costliest named by serial, balance and reserve as the ledger holds
them, each standing order with its cadence and next run. A live model
receives the same figures as context and is told to use only those.

## v0.88: Copy, retry, and the time on every answer (2026-09-04)

Every answer in a conversation now carries a quiet row that appears on
hover, or always on touch screens: Copy puts the answer on the clipboard
and says so, Retry asks the same question again, and the time it was
answered sits beside them. Answers from the ledger are labelled as such.

## v0.89: Search inside the record (2026-09-04)

The palette matched titles of the eight most recent things. Now ⌘K
searches the words themselves: every delivered artifact, every tape
including archived ones, the decisions and their justifications, the
sources on the table, recorded dissent, failed gate lanes and every
conversation. Each hit says where it was found, "a decision", "the tape",
"the deck delivered, v1", and shows the line it matched, so you can find
the run where someone raised a ceiling and read the reason they gave.
Every term must match, artifact text is cached against the file, and a
full house answers in about ten milliseconds. `GET /api/search?q=`.

## v0.90: House limits (2026-09-04)

Standing guardrails the house keeps on its own, set once under Settings:
a ceiling no single ticket may exceed, a cap on credits settled in any
30 days, and how many runs may start in any 24 hours. A ticket that
would break one is refused before anything is reserved, in plain words,
with nothing spent; the run page says so before you reach the stamp; a
standing order run is skipped and records the limit as the reason. The
house check carries a limits row showing where each stands. Leave a
field empty for no limit. `GET`/`PUT /api/limits`.

## v0.91: The evidence is re-visited (2026-09-04)

A delivery cites addresses on the open web, and addresses die. The house
now goes back and looks: Settings → Evidence check re-visits the
addresses cited by the fifteen most recent deliveries, and any run page
with cited sources marks each one "resolves (200)" or "gone or refused
(404)" and offers to check them again. Findings go on the mission's
record and into the house check, so a delivery resting on a page that has
gone says so instead of implying the evidence still stands. Read-only, a
HEAD then a GET only if refused, never a private address, and the sweep
stops after forty-five seconds and reports what it covered.

## v0.92: Tell me elsewhere (2026-09-04)

You should not have to sit in a tab to hear that a run needs a decision.
Give the house one address under Settings and it posts a small JSON body
when a run needs a decision, delivers, is stopped, a ticket is refused by
a house limit, or the daily check fails. Choose which of the five you
want. An optional signing secret is held in memory only, like every key
here, and signs each body so your endpoint can verify it. Every attempt
is on a short log with what the endpoint answered, one retry on failure,
and clearing the address stops everything.

## v0.93: Without a model, the house quotes instead of inventing (2026-09-04)

A research brief run with no key loaded used to deliver house-scripted
sample prose, labelled but hollow. Now, when real sources are on the
table, the house composes the brief out of them: the lede says plainly
that no model was loaded and no judgement was formed, and every claim is
a quotation from a source, carrying the address it came from and the
date it was read. Headings are never quoted as findings, each source
speaks before any source speaks twice, and if fewer than three real
sentences can be quoted the house declines and falls back to the
labelled sample. The artifact's provenance says "composed run" and the
gate is cleared honestly, not waived.

## v0.94: The analysis counts your rows (2026-09-04)

The same honesty at the analysis desk. Attach a file and run without a
key, and the read is now arithmetic over your rows rather than sample
prose: how many rows and columns, what the series runs from and to and
by what percentage, the highest and lowest points with their labels, the
mean and the sum, and the largest and smallest segment with its share.
The last line says plainly that no model weighed any of it. The tape and
the provenance name what the house actually did, counting rows here and
quoting sources on a brief.

## v0.95: The panel stands in (2026-09-04)

A run no longer collapses to scripted prose because one provider had a
bad minute. If the lead model refuses, each adviser holding a key of its
own is asked in turn; the first that answers writes the substance, the
refusal and the substitution go on the tape, and the artifact's
provenance says which model stood in and for whom. Only when every key
on the panel refuses does the house fall back, and even then it prefers
quoting real sources to inventing prose. Proved by a test that runs two
model endpoints, one that always fails and one that answers.

## v0.96: What your own key was used for (2026-09-04)

A run on your own key is priced at zero house credits, which said
nothing about what your provider charged you. Every model call now
records what the provider itself reported: calls made, prompt tokens and
completion tokens, per model, across authoring, adviser critique and
panel positions. The run page and the artifact's provenance state it
plainly and add that the house does not guess a price, because token
prices change and an invented figure would be worse than none. A
provider that reports no counts adds nothing but the call itself, and a
refused call bills nothing and is not counted.

## v0.97: A delivery can leave as Word (2026-09-04)

Every artifact now offers a .docx beside the HTML: a real Word document
built without any dependency, from the artifact itself, block by block,
so what is in the file is what was delivered. It carries the title, the
serial, the desk, the version, the date, every heading, paragraph and
bullet, and a provenance page naming the mission, what it settled
against its ceiling, whether a model wrote the substance on your key or
the house quoted its sources, and the public record link when one
exists. Verified two ways: the house reads its own file back through the
Documents plugin, and Apple's own converter opens it.

## v0.98: A deck can leave as PowerPoint (2026-09-04)

Decks now offer a .pptx as well: one slide per slide, in order, with the
label and page number, the recorded dissent where the deck carried it,
and a closing provenance slide naming the mission, what wrote the
substance, what it settled and the public record link. Built without a
dependency on the house's own paper and ink. Checked three ways: an
independent parser confirms every part is valid XML with no dangling
relationship and every slide declared, the house reads its own file
back, and macOS renders the first slide. A delivery with no slides is
refused rather than shipped as an empty deck.

## v0.99: An analysis can leave as a workbook (2026-09-04)

A delivery whose mission holds your attached data now offers an .xlsx:
a Series sheet with every point and the arithmetic beneath it, count,
sum, mean, minimum, maximum, first and last; a Segments sheet with each
segment, its value and its share; and a Provenance sheet naming the
delivery, the mission, the file it read, what wrote the substance, what
it settled and the record link. Numbers are stored as numbers, so the
workbook can be worked in rather than retyped. Checked by an independent
parser, by the house reading its own file, and by macOS rendering it.

## v1.0: The handover is complete (2026-09-04)

A share link used to be something to read. Now it is something to take:
the shared page offers Word, and PowerPoint or Excel when the delivery
has slides or data, at the same link, with no account and no key. The
files are built at request time from the stored artifact, so the
delivery and its provenance are untouched, and revoking the link takes
the files with it in the same instant.

That closes the loop this house was built for. A request becomes a
contract with a plan, a price and a ceiling. The run happens in the
open, every step, cost, position and decision on a tape that survives a
restart. The delivery carries its own evidence, cites addresses the
house re-visits, and leaves in the format the reader expects. The
ledger, the limits, the backups, the export and the erasure are the
owner's. Keys are never written to disk. Ninety-three iterations, each
verified before it shipped, and a suite of twenty-nine tests the deploy
refuses to skip.

## v1.1: When the ground is empty, the house says so (2026-09-04)

A plan is written before the work starts, so sometimes the work proves
the plan wrong. If the sweep returns no sources, the steps that exist
only to grade and steelman sources have nothing to do, and the house now
stops before spending on them: it names those steps and what they cost,
and offers to write an amended ticket without them or to run the plan as
you stamped it. Choosing the amendment stops this run with its partial
artifact, releases the unspent reserve, and leaves a smaller unstamped
ticket in the same lineage, linked from the run you stopped. The plan
stays a contract: the house proposes, the owner decides, and the reason
is on the record either way.

## v1.2: The model that wrote it answers the critique (2026-09-04)

Two faults in the review loop, found by driving it end to end. The
revision was always asked of the lead model, so when the lead had
refused and an adviser stood in, the house asked one model to rewrite
another's draft, and if the lead was gone it skipped the revision
altogether. Now whoever actually wrote the draft answers the critique,
and the stand-in record survives the rewrite. The revision was also a
call on your own key that went uncounted; it is counted now. A test
drives the whole loop, one model refusing, another writing, an adviser
demanding a change and the writer making it, and checks the token
account to the exact figure: three calls, nothing double counted.

## v1.3: House instructions (2026-09-04)

Standing guidance the whole house follows, set once under Settings: your
style, the words you use and refuse, what a reader here always needs. It
is quoted to the model that writes and to the advisers who judge the
draft, so a critique can hold the writer to it, and it is explicitly
subordinate to honesty about evidence. Every run written while it stands
records that it was in force, and says so on the run page and in the
artifact's provenance. Two thousand characters, cleared by emptying it.

## v1.4: Who has entered (2026-09-04)

The house rules are accepted by whoever opens the workspace, and until
now each acceptance overwrote the last, so an owner could not tell that
anyone else had been in. Every acceptance is now recorded with the name
given, the time, the address it came from and the version accepted, and
Settings lists them. A person the house has not seen before raises a
house.entered event on your webhook. The house check gains a door row
that states plainly whether an access code is set, and fails when the
door is open and more than one person has come through it, naming the
environment variable that closes it.

## v1.5: The record starts from whoever is already here (2026-09-04)

A house upgraded to the visitor record showed an empty list even when
someone had already accepted the rules, because the log did not exist
yet. The acceptance on file is now the first line of that record, so an
owner sees the person who is actually in the house rather than nobody.
The daily digest names anyone who accepted in the last day.

## v1.6: A citation is a claim, so the house checks it (2026-09-04)

The gate proved that figures traced to a source and that references
listed only cited sources. It never checked the thing that matters most:
whether the source a claim cites actually speaks to that claim. It does
now. For every claim that cites a source on the table, the house takes
the claim's distinctive words and looks for them in that source, and
fails the lane when not one of them appears, naming the claim, the
source and the words that are missing. It is deliberately forgiving,
since paraphrase is not fabrication, and it fires only on the shape of a
citation attached to the wrong evidence. A run that trips it stops at
the gate for your decision instead of delivering. Composed briefs pass
by construction, because their claims are quotations.

## v1.7: The house stops shouting (2026-09-04)

While a run was in flight, every open tab pulled the entire workspace
every four seconds, six hundred kilobytes at a time on a busy house, and
rebuilt its own timer on each pull. Now a tab asks one cheap question,
has anything changed, and pulls the workspace only when the answer
moves. The pulse is thirty bytes and carries what a waiting tab needs:
the house revision, how many decisions are waiting and how many runs are
live. Measured in the browser: an idle-but-busy tab went from three full
pulls in twelve seconds to none, and a single change still refreshes it
once. A sweep of every room found nothing else broken, and the test
suite's own second server now keeps its own house, so it cannot race.

## v1.8: The house sends what the page needs (2026-09-04)

The workspace payload every tab pulls carried the whole memory of the
house: every validator row, every authored draft, every source extract,
the reasoning behind every plan step. None of it is read by a list, a
board or the dashboard, and the run page fetches the full mission when it
opens one. The payload is now 44 per cent smaller, 628 kilobytes down to
352, and every page renders exactly as before, checked page by page.

## v1.9: You are you, and signing out means something (2026-09-05)

Identity belonged to the house, so whoever set a name set it for every
visitor: open the address and you were greeted as somebody else. And
logging out cleared only the access-code session, which does nothing
when no code is set.

Your name and email now live against your own signed cookie. A browser
that has never signed in is greeted by no name at all and the sidebar
says so; My Profile is where you sign in, and it edits you, not the
house. The first person to sign in becomes the house's own, so the
digest still has an owner, and nobody after that changes it. Signing out
clears both cookies and the greeting returns to nobody. A forged
identity cookie carries no identity: the signing secret is minted once,
kept with the workspace so a restart does not sign everyone out, and
never leaves in an export.

Checked in a browser end to end, and pinned by a test. This does not
close the door: without an access code anyone with the address can still
enter the workspace.

## v1.10: Whose request, and who decided (2026-09-05)

Now that people sign in as themselves, the record says so. A ticket
carries the name of whoever asked for it, and every decision carries the
name of whoever made it, which need not be the same person: one can ask,
another can answer the ceiling or the gate, and the artifact's
provenance shows both. A ticket written by nobody signed in is left
unattributed rather than credited to whoever happens to be the house.

The gate test that had been flaking was fixed at the cause, not by
re-running it: the engine deliberately overruns one serial in three, and
serials start from a random counter, so the run sometimes paused on the
ceiling and never reached the gate. The test now answers anything that
is not the gate, so the gate is what is on trial. Three consecutive
runs, thirty-seven tests, green.

## v1.11: A conversation belongs to whoever started it (2026-09-05)

Once two people can sign in to one house, one person's talk should not
be another's to read. A conversation now belongs to whoever started it:
you see your own, and any that belong to nobody, and someone else's is
not in your list, cannot be opened by its address, and cannot be written
to or streamed from. Conversations started before anyone signed in
belong to nobody and stay visible, so nothing already here disappears.

Missions and their artifacts stay shared, because those are the house's
record rather than anyone's private line.

## v1.12: The house belongs to its own (2026-09-05)

A visitor could erase the workspace, restore over it, load keys, rewrite
the limits or the house instructions, and point the house at an address
of their choosing. Those acts change the house itself rather than the
work in it, so they now belong to the house's own: the first person to
sign in, or whoever `PRAJNA_OWNER` names, which lets you claim a house
from the environment if someone else signed in first. An unclaimed house
still lets anyone act, so a fresh one is usable out of the box.

Everyone else can still do the work: write tickets, watch runs, take
deliveries, answer decisions and look at the house check. A guest is
told plainly whose house it is, and a refusal says what it protects
rather than simply failing.

## v1.13: What a guest may do (2026-09-05)

The door is the access code; this is what someone already inside may do,
and only the house's own may set it. Three choices. Work freely, as the
house has always been, and the default. Ask only: a guest writes tickets
and talks, but stamping and spending are yours, so their ticket waits
unstamped until you stamp it. Read only: the record is open and nothing
else. A refusal says which it is and who can act, rather than failing
blankly. Proved in a house of its own with a real owner and a real
guest, through all three settings.

## v1.14: Every desk, with a real model (2026-09-05)

Only the research desk had ever been exercised with a live model. Now a
test runs all five, deck, landing page, mobile prototype, analysis and
brief, each answered in its own shape by a model of the test's own, and
checks that what the model wrote actually reaches the delivered artifact
and that its provenance says live. Nothing was broken, which is worth
knowing rather than assuming.

It did expose a sharp edge in claiming a house. When `PRAJNA_OWNER`
names an owner, you must sign in under exactly that name, and the
refusal now says so: who the house is held for, who you are signed in
as, and where to fix it. Being locked out of your own settings by a
spelling is not a lesson anyone should have to learn twice.

## v1.15: The substance is written in the open (2026-09-05)

A run showed every step, every cost and every position, and then went
quiet for the longest step of all while the model wrote. That step is
now watched: the words appear on the run page as they are written, with
a running character count, and the prints are paced by time or by length
so a fast model does not arrive in one silent burst nor a slow one print
every letter. None of it is kept: the tape is a record, not a
transcript, so the ledger is unchanged.

Streaming also had to keep what streaming usually loses. The provider's
own token counts are now read from the stream, so watching the writing
costs no honesty about what your key was used for. An endpoint that
cannot stream is asked plainly instead, which four of my own tests
proved was necessary by breaking the moment I claimed a fallback I had
not written.

## v1.16: The guest policy, audited against itself (2026-09-05)

Reviewing what I shipped two versions ago found it half done. Tickets
and conversations were held to the policy, but a guest could still
generate media on your provider key, fork a ticket, start or run a
standing order, publish an artifact or a whole record at a public link,
submit to the showcase, re-deliver to your connected apps, or write
notes on the record. Every one of those now answers to the same policy,
and topping up credits and sending the digest through your own mailbox
are the owner's alone whatever the policy says. The test walks each one
as a read-only guest and as a guest in a house that works freely.

## v1.17: What this kind of work has actually cost here (2026-09-05)

An estimate came from a table of step costs, while the house sat on
hundreds of finished runs that knew better. An unstamped ticket now says
what its own kind has really cost: how many like it were delivered, the
range they settled in and the median, how many cleared the gate first
time, how many hit the ceiling and had to be decided, and whether this
ticket's estimate sits inside that range, above it or below it.

Every figure is counted from delivered missions at the moment you look,
never modelled and never cached. A ticket never counts itself. With
fewer than three of a kind the house says it has too few to say, rather
than quoting a range from two runs.

## v1.18: The ceiling learns from the record (2026-09-05)

The step table set both the estimate and the ceiling, and the record
showed the consequence: three of six analyses hit their ceiling and had
to be decided mid-run. A ceiling that is too low saves nothing, it stops
the work and asks you to raise it.

The estimate still comes from the plan, untouched. The ceiling now comes
from what this kind of work has actually cost here, when at least five
like it have finished: it covers the highest that settled, with a little
room. Where the evidence is thin for exactly this kind, the house asks
the desk as a whole rather than treating three runs as proof, and where
there is no evidence at all the table stands. The ticket says which it
used and why, and a wider ceiling costs nothing, because what a run does
not use is released.

## v1.19: The part that acts outside the house is watched too (2026-09-05)

Delivering to a connected app is the only thing the house does that
leaves it, and it was the last subsystem with no test. Now a run
delivers to a Slack of the test's own and the whole path is checked:
the plan carries a delivery step, nothing leaves without an approval on
the record, the message really arrives in the chosen channel, it carries
a public link, the house verifies that link before calling the delivery
made, the delivery is written on the record with where it went, and
revoking the link kills it. It passed first time, which is the outcome
worth having and not one worth assuming.

## v1.20: Take it further (2026-09-05)

A delivery used to be the end of the line: to build a deck from a brief
you started again from the goal, and the brief you had just paid for sat
in the record unused. Now a delivered mission offers the next desk with
its own delivery already on the table as an owner source, text and all,
so the deck argues from the brief rather than from the prompt. It
arrives as an unstamped ticket like any other, priced and explained
before anything runs, and it says what it came from and links back.

## v1.21: The weekly review (2026-09-05)

The digest says what happened yesterday. This says how the house is
doing: delivered and stopped, credits settled and the middle delivery,
how many cleared the gate first time and how many needed a patch, how
many runs hit their ceiling, who wrote the substance, what the standing
orders did, whether any cited evidence has died and who accepted the
house rules. Each figure sits beside the same figure for the week
before, so a number that moved says so.

It is counted, never modelled, and a week whose predecessor was empty is
not compared with silence: the house says there is nothing yet to
compare against. Read it under Settings, and it goes to your address
every Monday morning if you have given the house one.

## v1.22: Every claim shows what it rests on (2026-09-05)

The gate already refused a claim whose cited source never mentions it.
That check was invisible to whoever read the delivery, which is the
person it protects. Now each claim carries a line beneath it: the source
it rests on and the words the two actually share, or, when a risk was
accepted on the record and the delivery went out anyway, a plain
statement that the source named there does not mention them.

So a reader can weigh a claim without taking anyone's word for it,
including the house's, and an accepted risk stays visible in the
document rather than only in its provenance.

## v1.23: A restart takes your keys, and the house says so (2026-09-05)

Keys live in memory and are never written to disk, which is the promise
this house makes. The consequence went unsaid: every restart, including
every deploy, silently drops them, and deliveries quietly stop being
written by a model and start being composed or house-scripted, labelled
but easy to miss.

The house check now carries a keys row. It names the providers whose
keys are held and why they will not survive a restart, and it fails
when a house that has written on a key holds none, telling you to load
yours again. The owner sees the same thing on the home page. A search
key is not a model key and does not silence it.

## v1.38: The deck is illustrated (5 Sep 2026)

Asked for directly: the deck's quality was not good, and it needed relevant
images. It had none. Every slide was text on a coloured card.

The deck contract now carries a step of its own, "Illustrate: one image per
slide on your image key". For the title and each of the six argument
slides, the house writes a prompt from that slide's own headline and
support line, in a fixed editorial style (natural light, no text, no logos,
room on the left for the headline), and generates the picture on the
owner's OpenAI or Gemini image key. Each picture is kept in the house's
media store, named on the tape with its size and time and billed to the
key, and recorded in the provenance. The slide shows it full-bleed with the
text over a scrim, and the PowerPoint export carries the same picture as a
picture part on the slide, with a solid panel behind the text so it reads
in every renderer. When no image key is held, the house draws its own
composition for each slide from the slide's words and the tape says why;
a deck is never a wall of text. The Media Generation tool is now on by
default for a new house, since it spends nothing until a key is held.

A new gate assertion, VAL-ILLUSTRATED, refuses a deck whose title or
argument slides carry no visual, or a generated image without alt text.

Two of my own defects were found on the way and fixed. The page asked for
each picture by its file name and the house served it only by id, so no
picture loaded; the test had fetched the id and passed, and now fetches
what the page asks for. And since v1.33 the deck's presenter panel and
all-slides overview had been visible at load, because their display rule
overrode the hidden attribute: a near-black overlay on every deck. Hidden
now hides, and the test checks for the rule.

Proved with a mock image provider returning real pictures: seven images
generated, seven loaded in the page at 1536 by 1024, seven picture parts in
the PowerPoint, rendered and looked at.

## v1.37: The frame lets the delivery work (5 Sep 2026)

Every desk's delivery now runs, and every one was verified on its raw page.
"Open" does not land on the raw page. It lands in the house's artifact view,
which framed the delivery with a sandbox that allowed scripts and nothing
else. In that frame the page has no origin of its own, so storage throws:
the app could not keep its data, the site could not keep an entry, the
brief could not record a decision. Dialogs were blocked, so delete and
reset did nothing. Downloads were blocked, so the analysis CSV was dead.
Fullscreen was not permitted, so the deck's F key did nothing.

The raw page is served from this same origin with no sandbox at all, one
click away under Full screen, so the frame's restrictions protected nothing
and broke everything they held. The frame now grants what the runtimes
need: its own origin, forms, downloads, dialogs, and fullscreen. The
side-by-side compare view gets the same.

Proved inside the artifact view itself, reaching into the frame: storage
works, fullscreen is enabled, an item added in the frame is kept, and
delete asks and proceeds. A test reads the built bundle and refuses a frame
that drops any of these.

## v1.36: Word keeps the prose, PowerPoint keeps the notes (5 Sep 2026)

The five-desk pass gave every delivery a runtime, and the Word and
PowerPoint exports are built from the same page, so this is the check that
the pass owed them.

The Word export took every paragraph and cell on the page, which now
included the brief's decision section and the analysis's table note. A Word
document that says "Recorded on this device, sent nowhere" makes no sense,
so the page's working parts now stay on the page: the evidence bar, the
decision form and what it recorded, chart readouts, table notes, app hints
and form errors. The prose and the tables come through as before. Proved
on a delivered brief: the chrome is gone and the sections are intact.

The PowerPoint export ignored the presenter notes, when PowerPoint has a
notes pane for exactly that. Every slide now ships with its note in that
pane: a notes part per slide, a notes master, the relationships and content
types PowerPoint expects, and nothing printed on the slide face. Proved on
a delivered deck: ten notes parts for ten slides, the right note on slide
three, a valid package that QuickLook renders.

And a defect of my own from v1.33, found on the way: the deck's no-key
fallback slides had never been given notes, so a scripted deck failed the
assertion that every slide carries them and paused for a decision it did
not need. The house now writes notes for its own slides, nine for nine.

## v1.35: The brief does the reader's job (5 Sep 2026)

Fifth desk, and the last. A decision brief exists so somebody can decide,
and the delivered page let them read it and nothing more. Now it lets them
do the reader's job on it.

An evidence bar above the claims shows only the claims graded strongly
enough to act on, A only or B and above, and says how many are shown; the
rest are dimmed, not removed, because hiding evidence is not the house's
call. Every source in the references now says which claims lean on it, and
following a link in either direction lights its target. And the brief ends
with the decision it was written for: agree, disagree, or need more, with a
reason of at least a sentence, because the reason is the record. It is kept
on the device under the mission's serial, shown with its date, changeable,
and printed with the brief; nothing is sent anywhere, and the page says so.

A new gate assertion, VAL-BRIEF-WORKS, refuses a brief the reader cannot
work with. Proved on a delivered brief: filter counts and dimming, links in
both directions, the three refusals, the recorded decision, reload, edit.

With this, all five desks deliver things that work rather than depict: the
app, the site, the deck, the analysis and the brief, each with a runtime of
its own and a gate assertion that holds it there.

## v1.34: The charts can be read (5 Sep 2026)

Fourth desk held to the standard. An analysis shipped two charts you could
look at and nothing you could do with them: no way to read a value without
guessing from the axis, no keyboard access, no table, no way to take the
numbers with you.

Now every point and every bar can be pointed at or tabbed to, and a line
under the chart says what it is: the period and its value, the change on the
period before, whether it is the peak or the trough; the segment, its value,
its share of the total, and whether it is the one furthest from the mean.
A button draws the mean across the trend and says what it is. Beneath the
charts the whole series is tabled, sortable by any column with the sort
announced, peak and trough marked. The data leaves as a CSV made on the
page, so a shared copy of the document still carries its numbers, and the
page prints cleanly.

A new gate assertion, VAL-READABLE-CHARTS, refuses a chart nobody can read.
Proved by driving a delivered analysis: hover, keyboard focus, outlier
readout, mean toggle, twelve rows, both sort directions, the CSV's contents.

## v1.33: The deck presents (5 Sep 2026)

The app works, the site's action works; the deck was next. It already
advanced by arrow keys, space and click, which is a scroll of slides, not a
presentation. Now it is one.

The model writes presenter notes for every slide, spoken not written, and
the house writes them for the three slides it composes itself. N opens a
presenter panel: this slide's notes, the next slide's title, and a clock
that starts the first time the panel opens. F is fullscreen. Esc shows every
slide at once and any of them is one click away. Every slide has an address
(#4) so a link can open the deck on a slide, and the phone's Back button
walks the deck backwards. Home, End, PageUp, PageDown and the digit keys do
what a presenter expects; a swipe turns the page on a phone; a thin bar
along the top shows how far along the room is. Print the page and you get a
handout, one slide per page with its notes beneath. The hint line names all
of it and fades once you have started.

A new gate assertion, VAL-PRESENTABLE, refuses a deck without notes on
every slide, a presenter panel, fullscreen and slide addresses.

Proved by driving a delivered deck: address, arrows, Home, End, digit,
notes, next, overview, jump, swipe, click, print stylesheet.

## v1.32: The landing page's action works (5 Sep 2026)

A landing page has one job, to get a visitor to act, and every call to
action on a delivered page was a dead link: two pointed at anchors and the
closing one pointed at nothing at all. The same defect the app had, held to
the same standard.

The closing action is now a working form. It validates in its own words: an
address is needed, that does not look like an address, that address is
already on the list. On success the form gives way to a confirmation
addressed by name, focus moves to it so a screen reader hears it, and a line
under it counts who is on the list. Entries are kept on the device under the
mission's serial until the house connects the page to a mailbox or a sheet,
and the confirmation says exactly that: nothing has been sent anywhere. The
header and hero buttons scroll to the form and put the cursor in the email
field. A new gate assertion, VAL-ACTION-WORKS, refuses a page whose closing
action is a dead link, so this cannot quietly regress.

Proved by driving a delivered page in the browser: header button, empty
address, bad address, success, duplicate, reload.

## v1.31: The app works, and the result comes first (5 Sep 2026)

Three things asked for in one message, all three shipped.

**The mobile desk builds a working app, not a picture of one.** The
delivery used to be four screens with static cards and a button that did
nothing. It is now a real app running inside the phone frame: every screen
is a live list with search that filters as you type; tapping an item opens
it, with mark done, reopen, edit and delete; the primary button opens a
sheet that adds one, validated in the sheet's own words (a title is needed,
no duplicates); the dots at the top open settings with counts per screen, a
dark theme, and a reset. Every change is kept on the device under the
mission's serial and survives a reload, and each screen and item has its own
address so the phone's Back button does what it should. On a narrow screen
the bezel goes away, it runs full height, and it can be added to the home
screen. The page says plainly that it is a web app, not a native build. The
model now names what one item on each screen is called, so the button reads
"Book a trip" rather than "Take the action". Proved by driving a delivered
app in the browser: navigate, search, open, add, edit, mark done, delete,
theme, reload.

**The tape is folded away.** The run page led with the tape, every move on
the record, and the delivery was a card somewhere down inside it. The tape is
the record, not the result, so it is now hidden unless the reader asks for
it, and the choice is remembered. In its place the page shows what the
reader came for: the delivery with Open and Full screen, any decision that is
waiting, and one line on what is happening while the run is live. A ticket
not yet stamped still shows its plan.

**Opening is one click at the top.** "Open the delivery" now sits in the
header, right after the status, the moment there is anything to open. No
scrolling, no hunting.

## v1.30: A key belongs to the owner (5 Sep 2026)

Keys have always lived in memory only: never written to disk, never in an
export or a backup, gone on a restart, and an old key file from an earlier
build is deleted at boot. That is the important half, and it was already
true. The other half is who can see a key while the house holds it.

A guest's workspace payload carried the masked form of every key, four
characters at each end, along with the endpoint it calls and the hour it
arrived. That is still the owner's credential, and it is now the owner's
alone. A guest sees that the house holds a key, which is what tells them
their work will run live, and nothing more about it. Testing a saved key is a
call on the owner's account, so it is the owner's too, and the owner's OAuth
client ids are no longer handed to anyone else.

A test now sets a key, reads the house as owner and as guest, downloads an
export, and walks every file the house wrote, and proves the key appears in
none of them beyond the owner's own mask.

## v1.29: The dissent is somebody real (5 Sep 2026)

A decision brief has always carried a recorded dissent, and it was the
weakest thing in the document. On a live run it was whatever the lead model
invented about its own draft, which is not disagreement. On a scripted one it
was a fixed paragraph attributed by name to a model that never read the page.

Advisers were already doing the real work: a live adviser reads the lead's
draft, returns a verdict, and its critique goes on the tape. That objection
is now the recorded dissent. It is attributed to the model that made it, it
is printed as written, and the brief says underneath whether the draft was
revised in answer to it or stands as it was. A lead that invents a dissent
about itself no longer reaches the page while a real one is available.

Alongside it, the record of visitors now has a floor. Every browser that
accepts the house rules leaves a record, and a public address means that
number only goes up. Signed names and the house's own are kept for good;
anonymous acceptances are kept to the most recent five hundred.

## v1.28: The claim shows the line it rests on (5 Sep 2026)

Under every cited claim the delivery used to say the source "uses" three of
the claim's words. That is a report about the source, and a reader had no way
to check it without leaving the page and reading the whole article.

Now the check keeps the sentence it found. It scores every line in the
retrieved source by how many of the claim's own words it carries, takes the
best one, and the delivery quotes it directly under the claim. The reader
sees what the source actually says and can judge the claim against it in
place. When no single line carries the claim, the delivery says exactly that
instead of quoting something that does not support it, and a claim whose
source does not speak to it is still flagged as before.

## v1.27: The house rules are accepted by a person (5 Sep 2026)

Consent was recorded against the building. The first visitor to accept the
Terms, the Privacy and GDPR Policy and the AI Disclaimer opened the door for
every stranger who came after, and none of them was ever shown the documents
or asked. A document that says "you agree" cannot be agreed to on your behalf
by whoever happened to arrive first.

Now every browser is given an identity of its own the moment it opens the
page, before it asks for anything, and the gate reads that person's own
acceptance. A second visitor sees the three documents, accepts them or does
not, and inherits nothing either way. The house still keeps the acceptance
that opened it, because that one was really made, and the house check still
reads it. A client at the API with no browser identity still answers to the
house record, which is the acceptance somebody did make.

One thing changed alongside it: the house is claimed by the first person to
sign a name, not by the first to be handed a cookie. Accepting the rules now
leaves a record of its own, and a record with no name on it is nobody.

## v1.26: One gate, at the door (5 Sep 2026)

Every write in this building was gated route by route, which means it was
only as good as the last route somebody remembered to gate. A sweep found
twelve that nobody had: a stranger with no session, no sign-in and no access
code could delete this house's models, its projects, its chats and its
registered servers, and could run housekeeping over its open tickets. Proved
against a running house, not read off the source.

The fix is a single default-deny check above every write to the API. Four
paths stay open by name, and only these four: reading the door, accepting the
house rules, signing in, and leaving. Nobody should be trapped inside a house
they cannot change. Everything else now answers to the access code and to the
guest policy before it reaches the route at all, and a route that wants to be
looser has to say so on that list where it can be seen.

Behaviour is unchanged for a house with no access code and guests working
freely, which is the default. What changed is that setting a code now means
what it says.

## v1.25: The composer says when the ask is thin (5 Sep 2026)

A goal of four vague words buys a plan and a price about as specific as the
ask, and you only find that out after the contract is written. Now the
composer says so while you type. Pick a desk, type a thin goal, and a quiet
grey line appears under the box naming why it reads thin and the one question
worth answering. It is debounced, it never blocks, it has no buttons, and it
disappears the moment the goal has something to hold on to. The house still
accepts a thin goal if you send it, exactly as before. It just no longer
stays silent about the price of vagueness.

## v1.24: A thin ask makes a thin contract, and the house says which (2026-09-05)

"Help me with marketing" got the same plan, the same price and the same
confident ticket as a real question. Both were honest about cost and
dishonest about worth. A goal with too few words that mean anything is
now questioned before it is priced: the house says why it is thin, asks
the three things that would make it mean something on that desk, and
records the note on the ticket.

It never refuses. You can answer, or stamp it as it stands, or void it
and ask again with more. The questions are deterministic, need no model,
and a specific goal carries no note at all, because a false question is
an insult.
