# Prajñā handover

A complete description of what Prajñā is, how it is built, and the rules it is built under, written so that an engineer or an agent (Codex, Claude, a person) who has never seen the repo can understand it end to end, continue it, or rebuild it from scratch in the same shape. Read this first, then `AGENTS.md` (the eight rules), then `PRODUCT.md` (positioning), then `DESIGN.md` (the visual world), then the release notes at the end of `README.md` (v1.0 to v1.65, every decision with its reason).

Repo: `github.com/nageshsharma8981/Prajna`. Live: `https://www.prajñā.com` (punycode `www.xn--praj-jqa0h.com`), deployed on Railway. Version at the time of writing: **1.65.0**, 62 tests, all green.

---

## 1. What it is, in one paragraph

Prajñā is a **contract-first agent workspace**. A person states an outcome; the house writes a **ticket** (a contract: the plan as a dependency graph of steps, a credit estimate, a ceiling, the acceptance assertions, who sits on the bench); the person **stamps** it; the run then executes **in the open** as a stream of events (the **tape**), with a bench of models stating positions and challenging each other, dissent recorded; and it ends in a **versioned artifact with provenance** (a working HTML deliverable: a research brief, a slide deck with film, a landing page, a working mobile app, or an analysis dashboard), never in prose. Every claim in the deliverable says what it rests on. Everything the house did can be audited, replayed, exported, shared and revoked. Model keys are the user's own, held in memory only.

It was built to beat `agent.ii.inc` ("Zenith") on substance: Zenith's flagship deck is thirteen PNG pictures; Prajñā's is an editable PowerPoint with notes, audio and a narrated film. See section 13 for the feature-by-feature comparison.

## 2. The five principles (every decision follows from these)

1. **Contract before action.** Nothing is spent until the ticket is stamped. Costs, ceilings, steps, access classes and bench pricing are decided once in `writeContract` and never re-decided at runtime.
2. **Work in the open.** Every step, model position, tool call, cost tick, decision and refusal is an event on the tape with a monotonic sequence number, streamed live over SSE and kept forever.
3. **Artifacts, not answers.** Every terminal state produces an artifact, even a killed or ceiling-stopped run (marked partial). The artifact is a self-contained HTML file carrying its own runtime, a human provenance footer, and a machine-readable provenance object.
4. **Dissent is a feature.** The bench never fakes consensus. A recorded objection survives into the deliverable itself.
5. **Honesty over polish.** Scripted (no key) output is labelled scripted. A live call that fails falls back visibly with the error on the tape. Invented figures are refused at the gate. Keys are never written to disk.

Vocabulary (keep it): *house* (the running instance), *ticket* (mission contract), *stamp* (approve and run), *tape* (event ledger), *bench* (lead model plus advisers; internally `council`), *desk* (a deliverable type), *credits* (the priced unit), *owner* (whoever first signed a name), *visitor* (anyone with the signed cookie), *look* (a deck's single visual system), *record* (a mission's full audit), *delivery* (an artifact). Write copy in plain sentences, no em dashes, say "model" not "seat" in user-facing text.

## 3. Stack and layout

Zero-dependency Node 22 ESM server plus a React 19 + Vite SPA. No database: JSON files, atomically written. No UI framework: one hand-written stylesheet driven by `DESIGN.md` tokens.

```
prajna/
  server/        the house (see file map below)
  web/           Vite + React SPA; web/src/{App.jsx, views/, components/, lib/, styles/app.css}
  cli/prajna.mjs zero-dependency CLI that talks to the API with a session cookie
  test/house.test.mjs   one file, 62 tests, spawns real servers
  scripts/postdeploy-check.mjs   hits the live URL after a deploy
  data/          runtime state (missions.json, artifacts.json, workspace.json,
                 workspace-ui.json, connectors.json, models.json, artifacts/*.html,
                 tape/*.json, media/*.{png,jpg,wav}); overridable with PRAJNA_DATA_DIR
  README.md      product intro + ALL release notes, oldest first, appended at the END
  AGENTS.md PRODUCT.md DESIGN.md PROVENANCE.md THIRD_PARTY_LICENSES.md
  railway.json   build: npm run build; start: npm start; healthcheck /api/bootstrap
```

Scripts: `npm run build` (installs web deps, `vite build` into `web/dist`, served statically), `npm start`, `npm test`, `npm run check <url>`.

Environment: `PORT` (3005 locally), `PRAJNA_DATA_DIR`, `PRAJNA_OWNER` (a name that is the owner regardless of who signs first), `PRAJNA_ACCESS_CODE` (optional door code), `PRAJNA_SECRET` (cookie-signing secret; otherwise minted and kept in workspace.json), `PRAJNA_PUBLIC_URL` (used in share links sent outward), `PRAJNA_ALLOW_LOCAL_PAGES` (tests only: let the browser tool read localhost), `PRAJNA_TEST_TOKENS` and `PRAJNA_API_BASE_<PROVIDER>` (tests only: seed connector tokens and point provider APIs at mocks), `PRAJNA_WIKI_BASE`.

### Server file map (what each module owns)

| File | Owns |
|---|---|
| `server.js` (1971 lines) | HTTP router, static serving, SSE, cookies and gates, all `/api/*` routes, `/s/`, `/r/`, `/legal/`, `/status`, house check and repair, rate limits |
| `engine.js` (1433) | `writeContract` (plans per desk, costs, ceiling from history, assertions, bench pricing), the run loop (steps in dependency order, parallel where independent), bench deliberation, live authoring hook, illustrate and narrate steps, gate, settlement, attention (pause and decide), fork and amend, key plan |
| `artifacts.js` (1239) | Generators per desk: `briefArtifact`, `deckArtifact` (+ `deckSlides`, `deckLook`, `LOOKS`, `deckRuntime`, `deckFilm`), `siteArtifact` (+ `siteRuntime`, `siteCanvas`), `analysisArtifact`, `mobileArtifact` (+ `mobileRuntime`), `designArtifact`; provenance footer and JSON |
| `validators.js` | The definition of done: assertion catalogue per desk, two independent lanes (scrutiny reads structure, surface exercises behaviour), figure sourcing check, gate evaluation |
| `author.js` | Live authoring: strict-JSON shapes per desk, prompt assembly (standing instructions, memories, sources, data, adviser positions, revision feedback), parse and minimum checks, adviser critique |
| `providers.js` | BYOK calls: `callModel`, `streamModel` (OpenAI-compatible and Anthropic and Gemini), `generateImage` (gpt-image-1, Gemini image), `synthesizeSpeech` (OpenAI speech WAV, Gemini TTS PCM to WAV), `braveSearch`, `testKey`, `maskKey`, usage capture |
| `store.js` | State in memory, JSON persistence, atomic writes, missions, artifacts (`addArtifact`, `refreshArtifact`, `artifactHtml`), keys (memory only, `flushKeys` is a deliberate no-op), OAuth apps and tokens (memory only), credits reserve/settle/release, custom models |
| `workspace.js` | Per-house UI state (`ws()`): chats, projects, plugins, tools, profile, personalization, houseBrief, plan, media index, showcase, ledger, consent, visitors, connector targets; `CONNECTOR_CATALOG` (the one the server uses), `PLUGINS`, `TOOLS`, `DECK_TEMPLATES`, `PLANS` |
| `catalog.js` | Models (`MODELS`, custom resolver), `DESKS` (blurbs, placeholders, samples), `SKILLS`, a display-only connector list |
| `record.js`, `bundle.js`, `delta.js`, `narrate.js` | Provenance object, the audit bundle HTML (with the replay header and tape player), amendment delta, plain-words narrative |
| `office.js` | DOCX (prose only), PPTX (16:9, pictures, notes, slide audio, look-aware colours and face), XLSX; `lookFromHtml` |
| `export.js` | `zipStore` (stored zip writer, CRC32), workspace export/import, backups (seven kept), erase |
| `expo.js` | Packs a delivered mobile app as an Expo project zip (App.js with AsyncStorage, app-data.json, icon, README) |
| `canvas.js` | Applies canvas edits (text by key, order, look) to a stored page as data, stamps the "Edited by hand" provenance row |
| `memory.js` | Per-visitor memories, what the house noticed (derived), the "About the person asking" brief for authors |
| `proven.js` | Proven briefs read off the record (delivered, first-time gate, at estimate, live, repeated) |
| `connect.js`, `oauth.js` | Real OAuth 2.0 (Google, Slack, Notion, GitHub, Microsoft), gather evidence from connected apps, deliver behind approval (Slack post, Notion page, Gmail draft, Outlook draft, GitHub issue) |
| `retrieve.js`, `search.js`, `evidence.js`, `compose.js`, `data.js`, `clarify.js`, `review.js` | Web retrieval and page reading, house full-text search, cited-address re-check, keyless composition from sources, CSV profiling, thin-goal questions, terminal review |
| `standing.js`, `history.js`, `limits.js`, `hooks.js`, `digest.js`, `docs.js`, `legal.js`, `ledger.js` | Standing orders (repeat), cost history (estimate from real cost), house limits, outbound webhooks, weekly digest, attachment text extraction, legal texts and consent versioning, credit ledger |

## 4. Data model

Everything is plain JSON. Ids are short random hex; serials are `PJ-<n>`, minted from a counter that survives restarts.

**Mission** (`missions.json`, one per ticket): `id, serial, goal, subject, desk, deskName, deliverable, lead, advisers, councilNames, status, contract{plan[], estimate, ceiling, ceilingFrom, dimensions, assertions[], why, access, edited}, writtenBy{name,at}, askerId, thin, lineage{parentId,parentSerial,version,feedback[]}, variant ('build'|'design'), template, depth ('fast'|'deep'), chatId, attachments, data (profiled CSV), sources[], connected[], patches[], acceptedRisks[], validations[{round,rows,gate}], spent, eventSeq, events[] (the tape), attention[], gate, review, settlement{reserved,settled,released}, partial, createdAt, launchedAt, filledAt, artifactId, authored{live,model,content,usage,revisions}, critiques[], dissent{model,text}, visuals[{slide,id,file,prompt,model}], narration[{slide,id,seconds,voice}], look{id,by,mood,paper,ink,acc,type,image,kicker}, keyUse, deliveries[], redeliveries[], revocations[], edits[], shareToken, sharedAt, sharedVia, narrative, standing`.

Status machine: `OPEN → LIVE → FILLED | KILLED | PAUSED_ATTENTION | PAUSED_CEILING` (paused returns to LIVE on a decision).

**Plan step**: `{ id, title, tool, cost, access ('read'|'write'|'external'), dependsOn[], status, requiresConfirmation, seats[] }`. Tools: `scope, search, cite-guard, council, steelman, compose, storyboard, deck-doctor, copy-cutter, build, a11y-audit, ingest, analyze, chart-smith, illustrate, narrate, connector-post, design`. External steps always hold for approval.

**Event** (tape): `{ seq, at, type, stepId?, label?, live?, detail?, text?, ... }`. Machine types are stable ids: `run.launched, step.status, log, council.position, council.challenge, council.verdict, cost, attention.raised, attention.decided, gate, settlement, ...`. Rename labels in the client, never these.

**Artifact** (`artifacts.json` + `artifacts/<id>.html`): `id, serial, missionId, title, kind ('brief'|'deck'|'site'|'mobile'|'analysis'|'design'), desk, tint, cost, council, partial, voided, version, supersedes, createdAt, shareToken, sharedAt, sharedVia, notes[], hasData, editedAt, editedBy, edits`.

**Workspace** (`workspace.json`): name, credits, reserved, spent, ledger. **Workspace UI** (`workspace-ui.json`): see `workspace.js ensure()`: chats, projects, plugins, tools, mcp, profile, personalization, houseBrief, language, plan, invoices, media[], showcase[], ledger[], consent, boards, visitors{id: {name,email,handle,bio,at,lastSeen,consent,memories[]}}, ownerId, secret, connectorTargets, guests policy, limits, hooks, voice.

**Never persisted**: `store.state.keys`, `store.state.oauthApps`, `store.state.tokens`. A restart clears them and the house says so (`/api/health`, house check "media" row, a banner on Home).

## 5. The run lifecycle

1. **Ask.** `POST /api/missions {goal, deskId, lead, advisers, depth, variant, template, attachments}` or `POST /api/chats/:id/messages {text, mode}` (modes map to desks: website→site, mobile, deck, research→brief, analysis). `clarify()` marks a thin goal and attaches questions instead of refusing.
2. **Contract.** `writeContract` builds the desk's plan (section 3 table in `engine.js`), removes skill steps that are not installed and re-points dependents, adds a `connector-post` step per connected app, prices the bench (house models share the council cost; a model whose provider key is held is live and costs 0 house credits), sets the estimate as the sum of step costs and the ceiling from real cost history (`history.js`) or estimate plus 25%, writes the assertions the plan steps own, and a `keyPlan` forecast (images, clips, authoring calls) for the ticket. House limits (`limits.js`) refuse before anything is reserved.
3. **Stamp.** `POST /api/missions/:id/launch` reserves the ceiling from the credit pool and starts the run. Plan can be edited before stamping (recorded as `contract.edited`).
4. **Run** (engine loop). Steps execute when their dependencies are FILLED; independent steps run in parallel. Each step emits `step.status` and its own events. Special steps:
   - `search`: web retrieval (`retrieve.js`, Brave if a key is held, else a keyless engine), owner attachments first, pages the goal names read server-side when the Browser tool is on; connected apps `gather()` evidence onto `sources[]`.
   - `council`: every bench model states a position, advisers challenge, a verdict; live models speak through their key, others are scripted and labelled. Dissent is captured into `mission.dissent`.
   - `compose`/`build`/`design`: **live authoring** (`author.js`) if the lead's key is held: the model writes the substance as strict JSON in the desk's shape, streamed to the tape as it writes; advisers critique; a failed gate triggers one revision; if the lead refuses, an adviser stands in and the artifact says so. Without a key: `compose.js` quotes and cites the real sources, never invents.
   - `illustrate`: for a deck, `deckLook(m)` chooses one look (authored or house `LOOKS` matched by goal keywords) and records it; every slide (all nine) gets a picture generated on the owner's image key in that look, three at a time, 90 s cap each; site gets a hero, mobile an icon. An amendment reuses the parent's pictures for unchanged slides. No key: the house draws deterministic SVG visuals and says why on the tape.
   - `narrate`: one speech clip per slide on the speech key, in the house voice.
   - `connector-post`: pauses for approval, then delivers with a public share link the house checks before calling it delivered.
5. **Attention.** A step needing approval, a ceiling hit, a gate failure or a risk raises `attention` and the mission pauses. `POST /api/missions/:id/attention/:aid {decision, justification}` records who decided and continues. Options include `approve-step, patch, raise-ceiling, accept-risk, continue, stop`.
6. **Gate.** `validateArtifact` runs both lanes over the real HTML; `evaluateGate` seals assertions both lanes pass, reports dissent and misses; `VAL-FIGURES-SOURCED` catches invented numbers in live output; `VAL-CLAIMS-SOURCE-SPEAKS` catches a citation whose source does not mention the claim.
7. **Settle.** Spent credits settle from the reserve, the rest is released; `credits + reserved + spent` always reconciles. `tellTheStory` writes the plain-words narrative into the thread.
8. **Deliver.** The artifact is written with its provenance footer and `#prajna-provenance` JSON, versioned, linked from the mission. Terminal review runs. Webhooks fire. Standing orders schedule the next run.

Everything is observable live: `GET /api/missions/:id/events` is an SSE stream of the tape; the Run view renders it. `GET /api/pulse` is a cheap change counter the client polls.

## 6. The desks and their runtimes

Each artifact is one HTML file with its runtime serialised in via `fn.toString()` and data passed as `<script type="application/json" id="...">` or `data-*` attributes; per-page state lives in `localStorage` under `prajna-<desk>-<serial>`. Every page has `[hidden]{display:none!important}` (a lesson learned twice).

- **Research desk (brief)**: verdict first, claims graded A to D with the source line each rests on, refuted claims, moves and tripwires, recorded dissent, a decision the reader records. Exports DOCX.
- **Deck desk**: nine beats (title, two claims, the one sentence, four claims, the close). One **look** across the deck (palette, serif or sans display, image style, kicker line). Runtime: keyboard and swipe navigation, presenter notes with clock (N), overview grid (Esc), fullscreen (F), print handout with notes. **Film** (P): canvas render at 1920x1080 with Ken Burns motion, crossfades, narration audio, exported via `MediaRecorder` as MP4 (or WebM) with the audio track. Exports PPTX with pictures, presenter notes, slide audio, and the look's colours and face.
- **Site desk**: landing page, hero picture, promise/proof/action copy, a waitlist form that validates and stores locally, dissent carried. **Canvas**: an in-page editor (Edit page) turns marked texts editable, reorders the three reasons, offers five looks; saving posts `{text:{key:value}, order:[...], look}` to `/api/artifacts/:id/edits`; the server re-renders, escapes everything, bumps the version and stamps an "Edited by hand" provenance row. Markup never crosses the wire.
- **Mobile desk**: a **working** app in a phone frame: four screens, tab bar, search, add, edit, mark done, delete, settings, theme, installable (manifest, apple-touch-icon with the drawn icon). Exports an **Expo project zip** (`/api/artifacts/:id/expo`) with the same app in React Native and AsyncStorage; proven to compile to a Hermes bundle.
- **Analysis desk**: one-paragraph read, trend line with mean toggle and pointable readouts, segment bars with the outlier highlighted, a sortable table, CSV download, caveats. Reads the first CSV attached. Exports XLSX with the arithmetic.
- **Design variant**: an annotated region draft instead of a build.

## 7. Security and access model

- **Door**: optional access code (`authed`), session cookie `prajna_session` (HMAC), rate-limited tries.
- **Identity**: every visitor gets a signed `prajna_who` cookie on first sign-in; `whoId(req)` verifies the signature with the house secret. A name is required to sign in, nothing else.
- **Owner**: the first person to sign a name, or `PRAJNA_OWNER`. `ownerGate` protects keys, OAuth apps, models, standing instructions, limits, voice, backups, erase, import. `houseGate` (destructive and house-level acts) requires a *claimed* owner: an unclaimed house refuses erase, restore, adding or removing models and instructions, so nobody can plant a model that exfiltrates a key the owner later loads.
- **Guests**: the owner sets what a guest may do (`/api/guests`: work, ask, read). `guestGate(req,res,'write'|'spend')` enforces it. Default deny: every non-GET `/api/*` except `OPEN_TO_ALL = ['/api/session','/api/consent','/api/logout','/api/me']` passes consent, door and guest gates in one place at the top of the router.
- **Consent**: Terms, Privacy and GDPR, AI Disclaimer are versioned in `legal.js`; each person accepts per version; the acceptance record is theirs and survives erase via `keepHouse`.
- **Keys**: BYOK per provider (`PUT /api/keys/:provider {key, baseUrl}`), memory only, masked in every response, visible and testable only by the owner, never in exports or backups. OAuth client ids and secrets and tokens the same.
- **Per-visitor privacy**: chats belong to whoever started them; memories are readable only by the visitor who left them (owner included); missions record `askerId`.
- **Sharing**: `/s/<32hex>` a delivery (plus `.docx/.pptx/.xlsx`), `/r/<32hex>` a record as a replay; both revocable; revocations are on the record; sharing a record shares its delivery (`sharedVia:'record'`) and revoking closes both; showcase entries share both (`sharedVia:'showcase'`). Shared pages are rate-limited per IP and `noindex`.
- **Frames**: artifact and share routes are the only ones without `X-Frame-Options`; the SPA embeds artifacts in a sandboxed iframe.
- **Erase and restore**: typed confirmation; the signing secret and the actor's ownership survive (`keepHouse`) so the eraser keeps the house.

## 8. Routes (grouped)

- Session and door: `GET /api/session`, `POST /api/consent`, `POST /api/me`, `POST /api/logout`, `GET /api/legal`, `/legal/(terms|privacy|ai)`, `GET /api/bootstrap` (everything the lists need, lean), `GET /api/pulse`, `GET /api/health`, `/status`.
- Missions: `POST /api/missions`, `GET/POST /api/missions/:id` (+ `/launch, /events (SSE), /attention/:aid, /stop, /fork, /next, /share, /bundle, /redeliver, /plan`), `GET /api/history`, `GET /api/review`, `GET /api/search?q=`.
- Artifacts: `GET /api/artifacts/:id/(html|docx|pptx|xlsx|expo)`, `POST /api/artifacts/:id/(share|notes|edits)`, `DELETE .../share`, `DELETE .../notes/:nid`.
- Chats and companion: `POST /api/chats`, `POST /api/chats/:id/messages` (SSE when a model is live), `/api/projects`, `/api/boards`.
- Bench and keys: `GET/POST /api/models`, `DELETE /api/models/:id`, `PUT/DELETE /api/keys/:provider`, `POST /api/keys/:provider/test`.
- Connectors: `PUT/DELETE /api/oauth/:provider/app`, `GET /api/oauth/:provider/start`, `GET /api/oauth/:provider/callback`, `POST /api/oauth/:provider/disconnect`, `PUT /api/connectors/:id/target`.
- House: `/api/housebrief, /api/voice, /api/voice/preview, /api/limits, /api/hooks, /api/hooks/test, /api/guests, /api/standing, /api/standing/:id, /api/housecheck, /api/housecheck/repair, /api/export, /api/import, /api/erase, /api/backup, /api/backups/:name, /api/digest, /api/digest/send, /api/evidence, /api/releases`.
- Person: `GET/POST/DELETE /api/memories`, `DELETE /api/memories/:id`, `PATCH /api/profile`, `PATCH /api/personalization`, `PATCH /api/language`, `PATCH /api/plan`, `POST /api/credits/topup`.
- Foundry: `GET /api/proven`, `POST /api/showcase`, `DELETE /api/showcase/:id`, `/api/plugins/:id/toggle`, `/api/tools/:id/toggle`, `/api/skills/:id`, `/api/mcp`.
- Media: `POST /api/media/generate`, `GET /api/media/:id(.ext)` (owner, or public when its mission is shared).
- Public: `/s/:token(.docx|.pptx|.xlsx)`, `/r/:token`, `/assets/*`, `/fonts/*`, SPA fallback.

## 9. The web app

Routes in `App.jsx`: `/` Home (composer with modes, first-run guide, `?desk=&brief=` prefill), `/c/:id` thread, `/run/:id` (ticket, tape, attention decisions, result panel with the Open button first), `/missions` Floor, `/artifacts` Ledger, `/artifact/:id` viewer (Notes, Amend, Share, Download, Word, Excel, PowerPoint, Native app, Open full tab), `/compare/:a/:b`, `/boards` Docket, `/plugins` Toolroom, `/factory/(cli|community|skills|assets|projects)` Foundry (Terminal, Showroom with proven briefs and showcase, Crafts, Deliveries, Folders), `/tools` Instruments, `/connectors` Wiring, `/skills` Crafts, `/keys` Your keys (provider keys, custom models, OAuth apps), `/media` Darkroom, `/account/(profile|dashboard|assets|personalization|memory|language|subscription|invoices|settings|help)`, `/releases`, consent gate before anything.

Room names (v1.65) are labels only; routes, API paths, CSS classes and record fields keep the older names. The bench is `council` in code and events.

State: `lib/store.jsx` loads `/api/bootstrap`, polls `/api/pulse`, refreshes on change. Router is a tiny history wrapper. Command palette (⌘K) in `components/Palette.jsx`. The composer (`components/Composer.jsx`) holds mode, depth, template, the bench picker, attachments and voice input.

Design: `DESIGN.md` is the contract (tokens, type ramp, radii, motion). The world is a trading floor: Solari split-flap boards (`SplitFlap.jsx`), amber LED telemetry in Doto, Archivo display with a width axis, paper order tickets tinted by desk (research amber, deck rose, site blue, mobile rose, analysis green). Night and day themes, WCAG AA, keyboard first, reduced motion respected. Fonts self-hosted under `web/public/fonts`.

## 10. Tests and how to work

`npm test` runs `test/house.test.mjs` with Node's test runner: it spawns real servers on random ports with `mkdtemp` data dirs, plus mock HTTP servers standing in for model, image, speech, Slack and Microsoft Graph APIs (pointed at via `PRAJNA_API_BASE_*` and BYOK `baseUrl`). Helpers: `ownerOf(base)`, `ownerPost`, `ownerApi` act as the claimed owner (self-healing after an erase). Full suite takes ten to fifteen minutes; run one test with `node --test --test-name-pattern="<words>" test/house.test.mjs`.

The working method that produced v1.25 to v1.65, and that the repo expects:

1. One change per version. Bump `package.json`, write the code, write or extend the test that proves it against real output, run the full suite to green.
2. Append a release note at the **end** of `README.md` under `## vX.Y: <title> (YYYY-MM-DD)`: what was wrong, what changed, what was proved. The releases page and a test parse these; newest must be last in the file.
3. Verify in a browser (the SPA and the artifact) before shipping when the change is visible.
4. `git commit`, `git push origin main`, `railway up --service prajna --detach`, wait for `/api/health` to report the version, then `node scripts/postdeploy-check.mjs https://www.xn--praj-jqa0h.com`.

Traps recorded so nobody hits them twice: the server's connector catalogue is `CONNECTOR_CATALOG` in `workspace.js`, not the list in `catalog.js`; a profile email is set only on the very first sign-in (use `PATCH /api/profile` in tests); artifact CSS needs `[hidden]{display:none!important}` because a display rule can override the attribute; template strings inside `fn.toString()` runtimes must avoid octal escapes; a deck now has nine pictures and nine clips (tests count them); `PRAJNA_DATA_DIR` must be absolute; Expo SDK 52 projects need `expo-asset` listed or the bundler fails.

## 11. Media, keys and providers

Providers recognised: `anthropic`, `openai` (and any OpenAI-compatible base URL: DeepSeek, Together, local), `google`. Images: OpenAI `gpt-image-1` or Gemini image models. Speech: OpenAI `/audio/speech` (WAV) or Gemini TTS (PCM wrapped to WAV). Search: Brave if a key is held. Every call reports usage to `keyUse` on the mission; the ticket's `keyPlan` forecasts calls before stamping. Media Generation is a tool toggle (`ws().tools.media`), on by default, and spends nothing until an image or speech key is held. Generated media lives in `data/media` indexed in `ws().media`; the house check counts orphans and repair removes them.

## 12. Connectors

`oauth.js` defines each provider (auth and token URLs, scopes, identity call, an evidence probe shown on connect). The owner registers the OAuth app (client id and secret, memory only) on Your keys; Connect on Wiring starts the flow; the callback stores the token in memory. `connect.js`: `gather(cid, goal)` searches the app for the goal's words and puts results on `sources[]` (Gmail, Drive, Docs, Sheets, Calendar, Slack, Notion, GitHub, Outlook, OneDrive); `deliver(cid, mission, link)` posts behind approval (Slack channel with threading on re-delivery, Notion page updated in place, Gmail and Outlook drafts to the profile email, GitHub issue with comments on re-delivery). Targets (channel, parent page, repo) are set on the Wiring page. Every delivery records `{connector, id, url, where, ok, linkOk}` and revocations mark dead links.

## 13. What Prajñā has that Zenith has, and what it has more of

| Area | Zenith (agent.ii.inc) | Prajñā |
|---|---|---|
| Deck | Image per slide, no editable file in its showcase | Editable PPTX with notes, audio, one look across nine illustrated slides, narrated film export |
| Mobile | Expo skill | Working web app in the browser plus an Expo project zip with the drawn icon |
| Site | Design canvas with Figma export | In-page canvas whose edits are data, versioned with provenance (no Figma export yet) |
| Sharing | Session replay, fork | Record replay with three phases, tape player, gate result and cost, fork to the composer, delivery share, all revocable |
| Trust | None comparable | Contract, two-lane gate, figure sourcing, citation check, recorded dissent, audit bundle, house check and repair, export and restore |
| Memory | Agent memories | Per-visitor memories plus what the house noticed, private to the visitor, read by every author |
| Reuse | Proven-prompt gallery by likes | Proven briefs ranked by the record (first-time gate, at estimate, live, repeated), showcase with replay |
| Connectors | Gmail, Drive, Docs, Notion, Slack, Outlook, Calendar, YouTube, Maps, Composio | Google (Gmail, Drive, Docs, Sheets, Calendar, YouTube evidence), Slack, Notion, GitHub, Microsoft (Outlook, OneDrive); real OAuth, deliveries behind approval |
| Models | Credit-metered picker | Bring your own keys, memory only, live models at zero house credits, custom endpoints |
| Not yet | Video generation (seedance), Figma export | Candidates: Veo through the Gemini API on the owner's key for the Darkroom and a deck intro; Figma export of the site canvas |

## 14. Rebuilding from scratch, in order

If you are replicating rather than continuing, build in this order; each step is testable on its own and the earlier ones never change shape later.

1. `store.js` + `server.js` skeleton: JSON files, atomic writes, static SPA, `/api/health`, `/api/bootstrap`, cookies, `authed`.
2. Identity and consent: `legal.js`, `/api/consent`, `/api/me`, `prajna_who`, owner, `ownerGate`, `houseGate`, `guestGate`, the default-deny block.
3. `catalog.js` and `workspace.js`: desks, models, plans, tools, plugins, connector catalogue, UI state.
4. `engine.js` `writeContract` and the run loop with scripted steps, the tape, SSE, attention, settlement, standing orders and history.
5. `artifacts.js` generators, one desk at a time, with the runtime pattern and the provenance footer; `validators.js` lanes and gate alongside each.
6. `providers.js` and `author.js`: BYOK, live authoring, critique, revision, stand-in.
7. Illustrate, narrate, look, film; `office.js` exports; `export.js` zip, export, backups, erase, restore.
8. The web app: bootstrap store, composer, Run view, artifact viewer, then the rooms.
9. Sharing, replay (`bundle.js`), canvas, Expo packer, memories, proven, showcase.
10. `oauth.js` and `connect.js` providers.
11. CLI, post-deploy check, Railway config.

Write the test for each step as you go in the style of `test/house.test.mjs`: spawn the real server, mock only what is outside the house, assert against the real HTML and the real record.

## 15. Things to know before changing anything

- Never persist keys, tokens or OAuth secrets. `flushKeys` is a no-op on purpose.
- Never let markup from a browser into a stored page; the canvas takes words, an order and a look name only.
- Every write route sits behind the default-deny block; a looser route must be added to `OPEN_TO_ALL` deliberately.
- Event type ids and record fields are an API; the CLI, the bundle and the tests read them.
- Release notes go at the end of `README.md`; ISO dates; one note per version.
- Copy: plain sentences, no em dashes, world nouns kept, "model" not "seat", the house speaks in the first person plural only in legal texts.
- Design: use `DESIGN.md` tokens; the `impeccable` hook flags literal colours and sizes; generated artifacts and exported native projects carry their own palettes by design.
- The live house holds no keys after a restart; do not assume one is loaded when reading `/api/health` in production.
