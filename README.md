# Prajñā — The Outcome Exchange

An agent workspace where every request becomes a **mission with a visible contract**:
the agent states the deliverable, the plan, and the price *before* running, executes
in the open — every step, tool call, and model deliberation streamed live — and ends
with a tangible, versioned artifact.

Built as a direct answer to chat-with-a-spinner agent platforms (Zenith et al.).

## The three refusals (the UVP)

1. **Contract before action.** The house writes an order ticket — full plan, credit
   estimate, hard ceiling — and nothing runs until you stamp it.
2. **Work in the open.** The run deck streams the tape live: tool calls, the model
   panel's positions, challenges, verdict — and recorded dissent, never erased.
3. **Artifacts, not answers.** Every mission ends in a versioned artifact in the
   Artifacts list (decision brief, deck, landing page, analysis) with provenance and cost
   stamped on it. A mission that ends in prose has failed.

## v0.2 — the contract made mechanical

- **Event ledger.** Every run event carries a monotonic `seq` (`prajna.event.v1`);
  SSE honors `Last-Event-ID`, and `GET /api/missions/:id/events?after=N` replays
  the ledger. Live view, reconnect, and history are one code path.
- **Settlement.** The ceiling is a reservation: every run ends with
  reserved / settled / released printed on the tape and in the artifact. A live
  burn-down meter shows settled-vs-estimate variance per step.
- **Always an artifact.** Kill a live position or hit the ceiling — the run
  pauses or closes with a *partial artifact*, stamped as such. No terminal state
  ends in nothing.
- **Panel gate.** The panel votes pass / fail / unverifiable per acceptance
  dimension; *unverifiable counts as fail*, and the patch + re-vote that clears
  the gate is on the record.
- **Terminal review.** A reviewer that sees only the goal and the artifact —
  never the run — judges the result; gaps go on the record or void the artifact.
- **Attention queue.** Every mid-run decision (ceiling raise, gap acceptance)
  demands a justification, recorded in the ledger and the artifact. First write
  wins; nothing is silently relabeled to fit the budget.
- **Citation integrity.** Brief references render *only* from sources actually
  cited; an unreferenced claim fails the artifact build.
- **Machine-readable provenance.** Every artifact embeds
  `prajna.provenance.v1` — contract, settlement, gate table, review, decisions,
  honest `mode: "scripted"` label — refreshed at settlement.

## v0.3 — perfected after a 100-agent full-app audit

- **Vocabulary rule: world-nouns stay, workflow-verbs go plain.** Open a
  *mission*, *stamp & run*, *stop run*, DONE / STOPPED / HOLDING, *Connectors*
  (not "instruments"), *Missions* (not "the floor"), *Artifacts* (not "ledger"). Tickets, tape, panel, desks, credits are
  unchanged — they explain themselves and carry the world.
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

## v0.4 — bring your own keys (BYOK)

- **Your keys** page: Anthropic, OpenAI-compatible (OpenAI, DeepSeek, Groq,
  Together, Ollama… via base URL) and Google Gemini keys — **never saved**: held in
  server memory for the session only, masked in every response, never sent to the browser, gone on restart. **Test** proves
  a key with a real round-trip.
- **Your models**: add any model id your provider serves; it becomes a panel
  seat like a house seat.
- **Live seats**: a seat whose provider has a key goes *live* — its panel
  position on the tape is a real model call (green dot on the chip, "live on
  your key" on the tape). A failed call falls back to the scripted voice and
  the failure is recorded, never hidden.
- **Billing honesty**: live seats bill your provider, so the panel step's house
  cost is reduced pro rata; artifact provenance reports `mode: "hybrid"` with
  per-seat live flags. Tools and artifacts remain scripted until live execution
  ships.

## v0.5 — mechanisms adopted from ii-agent (independent implementations, no code copied)

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

## v0.6 — connectors that actually connect

- **Real OAuth sign-in** for Google (one app covers Gmail, Drive, Calendar, Sheets,
  YouTube), Slack, Notion and GitHub — zero dependencies, standard authorization-code
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

## v0.7 — stopping discipline from Zenith (independent implementation)

Studied the Zenith harness (Apache-2.0; report CC BY) and adopted its control
mechanisms without copying code:

- **Definition of done as atomic assertions.** Every ticket carries testable
  promises about the deliverable (`VAL-…`), each owned by exactly one plan step
  — Zenith's two-layer shape: many assertions → fewer work steps.
- **Two independent validator lanes, real checks.** After the artifact exists, a
  *scrutiny* lane and a *surface* lane each prove every assertion against the
  actual HTML (structure, behavior, parseable provenance, cited-only refs, nine
  slides, responsive rules…). No scripted votes.
- **A gate that seals or refuses.** An assertion seals only when both lanes
  pass; lanes disagreeing is *dissent*, no lane covering is *missing* — both
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

- `server/` — zero-dependency Node HTTP server: REST + SSE streaming, JSON-file
  persistence in `data/` (gitignored), mission engine, artifact generators.
- `web/` — React 19 + Vite SPA, hand-written CSS design system in
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

Live at **https://www.prajñā.com** (punycode `www.xn--praj-jqa0h.com`; the ASCII prajna.com is not ours) and https://prajna-production.up.railway.app — Railway project **Prajna**,
service `prajna`, a persistent volume mounted at `/data` (`PRAJNA_DATA_DIR=/data`),
Nixpacks build via `railway.json` (`npm run build` → `npm start`, health check on
`/api/bootstrap`). Deploys are CLI-driven from this directory:

```bash
railway up --service prajna --detach
```

Custom domain: `railway domain yourdomain.com` prints the CNAME target; add that
record at your DNS host and Railway issues the certificate automatically.
Single process, port from `PORT`, no external services.

## v0.8 — Zenith-parity workspace (2026-09-04)

The front end now mirrors the surfaces of agent.ii.inc so every feature has a
home before we make each one better:

- **Chat-first home** — greeting, one composer, mode chips (Website, Mobile App,
  Slide Deck, Research, Analysis), model picker with LIVE / YOURS / PRO badges,
  Model Council (lead + advisers), deck template picker, Fast/Deep research,
  Build/Design variant, attachments and mic.
- **Chats** — every prompt lives in a thread (`/c/:id`); mode prompts turn into
  missions and render a live run card in the thread (steps, cost, Decision
  needed / Open delivery / Watch the tape). Plain chat answers with a live
  seat when a key is loaded and says so honestly when not.
- **Sidebar** — New chat, Plugins, Factory (CLI / Community / Skills / Assets /
  Projects), Boards (beta: Mission board + Tickets & runs), Chats, and the
  footer tools (Connectors, Skills, Tools, Your keys), plan pill and user menu.
- **Boards** — Kanban of every mission plus a task map of each plan by
  dependency depth. **Tools** — Task agent, Media, Browser switches + MCP
  servers. **Connectors** — 50-app catalog with search, categories, Popular
  grid and Connected accounts (Google/Slack/Notion/GitHub run real OAuth).
- **Account** — profile, dashboard, assets, personalization, language,
  subscription tiers (demo billing), invoices, settings, help. **Media** —
  local procedural image/motion studio; hosted models route once a key is
  loaded.
- New desk: **Mobile** (phone-framed artifact) and a **Design** variant for
  website missions.

Server additions live in `server/workspace.js` (chats, projects, plugins,
tools, MCP registry, profile, plan tiers, boards, deck templates, connector
catalog) and the `/api/chats*`, `/api/projects*`, `/api/plugins`, `/api/tools`,
`/api/mcp`, `/api/profile|personalization|language|plan`, `/api/boards`
routes. Keys and OAuth tokens remain memory-only.

## v0.9 — Live authoring (2026-09-04)

The first "better than Zenith" move: when the lead seat is live (a BYOK key is
loaded for its provider), the lead model **writes the substance of the
deliverable itself** at the compose / build / design step — brief claims,
verdict and dissent; deck beats; site copy; mobile screens; analysis read and
caveats; design regions. The house lays it out, the two validator lanes gate
it exactly as they gate scripted output, and the provenance block records
`mode: "live"` with the model, character count and latency. No key → scripted
substance, labeled as such. A model reply that misses the required shape is
recorded on the tape and the scripted substance is used instead — nothing is
silently swapped.

Also fixed: two validator surface lanes (deck one-idea, chart accessibility)
were reading the house's own provenance footer as part of the deliverable.
Validators now scan the deliverable body only.

`server/author.js` holds the per-desk shapes and the authoring call.
