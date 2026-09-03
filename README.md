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

## Deploy

Single process, port from `PORT` (default 3005), no external services. Point any
Node host (Railway etc.) at `node server/server.js` after building `web/dist`.
Set `PRAXIS_DATA_DIR` for persistent storage.
