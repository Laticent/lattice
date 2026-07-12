---
status: shipped
summary: OPT-IN (`lift: on` deck front-matter key, or per-slide `_class: lifted`/`flat`; off by default, no existing deck changes). Card surfaces carry a "Struck" elevation — a single shared `--elevation-card` box-shadow token (base.tokens.css) whose per-layer colours flip via CSS `light-dark()`: on a light canvas the dark contact layers cast a crisp offset shadow (a lit card on paper), on a dark canvas a 1px white rim-light catches the top edge (Material's "elevation is light from above", expressed as an EDGE highlight so the card FILL never changes). Every layer is ZERO BLUR, so it exports to PDF as pure vector — no soft-mask grey-box in Apple PDFKit / Skia (the trap already documented for blurred shadows at image.styles.css:43 and the base.tokens.css --state-* note). One palette-neutral definition serves every theme. Applied to cards-grid, cards-stack, pricing tiers, quote (retiring a raw rgba(0,0,0,.07) literal — a HARD RULE #3 + #18 win), kpi.ops + kpi.trajectory tiles, and stats (which were also given a real card surface — bg-alt + hairline + radius — since the manifest always called them "tiles"). A companion `--elevation-berth` padding token insets each card grid from the stage's `overflow:clip` so the outer / second-row shadows aren't sheared; it is PADDING, never margin (HARD RULE #20 — margin margin-collapses and is invisible to the Fit Spine's height math). The berth rule must mirror each container's highest-specificity base selector: cards-grid's native path sets `padding:0` via `:not(:has(.cards-grid-inner))` at (0,3,2), which silently beat a naive (0,2,2) berth rule until the selector was mirrored. Degrades safe: on a pre-Chromium-123 engine that can't parse light-dark(), the box-shadow declaration is dropped and the card simply renders flat (a decorative lift, not content — no fallback warranted, unlike the chart-colour case).
---

# Struck card elevation — one `light-dark()` token, zero blur, PDF-safe

**Date:** 2026-07-12
**Area:** theming / components / base tokens

## Problem

Box-shadow is used heavily across the engine and looks good on light decks, but
dark decks read flat: a black drop shadow on a near-black ground has almost no
contrast, so the "lift" a shadow is meant to convey simply disappears. The naive
fix — porting the light shadow unchanged — is dead weight in dark mode. The
correct move is to *re-express* elevation per canvas, not delete it.

The extra constraint: the card **fill token is fixed** (a surface a deck author
can't re-tint), so Material's canonical dark-mode answer — lighten the whole
surface as it rises — was off the table. And whatever we ship must survive the
**vector PDF export**, where a *blurred* box-shadow is exported as a soft-mask
image that Apple PDFKit / Skia render as an opaque grey box (already documented
at `lib/components/imagery/image/image.styles.css:43` and the `--state-*` note in
`base.tokens.css`).

## Decision

A single structural token, `--elevation-card` (base.tokens.css), authored as one
box-shadow list whose **per-layer colours flip via `light-dark()`** while the
geometry stays constant:

- **top rim-light** (`inset 0 .09cqi 0 0`) — a hairline of light on the top edge.
  Near-invisible white on a light card; the hero "raised" cue on a dark card.
- **underside** (`inset 0 -.08cqi 0 0`) — a faint dark line under the top-inside
  edge; the card's own shaded lip.
- **two contact layers** (`0 .28cqi …`, `0 .62cqi …`, negative spread) — a crisp
  offset shadow below. Dark and load-bearing on a light canvas; present but
  recessive on a dark one, where the rim carries the read.

Why this shape:

- **Fill never changes** — the lift is entirely in the shadow, honouring the
  fixed-surface constraint. This is the non-tint analogue of Material's rule.
- **Zero blur on every layer** → exported as pure vector, safe on every PDF
  viewer (verified by round-tripping through Chromium print-to-PDF).
- **`light-dark()` per colour, not per list** — `light-dark()` takes two args, so
  it can only wrap an individual colour, never the whole comma-separated shadow
  list. Wrapping each layer's colour keeps one geometry and flips correctly with
  the deck's `color-scheme` (the same mechanism the `-dark` theme wrappers use).
- **Palette-neutral** (white / black only) → one definition in the shared token
  file serves every theme; not a per-palette token.

Applied across the **whole card family** — every component whose surface is a
`bg-alt` tile with a hairline. First cut: `cards-grid`, `cards-stack`, `pricing`
tiers (composed *under* the featured tier's accent ring), `quote` (replacing a
raw `rgba(0,0,0,.07)` literal — clears a HARD RULE #3 hex-in-layout smell and a
#18 broken window in the same edit), `kpi.ops` + `kpi.trajectory` tiles, and
`stats`. Stats had no surface (centered figures); since its own manifest calls
them "tiles", it was given a real card (`bg-alt` + hairline + `radius-md` +
padding) so the elevation has something to sit on. Then extended to the rest of
the family: `verdict-grid`, `matrix-2x2`, `decision`, `split-compare`, `redline`,
`compare-prose`, `actors`, `inventory` (`.cards` variant), `list`, `statute-stack`,
`citation-card`, `regulatory-update`, `authority-chain`, `list-steps`,
`split-panel` (the right-side content cards only), and the `contact` QR card.

Deliberately **not** applied where the `bg-alt` surface is not a liftable card:
`kpi.compliance` and `list-tabular` (ruled tables / a code pill — a shadow would
float on nothing or on an inline element), `kpi.briefing` (mixed hero-card +
borderless rows), `glossary` (auto-table row bands), and `split-panel`'s
`.panel-left` / `list-steps` connector rails (full-height rails, not cards — a
parallel-reviewer sweep confirmed these correctly stay flat while the adjacent
cards lift).

## Opt-in: the `lift:` deck setting

Elevation is **off by default** — a boardroom engine should stay restrained, and no
existing deck should sprout shadows unasked. It's an eighth deck-setting axis modeled
exactly on `spectrum:` (`lib/core/resolve-lift.js` → `liftClass`): the `lift:` front-matter
key maps `on` → the `lifted` class token, stamped on every section by the shared
`deck_class_propagate` pass (plugins.js + runtime/index.js), with per-slide override —
`_class: lifted` opts one slide in, `_class: flat` opts one out, both winning over the
deck-wide value the same way `finish`/`mode`/`spectrum` do. (`lift` is the author-facing
switch; `elevation` stays the token namespace / design concept it activates.)

The gate is a **CSS custom-property swap**, so the 23 component rules never learn about
the setting. The consumed tokens default OFF —

    --elevation-card: none;   --elevation-berth: 0;

— and one rule turns them on:

    section.lifted { --elevation-card: var(--elevation-recipe); --elevation-berth: var(--sp-sm); }
    section.flat     { --elevation-card: none;                    --elevation-berth: 0; }

Because a card consumes `box-shadow: var(--elevation-card)` and `padding-block:
var(--elevation-berth)` unconditionally, an un-elevated card resolves both to `none`/`0`:
**the shadow and its berth padding turn on together, and off together** — a flat slide
gets neither (the padding is not spent when there's no shadow to make room for). `section`
outranks `:root`, so the swap is order-independent.

## The berth trap (why elevation needed a padding token)

The stage cell is `overflow:clip` (forms/cell/stage — cells must not bleed into
one another). A card flush to the stage edge therefore has its shadow **sheared**
at the clip boundary — most visibly the bottom row. Fix: `--elevation-berth`, a
small **padding** on each card container that insets the grid from the clip so
every shadow renders inside the stage.

Padding, never margin: margin sits outside the box, margin-collapses, and is
invisible to the virtual-list / Fit-Spine height math (HARD RULE #20). Padding
measures cleanly.

**Specificity is load-bearing here.** cards-grid's native (VS Code) render path
sets `padding:0` via `section.cards-grid:not(:has(.cards-grid-inner)) > .cell-stage
> ul` at specificity **(0,3,2)**. A naive berth rule at `section.cards-grid >
.cell-stage > ul` is only **(0,2,2)** and *loses* — the berth silently doesn't
apply on that path and the shadow clips (this shipped in an intermediate build and
was caught in PDF review). The berth rule now mirrors the `:not(:has())` selector
so it wins on every emit path. The other components (cards-stack, pricing, kpi,
stats) edit their container rule in place or have no higher-specificity competitor,
so they apply directly.

## Verification

- Rendered a per-feature demo deck (`examples/struck-elevation.md`) in `indaco`
  (light) and `indaco-dark` (dark); shadows read correctly on both, second-row and
  4-up cards all lift, stats tiles and kpi.ops tiles lift.
- PDF-safety confirmed by rasterizing the actual exported PDF — crisp, no grey-box.
- Full 115-slide gallery re-rendered in light **and** dark: **zero `.overflow`**
  class (the berth padding and the enlarged stat tiles pushed nothing into
  overflow), and real cards-grid / cards-stack slides checked by eye in both themes.
- `npm test` (3479 pass), `lint`, `build:check`, `check:ownership` all clean.
- Maker-checker: an independent pass confirmed no specificity defeat on the other
  components and caught a real **horizontal**-overflow risk the Fit Spine can't see
  — it measures vertical height only. Card-ifying `stats` had grown each tile's
  horizontal chrome enough that a dense 5-stat landscape row overflowed and the
  outer tiles were sheared by the stage clip (invisible to the gallery
  zero-`.overflow` check). Fixed by making the stats berth **vertical-only** (the
  shadow has no horizontal extent) and trimming tile padding/gap back inside the
  pre-tile width budget; re-verified with a 5-figure worst-case slide in both modes.

## Follow-ups / known limits

- Inter-card `gap` was left at `--sp-md`; it already exceeds the shadow spread, so
  the berth (not the gap) was the real fix. Widening the gap is a one-token change
  if more air between cards is wanted.
- On pre-Chromium-123 engines (frozen smart-TV forks) the `light-dark()` box-shadow
  declaration is dropped and cards render flat. Acceptable for a decorative lift; no
  `@supports` fallback added (contrast with the chart-colour case, where a dropped
  colour meant black content).
