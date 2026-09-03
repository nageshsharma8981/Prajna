# Praxis — The Outcome Exchange

An agent workspace where every request becomes a **mission with a visible contract**:
the agent states the deliverable, the plan, and the price *before* running, executes
in the open — every step, tool call, and model deliberation streamed live — and ends
with a tangible, versioned artifact.

Built as a direct answer to chat-with-a-spinner agent platforms (Zenith et al.).

## The three refusals (the UVP)

1. **Contract before action.** The house writes an order ticket — full plan, credit
   estimate, hard ceiling — and nothing runs until you stamp it.
2. **Work in the open.** The run deck streams the tape live: tool calls, the model
   council's positions, challenges, verdict — and recorded dissent, never erased.
3. **Artifacts, not answers.** Every mission ends in a versioned artifact in the
   ledger (decision brief, deck, landing page, analysis) with provenance and cost
   stamped on it. A mission that ends in prose has failed.

## v0.2 — the contract made mechanical

- **Event ledger.** Every run event carries a monotonic `seq` (`praxis.event.v1`);
  SSE honors `Last-Event-ID`, and `GET /api/missions/:id/events?after=N` replays
  the ledger. Live view, reconnect, and history are one code path.
- **Settlement.** The ceiling is a reservation: every run ends with
  reserved / settled / released printed on the tape and in the artifact. A live
  burn-down meter shows settled-vs-estimate variance per step.
- **Always an artifact.** Kill a live position or hit the ceiling — the run
  pauses or closes with a *partial artifact*, stamped as such. No terminal state
  ends in nothing.
- **Council gate.** The council votes pass / fail / unverifiable per acceptance
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
  `praxis.provenance.v1` — contract, settlement, gate table, review, decisions,
  honest `mode: "scripted"` label — refreshed at settlement.

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
git worktree add ../praxis-v0.1 v0.1.0
```

Data note: `data/` is gitignored runtime state; deleting it reseeds the demo workspace.

## Deploy

Single process, port from `PORT` (default 3005), no external services. Point any
Node host (Railway etc.) at `node server/server.js` after building `web/dist`.
Set `PRAXIS_DATA_DIR` for persistent storage.
