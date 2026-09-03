---
name: Prajñā
description: The outcome exchange — agentic work rendered as a trading floor of split-flap boards, LED telemetry, and paper order tickets.
colors:
  ground: "#0c0f0e"
  hall: "#121614"
  panel: "#161b18"
  flap: "#1b211d"
  flap-hi: "#232a25"
  flap-ink: "#ece7d9"
  line: "#262d28"
  line-strong: "#37403a"
  bone: "#ece7d9"
  bone-dim: "#a8ab9c"
  bone-faint: "#8f968a"
  led: "#ffb300"
  led-deep: "#8a6510"
  led-bg: "#0a0c0a"
  paper: "#f1ecdd"
  paper-shade: "#e2dcc9"
  ink: "#1b201c"
  ink-dim: "#565e55"
  amber: "#e3a93c"
  amber-deep: "#7a5210"
  rose: "#e3826f"
  rose-deep: "#7c3428"
  blue: "#85abd8"
  blue-deep: "#2c4a6e"
  green: "#7fbf9a"
  green-deep: "#235c40"
  red: "#e05a4e"
typography:
  board-display:
    fontFamily: "Archivo, Helvetica Neue, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 830
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 122"
  board-lettering:
    fontFamily: "Archivo, Helvetica Neue, sans-serif"
    fontWeight: 750
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 118"
  board-label:
    fontFamily: "Archivo, Helvetica Neue, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 640
    letterSpacing: "0.18em"
    fontVariation: "'wdth' 108"
  body:
    fontFamily: "Archivo, Helvetica Neue, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  led-value:
    fontFamily: "Doto, Spline Sans Mono, monospace"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.1
  mono:
    fontFamily: "Spline Sans Mono, ui-monospace, SF Mono, monospace"
    fontSize: "0.8rem"
rounded:
  tile: "3px"
  control: "4px"
  card: "6px"
  board: "8px"
  pill: "999px"
spacing:
  gap-tight: "0.7rem"
  pad-card: "1.4rem"
  gap-section: "1.5rem"
  gutter-page: "2.4rem"
components:
  button-stamp:
    backgroundColor: "{colors.led}"
    textColor: "#171102"
    rounded: "{rounded.control}"
    padding: "0.78rem 1.5rem"
  button-quiet:
    textColor: "{colors.bone-dim}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1rem"
  chip-status-flap:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.flap-ink}"
    rounded: "{rounded.tile}"
    padding: "0.32rem 0.55rem"
  desk-stub:
    rounded: "{rounded.card}"
    padding: "0.65rem 0.85rem 0.7rem"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  input-goal:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.bone}"
    rounded: "{rounded.card}"
    padding: "0.85rem 1.05rem"
  board:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.board}"
  credit-meter:
    backgroundColor: "{colors.led-bg}"
    textColor: "{colors.led}"
    rounded: "5px"
    padding: "0.6rem 0.8rem 0.7rem"
---

# Design System: Prajñā

## Overview

**Creative North Star: "The Outcome Exchange"**

Prajñā renders agentic work as a mid-century exchange floor after dark: a hall of near-black greens where Solari split-flap boards spell the signage in bone lettering, amber LED dot-matrix panels carry every live number, and the only bright objects in the room are paper — color-banded order tickets that a user stamps before a single credit is spent. The interface is built from three materials with strict jobs: **the board** (dark tiles, expanded uppercase Archivo) does signage, **the LED** (Doto glowing amber out of recessed black wells) does live telemetry, and **the ticket** (warm paper, mono serials, perforated edge, rubber stamp) does contracts. Nothing decorates; every surface is an instrument of the floor.

The world deliberately refuses the category default — chat window, spinner, cream-paper concierge calm. Trust is staged physically instead: contracts on paper before the run, machine numbers glowing during it, a versioned artifact in the ledger after. Two themes exist and both are first-class — the night hall (default) and the day desk, which relights the room in ticket-paper tones while the boards and LED wells stay dark, exactly as a real departure board would at noon.

**Key Characteristics:**
- Three-material grammar: dark board tiles, glowing amber LED, warm light paper — never blended.
- Hierarchy carried by Archivo's variable width axis and letterspacing, not by big size jumps.
- Motion imitates machinery: flap flicker, split-flap flips, stamp thunks, tape prints.
- Color-coded desk tints (amber/rose/blue/green) threaded through one `--tint` custom property.
- Keyboard-first calm: command palette, single-key navigation, visible kbd hints.

## Colors

A green-black hall punctured by one amber lamp and four paper desk tints; light surfaces exist only as paper.

### Primary
- **Signal Amber** (`led`, #ffb300): the single lamp of the hall — LED telemetry values, the ticker strip, the clock, live counts, the stamp button, focus rings, lead-model highlights, selection. Always rendered in Doto with a soft glow (`text-shadow: 0 0 9–12px rgba(255,179,0,0.4–0.45)`) when it appears as a lit number.
- **Amber Ledge** (`led-deep`, #8a6510): the pressed-edge shadow beneath the stamp button and lead-chip border — the unlit side of the lamp.

### Secondary
The four desk tints, applied only through the `--tint` custom property (see Components): **Desk Amber** (`amber`, #e3a93c), **Desk Rose** (`rose`, #e3826f), **Desk Blue** (`blue`, #85abd8), **Desk Green** (`green`, #7fbf9a), each with a deep stamp-ink partner (`amber-deep` #7a5210, `rose-deep` #7c3428, `blue-deep` #2c4a6e, `green-deep` #235c40). Green doubles as the success voice (FILLED status, artifact cards, installed toggles); blue as OPEN; **Failure Red** (`red`, #e05a4e) belongs to no desk — it appears only on FAILED/KILLED flaps and error text.

### Neutral
- **Ground** (#0c0f0e): the page floor and recessed input backgrounds.
- **Hall** (#121614): rail, masthead, card headers, hover fills — the room's walls.
- **Panel** (#161b18): boards, order pad, tape, palette — furniture one step off the wall.
- **Flap** (#1b211d) / **Flap Highlight** (#232a25): split-flap tile faces and their top-lit gradient; identical in both themes.
- **Flap Ink** (`flap-ink`, #ece7d9): lettering printed on flap tiles and symbol chips — never re-themed.
- **Line** (#262d28) / **Line Strong** (#37403a): hairline borders; the strong step for wells, inputs, and emphasized frames.
- **Bone** (#ece7d9) / **Bone Dim** (#a8ab9c) / **Bone Faint** (#8f968a): the three-step text ramp — headline, supporting, whisper.
- **Ticket Paper** (#f1ecdd) / **Paper Shade** (#e2dcc9): the light material; **Ticket Ink** (#1b201c) and **Ink Dim** (#565e55) write on it.

**Day desk theme** (`[data-theme='day']`): surfaces relight to paper tones (ground #eae4d3, hall #f1ecdd, panel #f6f2e6), the bone ramp inverts to dark olive ink (#20261f / #565d51 / #656c5e), lines warm to #d3ccb8 / #b4ac94, paper brightens to #fbf8ef, and shadows turn warm sepia. `flap`, `flap-hi`, `flap-ink`, `led`, `led-deep` keep their night values; `led-bg` shifts only to #12140f.

### Named Rules
**The Boards Stay Dark Rule.** Flap tiles, LED wells, and flap lettering keep their night-hall values in both themes. Theme switching relights the hall, never the boards.

**The Amber Is Telemetry Rule.** Signal amber with Doto and glow is reserved for numbers the machine writes live — credits, clock, ticker, counts, spend. It is never a heading color, body color, or decorative accent (the stamp button is its one solid-fill use).

**The Red Is Failure Rule.** Red belongs to no desk and no decoration; it appears only for FAILED/KILLED statuses and error copy.

## Typography

**Display/Board Font:** Archivo variable (wdth 62–125, wght 100–900), with Helvetica Neue fallback — self-hosted.
**LED Font:** Doto (dot-matrix), falling back to Spline Sans Mono.
**Mono Font:** Spline Sans Mono (300–700), falling back to ui-monospace / SF Mono.

**Character:** Three faces, three voices — Archivo expanded caps are the house painting its signage; Doto is the machine speaking in lit dots; Spline Sans Mono is the paper record (serials, timestamps, tape logs, plan costs). A glyph's face tells you who wrote it.

### Hierarchy
- **Board Display** (`h1.pg-title` — weight 830, 1.55rem, width 122%, letterspacing 0.06em, uppercase): one page title per view ("Open a position", "The ledger").
- **Board Lettering** (`.brd` — weight 750, width 118%, letterspacing 0.14em, uppercase): board-scale signage; the rail wordmark pushes further (weight 850, width 125%, 0.2em).
- **Board Label** (`.brd-sm` — weight 640, 0.72rem, width 108%, letterspacing 0.18em, uppercase): section headers on boards, rail items, card heads.
- **Body** (weight 400–500, 15px base, line-height 1.55): sentence-case prose; ledes cap at 62ch in Bone Dim (0.95rem).
- **LED Value** (Doto 700 — 1.65rem telemetry, ~1.05rem clock, 0.92–0.95rem ticker/counts): live numbers only, always amber (or green when a run completes).
- **Mono Detail** (Spline Sans Mono, 0.6–0.86rem): serials, costs, timestamps, tape lines, kbd hints, desk codes.
- **Micro Label** (0.56–0.62rem, letterspacing 0.2–0.3em, uppercase, weight 600–700): whisper-small captions above values — tally keys, telemetry keys, council labels, the hall line.

### Named Rules
**The Width Axis Rule.** Hierarchy is carried by Archivo's width axis (108% → 125%), weight, and tracking — not by large size jumps. Board lettering is always uppercase and widened; body prose is always sentence case at normal width.

**The Three Voices Rule.** Archivo for signage and prose, Doto for machine-lit numbers, Spline Sans Mono for the record. Never let one face do another's job.

## Layout

A fixed 232px left rail (hall-toned, hairline right border) beside a fluid main column: masthead (split-flap wordmark + hall line, palette hint, LED clock) over a 34px LED ticker strip, over a scrolling page. Page content centers at max-width 76rem with 1.5rem top / 2.4rem side / 5rem bottom padding. Cards use a consistent interior rhythm: 0.85rem × 1.4rem heads and feet, 1.15rem × 1.4rem bodies, 0.7rem grid gaps, 1.5rem between sections (`.section-gap`), 1.6rem between deck columns.

The run deck is a two-column grid — the paper ticket pinned at `minmax(19rem, 24rem)` on the left, the live tape filling the rest — with a four-cell LED telemetry panel full-width above. The order pad stacks input → sample chips → four-across desk stubs → council chips. Boards are single-column row lists on a 5.2rem / 1fr / auto / auto grid.

Responsive: at 1080px the deck stacks and desk stubs go two-across; at 900px the rail becomes a slide-in drawer behind a veil, telemetry goes two-by-two, and board rows drop their numeric column; at 620px desks stack single-file, board rows loosen to wrap, and the clock hides. Density never changes — small screens get fewer columns, not smaller type.

## Elevation & Depth

Depth is directional by material: **LED surfaces are recessed** — every amber panel (ticker, telemetry, credit meter) sits inside an inset well (`inset 0 2–3px 8–12px rgba(0,0,0,0.55–0.6)`) with a strong border, like glass set into the board; **paper floats** — tickets carry the heaviest drop shadow in the system; **panels sit nearly flush** with a soft ambient drop. There is no generic elevation ladder and no hover-lift shadows; hovers change fill or border, and only desk stubs rise (translateY(-1px), no shadow change).

### Shadow Vocabulary
- **Ambient** (`--shadow: 0 10px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)`): overlays — the command palette, the mobile rail drawer.
- **Ambient Soft** (`--shadow-soft: 0 6px 18px rgba(0,0,0,0.3)`): boards, order pad, tape — furniture resting on the floor.
- **Paper** (`--paper-shadow: 0 8px 22px rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.4)`): tickets only; the strongest lift in the room.
- **LED Well** (inset, e.g. `inset 0 3px 12px rgba(0,0,0,0.6)`): recesses every LED housing.
- **Stamp Ledge** (`0 3px 0 var(--led-deep)`): the hard mechanical edge under the stamp button; collapses to 1px when pressed.
- **Focus Ring** (`--focus: 0 0 0 2px var(--ground), 0 0 0 4px var(--led)`): double ring, ground gap then amber; day theme swaps amber for ink.

In the day theme all drop shadows warm to sepia (`rgba(60,52,30, …)`) at reduced opacity; the LED wells stay black.

### Named Rules
**The Recessed Well Rule.** Anything that glows is set *into* the board (inset shadow, strong border); anything made of paper floats *above* it. Panels in between sit almost flush. Never give an LED surface a drop shadow or a paper surface an inset.

## Shapes

Machined, near-square geometry: radii run 3px (tiles, symbol chips, kbd hints, status flaps) → 4px (buttons, rail items, clock, model chips) → 5px (credit meter, palette rows) → 6px (tickets, desk stubs, quotes, inputs, telemetry) → 8px (boards, order pad, tape, palette). The only pill (999px) is the dashed sample-suggestion chip — its softness marks it as *not yet written*, unlike everything committed. Flap cells use a relative 0.14em radius with a horizontal split-line (`::after`, 1px black at 50%) and a top-lit vertical gradient. Tickets carry a die-cut perforated left edge (repeating radial punch-holes in ground color, 14px wide at 20px pitch) and a full-bleed tint band across the top. The rubber stamp is a 3px double-purpose border box rotated -11°, blend-mode multiply. Icons are drawn in-house: 20-unit viewBox, 1.6px stroke, square linecaps, board-and-ticket motifs, one weight throughout, rendered at 17px.

## Components

### Buttons
- **Stamp (`.btn-stamp`)**: the commitment control — solid Signal Amber slab, near-black text (#171102), expanded uppercase Archivo (weight 800, 0.82rem, letterspacing 0.14em), 4px radius, hard amber-deep ledge beneath (0 3px 0). Hover brightens 7%; active drops the button 2px onto its ledge — a mechanical press, not a color change. Disabled fades to 45% and loses the ledge. Used only for irreversible commitments: Write ticket, Fill order, Open artifact.
- **Quiet (`.btn-quiet`)**: hairline-bordered ghost in Bone Dim, uppercase 0.76rem; hover raises to Bone with a hall fill. For retreats and secondary paths: Void ticket, Back to floor.

### Chips
- **Status flap (`.sflap`)**: a miniature split-flap tile — flap gradient face, split line implied by the gradient, 3px radius, uppercase 0.62rem at 0.2em tracking, min-width 4.6rem. Status is voiced by letter color: LIVE amber with glow, FILLED green, OPEN blue, QUEUED gray (#8d938a), FAILED/KILLED red. Flips (rotateX from 80°, 0.32s) whenever its status changes.
- **Model chip (`.model-chip`)**: hall-filled, hairline border, with a flap-tile symbol block; adviser state fills panel with strong border, lead state borders and washes in amber with an amber symbol block and a LEAD tag.
- **Sample chip (`.sample-chip`)**: dashed pill for unwritten suggestions.
- **Toggle (`.toggle-btn`)**: uppercase micro button; on-state borders and washes green.

### Cards / Containers
- **Board (`.board`)**: panel fill, hairline border, 8px radius, soft shadow; a hall-toned title bar (board label + LED count) over hairline-separated rows that hover to hall fill. Empty states speak in Bone Faint prose ("The board is quiet…").
- **Order pad (`.orderpad`)**: same anatomy with a hall head and foot framing a panel body.
- **Paper ticket (`.ticket`)**: the signature object — tint-washed paper gradient, perforated left edge, solid tint band (desk name + mono serial in near-black), ticket ink body, dashed hairline plan rows with mono step costs, a 2px ink top-rule tally, and a rotated stamp (OPEN / FILLED) in the desk's deep tint that thunks in at 0.38s with overshoot. Tinted per desk via `tint-*` classes.
- **Desk stub (`.desk-stub`)**: ticket stub as radio button — 4% tint wash at rest, 11% wash + tint border when selected, mono desk code colored by tint (day theme mixes 48% ink into the tint for contrast via `--code-ink`).

### Inputs / Fields
- **Goal input (`.goal-input`)**: recessed into ground fill with strong hairline, 6px radius, 1.12rem medium weight; focus swaps the border to Signal Amber with a 1px amber ring. Placeholder in Bone Faint.
- **Palette input**: borderless hall-filled field with only a bottom hairline.

### Navigation
- **Rail**: board-label items with in-house glyphs and mono kbd hints; hover/active fill panel, active glyph lights amber. Foot carries the credit meter (an LED well), theme toggle, and seat identity. Collapses to a veiled drawer under 900px.
- **Command palette (⌘K)**: veiled (rgba(5,7,6,0.72) + 3px blur), 37rem panel, mono kind-tags (GO / desk codes / serials / ART) beside each row; selection fills hall.

### The LED Instruments (signature)
Ticker, telemetry, clock, credit meter, and board counts share one anatomy: Doto numerals in Signal Amber with glow, set in a black LED well (`led-bg`) behind a strong border, inset-shadowed, with micro labels in dim amber (#cfae62) and unit suffixes in #b18a3d. The ticker scrolls its duplicated strip 38s linear, endlessly; telemetry's Steps cell turns green when the run fills.

### The Tape (signature)
The live run log prints like a machine: mono 0.8rem lines (dim timestamp · amber op label · dim detail) each rising in over 0.35s; uppercase step-divider rules; council quotes as hall-filled cards with flap symbol blocks — challenge quotes border rose, verdict quotes border-and-wash amber, recorded dissent appended behind a dashed rule in rose; artifact cards border-and-wash green.

### Motion grammar
One easing token (`--ease: cubic-bezier(0.16, 1, 0.3, 1)`) drives everything. Durations are mechanical: 0.09s flap flicker (brightness strobe while spinning), 0.12s button press, 0.15s hovers, 0.16–0.2s palette entrance, 0.32s status flip, 0.35s tape print, 0.38s stamp thunk, 0.5s page fade-up, 38s ticker loop. The SplitFlap component staggers cells left-to-right through a limited charset before settling. `prefers-reduced-motion` is honored everywhere: a global animation/transition clamp, ticker parked, flap spin stopped, and the SplitFlap settles instantly via a matchMedia check.

### The Second World (artifact documents)
Generated artifacts (decision brief, deck, landing page, analysis) are standalone HTML documents with their **own** editorial designs — Georgia serif on warm paper with graded-evidence chips for briefs; big-type Helvetica slides for decks; a green-accented product page for sites; paneled chart sheets for analyses. They deliberately do not use Prajñā tokens, faces, or chrome; the hall shows them inside a white full-bleed frame under a provenance bar. Their one shared element is the provenance footer (serial, desk, council, cost, plan).

## Do's and Don'ts

### Do:
- **Do** route every desk-colored element through the `--tint` / `--tint-deep` custom properties via the `tint-amber|rose|blue|green` classes; components (stubs, tickets, syms, stamps) must read the tint, never a hard-coded desk color.
- **Do** set every glowing number in Doto with its amber glow inside an LED well — a lit number outside a well, or a well without inset shadow, breaks the material.
- **Do** letter all board-scale text in uppercase expanded Archivo with tracking (0.14–0.22em) and keep body prose sentence-case at normal width.
- **Do** keep tickets as the only light-material surface in the night hall, complete with tint band, perforated edge, mono serial, and stamp.
- **Do** use `--ease` for every transition and honor reduced motion in both CSS and JS-driven animation.
- **Do** give every interactive element the double focus ring (`--focus`) and a visible keyboard path (kbd hints, palette entries, aria states), as the built controls do.

### Don't:
- **Don't** re-theme the boards: flap tiles, flap lettering (#ece7d9), and LED wells keep night values in the day theme.
- **Don't** use red as a desk tint or accent — it is reserved for FAILED/KILLED and errors.
- **Don't** exceed the 3–8px radius range; the dashed sample chip is the only pill.
- **Don't** put drop shadows on LED surfaces, inset shadows on paper, or hover-lift shadows anywhere.
- **Don't** let artifact-document styling leak into the hall or hall chrome leak into artifacts; the provenance footer is the only shared element.
- **Don't** substitute third-party icon sets — icons are drawn in the house grammar (20 viewBox, 1.6px stroke, square caps, 17px).
