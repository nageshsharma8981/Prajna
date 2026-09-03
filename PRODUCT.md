# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite + React 19 SPA with hand-written CSS design tokens (no UI framework), served by a zero-dependency Node HTTP backend with Server-Sent Events for live agent runs, JSON-file persistence. Chosen for full visual control, offline-friendly local dev (user's machine has local Node only, no Docker), and easy later deploy to Railway behind a custom domain. Port 3004 (3001–3003 taken by sibling apps).

## Users

[Inferred from brief] Ambitious professionals and builders (like Nagesh) who currently use agentic AI workspaces such as agent.ii.inc ("Zenith") to get real deliverables — research briefs, slide decks, websites, analyses — and are frustrated that those products feel like chat with a spinner: opaque, unaccountable, and ending in text rather than a finished artifact. Secondary: teams evaluating agent platforms who need to trust what the agent actually did.

## Product Purpose

Praxis is an agent workspace where every request becomes a **mission** with a visible contract: the agent states the deliverable, the plan, and the estimated cost *before* running, then executes in the open — every step, tool call, and model deliberation streamed live — and ends with a tangible, versioned artifact. Success: a user watches a run once and never wants to go back to a black-box agent.

## Positioning

"Glass-box agency." Competitors (Zenith et al.) hide the work behind a spinner and surface only the answer. Praxis's uncopyable claim is the **Mission Contract → Live Flight Deck → Artifact** loop: (1) an upfront contract (deliverable, plan, cost ceiling) the user approves, (2) a live flight deck showing plan progress, tool calls, model-council deliberation and running cost in real time, (3) an artifact ledger where every deliverable is a first-class, versioned object — not a chat message. The council is a real debate with visible dissent, not a dropdown of logos.

## Operating Context

Desktop-first web app used in focused work sessions (research, deck building, site building, analysis). Dark and light themes both first-class. Keyboard-first: global command palette (⌘K). Will later be wired to a custom domain; local dev on port 3004 alongside sibling apps.

## Capabilities and Constraints

- Missions: research brief, slide deck, website build, data analysis (launch set).
- Live run engine streams over SSE; runs in **demo mode** by default with a high-fidelity scripted engine producing real artifacts; if `ANTHROPIC_API_KEY` is present the engine can call real models (provider layer exists, demo is default). All demo output is labeled synthetic in code, not in the UI copy (the UI presents the product as it will behave in production).
- Model Council: user picks a lead model + advisers; deliberation (positions, challenges, synthesis) is rendered live.
- Artifact ledger: every mission ends in an artifact (HTML brief, deck, site preview, analysis dashboard) with versions and provenance (which steps/sources produced it).
- Skills library and Connectors gallery (static catalog at launch; connect flows stubbed).
- Credits meter with per-run cost accounting.
- No real user auth at launch (single-workspace local product); no real third-party OAuth yet.
- Uninventable and therefore absent: real customer logos, testimonials, benchmarks, pricing claims.

## Brand Commitments

Name: **Praxis** (from the Greek — theory put into action). Voice: calm, precise, a little audacious; never hype. The brief binds: "best in class UI and UX", "create distinction and UVP" — a distinctive committed visual world, not a beige clone of the incumbent.

## Evidence on Hand

Eight screenshots of the incumbent (Zenith / agent.ii.inc) provided by the user as competitive evidence — cream-paper aesthetic, serif display, chat-first layout, connector/tool/skill galleries, model-council modal, template picker. These are anti-reference for the visual world and feature-reference for scope. No other assets; all demo content must be authored at production fidelity.

## Product Principles

1. **Contract before action.** The agent commits to a deliverable, plan, and cost before it spends anything.
2. **Work in the open.** Every step, tool call, and deliberation is visible live; trust is earned by transparency, not claimed.
3. **Artifacts, not answers.** A mission that ends in prose has failed; it ends in a versioned, exportable object.
4. **Dissent is a feature.** The council shows disagreement and how it was resolved, never a fake consensus.
5. **Keyboard-first calm.** Fast, quiet, precise; the interface recedes while the work performs.

## Accessibility & Inclusion

WCAG AA contrast in both themes; full keyboard operability (palette, focus order); reduced-motion respected for all streaming/motion effects.
