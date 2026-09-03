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

## Deploy

Single process, port from `PORT` (default 3005), no external services. Point any
Node host (Railway etc.) at `node server/server.js` after building `web/dist`.
Set `PRAJNA_DATA_DIR` for persistent storage.
