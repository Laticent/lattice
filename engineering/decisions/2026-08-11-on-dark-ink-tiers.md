---
status: shipped
summary: A user reported indaco's dark bookends and split rails reading washed out, and it reproduced. THREE elements were bound to the wrong rung of the on-dark ink ramps — a 2.49:1 `closing` eyebrow drawn from the documented decorative-chrome tier and a 1.40:1 row rule drawn from the near-invisible backdrop tier (both sub-threshold on all 14 palettes), plus an accent-rail eyebrow on a 70%-derived tier that is sub-AA on 7 of 14. Rebound, plus two alpha numbers in base.tokens.css: `--on-dark-secondary` 68% -> 76% (worst case across all 19 palettes 6.08 -> 7.17:1, which is the whole fix for the reported defect) and `--on-dark-ghost` 32% -> 42% (the rule/divider rung owes WCAG 1.4.11's 3:1 and cleared it on ZERO palettes). Neither defect was visible to either gate: `check-slide-contrast.js` parsed only `rgb()` while Chromium serializes `color-mix()` as `color(srgb ...)`, dropping 26% of text runs, AND never read SVG `fill`, so every chart label in the repo was scored against an inherited color that is not what renders. Both fixed; the tool now also separates the WCAG-exempt decorative tier instead of padding its own count. A per-palette SOLVER writing 76 curated hexes was built and then DROPPED after measurement: one alpha (76%) beat its own worst case (7.13:1), its brand-hue justification measured 0.000 chroma gain on 8 of 19 palettes and below the just-noticeable threshold elsewhere, and it carried five defects of its own. The cascade inversion it surfaced is real and diagnosed but NOT fixed here — flipping the composition order introduces two P1 dark-mode regressions, because base's defaults are light-dark() pairs while ~22 palette tokens override them with flat hexes, so "base wins" was accidentally protecting dark mode.
---

# The on-dark ink tiers — wrong rungs, and the gate that could not see them

**2026-08-11 · PR on `claude/indeco-contrast-issues-yuj6px`**

**Area:** `lib/base/base.tokens.css`, `lib/base/base.modifiers.css`,
`lib/components/statement/split-panel/`, `themes/indaco.css`, `themes/cuoio.css`,
`tools/check-slide-contrast.js`, `tools/contrast-audit.js`

## The report

> "when using indaco theme it seems to me dark backgrounds like title, divider and
> closing as well as split panel don't contrast well with body text. heading and
> headers look ok … eyebrow, subtitle, content, blockquote left line, etc are not
> readable or bearably visible"

Every part of that reproduced. The "heading looks ok" half is the tell that
identified the mechanism: on the same panel, headings measured 9.80–11.29:1 while
the tier directly beneath them measured 6.08:1 and the tier beneath *that* 2.49:1.

## Why no gate caught it

Two independent blind spots, each sufficient on its own.

**1. `check-slide-contrast.js` could not read the ink.** It audits the rendered DOM
— exactly the right idea — but its color parser matched only `rgb()` / `rgba()`.
Chromium serializes `color-mix(in srgb, white 68%, transparent)` as
`color(srgb 1 1 1 / 0.68)`, so `parse()` returned `null` for every rung of the
`--on-dark-*` and `--on-accent-*` ramps, and the caller treats `null` as "not text"
and drops the run. Silently. On a 9-slide bookend/split probe that hid **18 of 69
text runs (26%)** — and not a random 26%: the translucent ramp is the only ink on a
dark panel that isn't already white, so the dropped set was precisely the eyebrows,
subtitles, deks and panel headings under discussion. The tool has had this hole
since it was written (#1207).

**2. `contrast-audit.js` scored the wrong values, and only two rungs.** Its `PAIRS`
table covered `on-dark-primary` and `on-dark-secondary` against `surface-inverse`,
and nothing else — no `ghost`, no `watermark`, no derived on-accent tier. Worse, it
kept its own **hardcoded copy** of the base ramp's alphas, and the table's
documented 4th element (`minRatio`) was never read: every pair was scored at 4.5
regardless, which is why no 3:1 graphical pair could be listed without reporting a
false failure on all 14 palettes. So the whole non-text class stayed out of the
gate. Result: `0 contrast failures · 704 pairs checked across 32 themes`, while the
rendered deck carried a 2.49:1 label and a 1.40:1 rule.

The shape of this is a repeat of #1207's own lesson, one level down: a gate that
reports green because of what it cannot see is worse than no gate, because the
green is load-bearing.

## Two different defects underneath

### A. Wrong rungs — systematic across the palettes

Not tuning errors. Three elements were bound to a tier documented for another job.
Measured before/after, indaco first, then the range across the other palettes. The
first two were **sub-threshold on all 14**; the third on **7 of 14** — its tier rides
each palette's own `--on-accent` headroom, so it fails wherever that headroom is thin
(and passing is not simply "the accent is dark": carbone clears 5.85:1 on a bright
lime):

| Element | Bound to | Before | Range | Now bound to | After |
|---|---|---|---|---|---|
| `closing` eyebrow | `--on-dark-ghost` (32%) | **2.49** | 2.67–2.91 | `--on-dark-secondary` (76%) | 7.17 |
| `metric` row rule + `h3` hairline | `--on-dark-watermark` (12%) | **1.40** | 1.27–1.46 | `--on-dark-ghost` (42%) | 3.25 |
| `watermark` eyebrow + `h5` | `--on-accent-secondary` (70%) | **3.51** | 3.34–10.02 | `--on-accent` | 5.47 |

Three tells that these are bindings, not values:

- **`closing`** inked a real content label with the tier `base.tokens.css`
  documents as *"very muted decorative chrome"* — while `title` and `divider`, the
  sibling bookends, already used `secondary` for the identical element. Ghost had
  no other non-print consumer, so it was a tier with exactly one user and that user
  was a mistake.
- **`metric`** drew a 2px row accent and a heading hairline in the *"large-glyph
  backdrop, near-invisible"* tier. The mirror rule on the **light half of the same
  component** sits at 5.47:1, so the dark half was the outlier, not the target.
  Watermark keeps its correct consumer, the oversized decorative open-quote glyph.
- **`--on-accent-secondary`** is a 70% derivation of a rung each palette curates for
  AA against *its own* accent. The derivation spends exactly the margin the
  curation bought, and no alpha can be safe in general: on indaco `--on-accent`
  itself clears 4.5 by very little (5.47:1), so the tier has nowhere to descend to.
  Text on that rail names the curated rung; size and weight carry the hierarchy,
  which is what the `h2` above it already did.

Ghost's alpha moved 32% → **42%** as part of this: its job is rules and dividers, so
it owes WCAG 1.4.11's 3:1, and 32% cleared that on *zero* palettes. 42% is the
lowest step clearing 3:1 with margin on all 14; the binding constraint is indaco
(3.25:1). The spread is not monotonic in panel darkness — it tops out at brina
4.10:1 while pure-black onyx sits at 3.94:1 — fourth-lowest, behind indaco 3.25,
carta 3.87 and crepuscolo 3.89 — because a chromatic panel
and a neutral one take white differently. Cuoio, the only palette that curates this
ramp, tracked the lift (30% → 40%, 3.82:1); its offsets from the base are per-rung
(−2, −11, −2, 0), not the uniform two points an earlier draft of this note claimed. The
lift is safe precisely because ghost no longer inks any text.

### B. Indaco's panel is a luminance outlier — one palette

Distinct from A, and the reason this user noticed on this theme. `--surface-inverse:
#003D66` is **L\* 24.6**; every other palette's inverse surface sits at **L\* 0–15.4**.

| | panel | L\* | eyebrow / subtitle / dek |
|---|---|---|---|
| indaco | `#003D66` | 24.6 | **6.08** |
| carta (next lightest) | `#2A2620` | 15.4 | 7.75 |
| cuoio | `#1E1A15` | 9.6 | 8.54 |
| onyx | `#000000` | 0.0 | 9.36 |

The base ramp is a **palette-blind** white alpha, so the same 68% that reaches
7.75–9.36:1 on a peer's near-black panel reached 6.08:1 here — the only palette in
the repo below AAA on this tier, and visibly washed out at `--fs-meta` with 0.18em
tracking. It cleared the 4.5 floor, which is why the token audit was content.

**Rejected: darkening the panel.** The first proposal was to move
`--surface-inverse` toward the peer band. Withdrawn on inspection. `#003D66` *is*
`--brand-canvas`, the 0% stop of `--spectrum` / `--spectrum-vertical`, so editing it
also changes the divider rail and every slide's top ribbon; setting
`--surface-inverse` independently decouples the bookend from the palette's declared
single source of truth for brand color. Six other consumers ride the token
(`--code-bg`, dark-mode `--on-accent`, `--journey-stage-bg`, the three bookends, the
split rails). And indaco's navy ladder is already fully occupied — `#001D33` is the
dark-mode canvas, `#002847` the dark-mode card — so darkening the bookend collides
with one of them and a title slide stops reading as a flood in dark mode. All of
that to fix an *ink* problem by moving a *surface*.

**Also rejected: rebinding to the curated `--scheme-dark-text-*` inks.** The
elegant-sounding answer, and measurably worse: `--scheme-dark-text-secondary`
(`#96A8B9`) is **worse on the surface at issue**: on the panel (`#003D66`) it gives
**4.62:1** against the palette-blind 68% white's **6.08:1** — a bare AA pass where the
thing it would replace already clears more. (On the dark *canvas*, `#001D33`, the pair
is 7.03 vs 8.40; those are the figures an earlier draft of this note quoted, and they
describe the wrong surface.) The curation targets the canvas, not this panel.

**Chosen: curate the ink, the way `--cat-N-ink` is curated.** `derive-cat-ink.js`
had already articulated this exact failure — *"The cycle it derives from is
hand-curated per theme; its ink was not, and it showed"* — and its recipe is: hold
hue and chroma, move only lightness, solve against the real surface. Applied here
via `ensureContrast` (`lib/theme/color.js`), seeded from `#ADC1CE` (the hex 68%
white composites to over `#003D66`, i.e. the color already on screen):

    indaco  --on-dark-secondary  #ADC1CE 6.08:1  →  #BDD1DE 7.17:1
                                 ΔL +5.0 OKLCH points · Δhue 0.04°

Run over all 14 palettes, **13 already clear 7:1 and are untouched**. One theme, one
tier, five points of lightness. No curated hex in any palette changes; nothing
downstream of `--surface-inverse` moves.

A flat hex rather than a lifted alpha, by the palette owner's call. It is also the
technically better fit here: `--surface-inverse` is mode-invariant on this palette
(`#003D66` in light *and* dark), so there is no second surface for an alpha to adapt
to, and a named color is inspectable and hand-tunable like the rest of the file.
`section.print` remaps the token at higher specificity, so paper is unaffected;
`section.dark` also reads it, on `--bg` (`#001D33`), where it measures 10.90:1.

## Tooling, so this cannot recur silently

- **`check-slide-contrast.js`** parses `color(srgb r g b / a)` alongside `rgb()`.
  Two further false-positive classes fixed while proving the report trustworthy —
  leaving known-bogus rows is how real failures hide:
  - a **pseudo-element's own background** is now seeded before climbing its owner
    (an ancestor climb steps straight past the fill that is usually the pseudo's
    whole point). The `RECOMMENDATION` chip and the numbered counter disc scored
    1.09:1 white-on-near-white while rendering as white on a solid accent fill.
  - a **sibling underlay** is resolved by geometry — the running header/footer are
    absolutely positioned over a split layout's rail, which an ancestor climb never
    sees. Deliberately **not** `elementsFromPoint`: it hit-tests in viewport
    coordinates and a rendered deck is one tall stacked document, so it returns `[]`
    for every run below the fold (slide 6's footer sits at y=4281 in a 720px
    viewport — measured, which is how the first cut silently found nothing), and it
    skips `pointer-events:none`, which this engine sets on several decorative
    fills. Sampling uses the **text node's own Range rect**, not the element box: a
    full-slide-width footer holding short left-aligned text has its box center on
    the far side of a split from its glyphs.
- **`contrast-audit.js`** now **reads** the on-dark alphas out of `base.tokens.css`
  instead of copying them — a stale copy does not fail loudly, it makes the gate
  score an ink the engine no longer paints — and throws if it cannot, rather than
  skipping a rung (a skipped pair reads as a pass). `minRatio` is honored, which
  admits the first non-text pair: `on-dark-ghost` vs `surface-inverse` at 3:1.

`736 pairs across 32 themes, 0 failures` — now including the rungs that were
failing.

## A per-palette solver was built, measured, and DROPPED

This is the part worth reading, because the machinery got built before it got
measured. A generator (`tools/derive-on-dark-ink.js`) solved all four rungs for each
of the 19 palettes from that palette's own panel hue — chroma held, lightness moved,
the `--cat-N-ink` recipe — writing 76 curated hexes, with a `--check` gate and a build
step. It passed every gate. It was then dropped in favor of **one number**, and the
reasoning is the record:

**1. A single alpha beats it on its own terms.** Raising `--on-dark-secondary` from
68% to **76%** white gives a worst case of **7.17:1** across all 19 panels. The
solver's own worst case was **7.13:1**. `primary` at 92% already clears 9.77:1;
`ghost` is the separate 32→42 lift above; `watermark` is decorative. So the entire
measured compliance content of the generator was one alpha.

**2. Its second justification did not survive measurement.** The claim was that a
solved hex carries the palette's hue where an alpha desaturates toward gray. Measured
as OKLCH chroma gain over the alpha composite: **0.000 on 8 of 19 palettes** (the
chroma-zero panels — the five a11y, onyx, ardesia, concrete — return the same gray),
and 0.004–0.029 on the rest, at or under the ~0.02–0.03 just-noticeable threshold.
The cause is structural: the ladder's targets were anchored to the MEDIAN of what the
alpha ramp already produced, chosen to minimize churn. That objective guaranteed the
output would be indistinguishable from the input, which is the opposite of the design
goal it was meant to serve.

**3. An alpha self-normalizes; a hex cannot.** `--on-dark-watermark` is painted on the
dark CANVAS by `lib/forms/tile/watermark/watermark.css`, not only on the panel. A 12%
alpha lands ~1.4:1 against whatever is behind it; a hex solved against the panel
breached its own decorative ceiling there (2.15:1 vs a 2.0 ceiling on indaco). The
same shape of miss appeared for `primary`, whose binding surface — the inline-code chip
— turned out to be both modelled ~1 unit/channel off Chromium AND absent from every
shipped deck, because an eyebrow rule using `:only-child` flattens the chip on exactly
the dark bookends that surface was supposed to represent.

**4. The precedent it copied had already solved the cascade problem the other way.**
`tools/check-ownership.js` records that `--cat-N-ink` deliberately has **no `:root`
default in `base.tokens.css`**, precisely so composition order cannot strand it. The
solver copied that tier's color math but left the base defaults in place, hit the
inversion, and proposed flipping global composition order to answer it.

**5. The generator carried defects of its own.** `splice()` was unguarded against a
missing END sentinel — one deleted comment line and the next `npm run build` shredded
a palette file, with `--check` green before and after. Write mode never ran the
floor/polarity validation (it sat inside `if (report || check)`). The ceiling descent
loop compounded quadratically. Five defects to deliver what one alpha delivers better.

**What ships instead:** `--on-dark-secondary: 68% → 76%` and `--on-dark-ghost:
32% → 42%`, in `base.tokens.css`, plus cuoio's own ghost tracking 30% → 40% so its
override clears the same floor on the engine path. Every measured defect fixed, live
in both render paths immediately, no generated values, no second branch.

## The cascade inversion: real, diagnosed, and NOT fixed here

Verifying the solver surfaced a separate defect worth recording, since it is why the
solver could not be seen at all. `lattice-emulator.js` composed
`paletteCSS + layoutCSS`, so `base.tokens.css`'s universal defaults overrode every
value a palette curated — in the path that builds every committed PDF. The engine's
own `composeCss` inlines the base at the theme's `@import` site (correct), and the
emulator's mermaid token parse at `:890` already used the correct order too, so the
emulator's document shell was the single wrong site.

**A one-line fix for it was written, measured, and held.** Flipping the order makes
light and dark converge exactly — but it introduces two P1 dark-mode regressions,
because base's defaults are `light-dark()` pairs and ~22 palette tokens override them
with FLAT hexes. "Base wins" was accidentally protecting dark mode:

- `--seq-500` is `var(--accent)` in base (a pair) but `var(--brand-accent)` — a flat
  hex — in 12 of 14 palettes. The word-cloud `spectrum` variant paints `--seq-700/500/400`
  as word fills: atelier's mid tier goes **13.13:1 → 1.11:1**, ardesia's 14.50 → 1.16.
  Six of eight words disappear into the canvas.
- `--pass` / `--warn` / `--fail` are pairs in base and flat light-tuned hexes in 4 of
  the 5 a11y palettes. `redline`'s struck clause text lands at **1.50:1** on
  `a11y-achromatopsia`, where `main` renders it at AA.

So the cascade fix needs those flat tokens given dark companions FIRST, as its own
change. Tracked on `claude/cascade-theme-wins`, not merged.

## Logged, not fixed here

**The running header is fully occluded by the left rail on every `split-*`
layout.** The header box is at (30, 28) inside a `.panel-left` spanning
(0, 4, 550, 716), and the panel paints over it: the header strip rasterizes to a
flat **one** unique color where the glyphs should be, against **17** on a layout
that paints it. Verified identical before and after this change, so it is
pre-existing and unrelated. It is a stacking/paint-order defect, not an ink one, and
therefore off the path of this change — recorded here rather than pulled into the
diff (HARD RULE #18's on-path/off-path boundary, keeping #17 intact). It is also why
`check-slide-contrast.js` reports that header at all: it scores ink that never
reaches the page, which the tool's docstring now states as a known limitation.

## Verification

- `npm run lint` clean · `npm test` 5968 pass · `npm run build:check` clean
- `node tools/contrast-audit.js` — 736 pairs, 32 themes, 0 failures
- `node tools/check-slide-contrast.js` on a 9-layout indaco probe — every one of the
  four content defects gone; remaining rows are the WCAG-exempt muted-chrome tier
  and the occluded header above
- Rendered and inspected in indaco, plus onyx / carta / cuoio / mustard for the
  cross-palette rung changes
