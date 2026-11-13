# Typography contract

Lattice has **12 font-size tokens** organized as three independent scales.
Each token has a single, named role. Picking the right token is a
one-step decision, not a "which size feels right" judgment call.

This file is the canonical reference. The audit, methodology, and
migration history that produced this system live in
`engineering/decisions/2026-05-19-typography-token-refactor.md`.

## 1 — The 12 tokens

```
CONTENT (5)              HEADING (6)              DISPLAY (1)
fs-meta                  fs-h1                    fs-hero
fs-body-compact          fs-h2
fs-body                  fs-h3
fs-message               fs-h4
fs-emphasis              fs-h5
                         fs-h6
```

Every size is declared in `cqi` (container-query inline-size) so visual
proportions hold across HD (1920×1080), 4K (3840×2160), and any custom
size. The `pt @ HD` column below shows how the cqi values land at the
standard slide.

### 1.1 Content scale

The default container body anchors at `--fs-body = 1.67 cqi` (16 pt) —
the ONE size for reading text: list rows, card bodies, table cells, glossary
definitions, tabular lists (§7, "One reading size").
Slide-level statement bodies step up to `--fs-message = 2.1875 cqi`
(21 pt). Values are normalized to the proven legacy footprint, a touch
above it — not the projection-floor inflation the first rethink shipped.
Five steps.

| Token | cqi | pt | Role |
|---|---|---|---|
| `--fs-meta` | 1.17 | 11.25 | Chrome only — pagination, footer, eyebrow labels, micro-captions, pills. |
| `--fs-body-compact` | 1.40 | 13.5 | **Code, and labels that sit between meta and body.** `code` and `compare-code` panes (a line of code cannot wrap without changing what it says, so code keeps a column budget one step down — owner ruling 2026-09-29), chart keys and legends, a fixed card's fields (`contact`), and label boards whose cells are marks (`obligation-matrix`). **Not a reading role:** since 2026-09-29 table cells, glossary, list-tabular, actors, verdict-grid and every plain markdown table read at `--fs-body`. |
| `--fs-body` | 1.67 | 16 | **The reading size.** Every component's reading text: list rows (all `list` variants but the display register `principles`), agenda rows, q-and-a questions and answers, card bodies, table cells (every plain markdown table, via `base.elements.css` § UNIVERSAL TABLE), glossary, list-tabular, actors, verdict-grid, roadmap rows. The cascade default (`section { font-size }`). One reading size per venue: `npm run audit:reading-size`. |
| `--fs-message` | 2.1875 | 21 | **Display text: one statement per slide.** Paragraphs in statement / quote / divider / title / topic layouts, and the one lead sentence a slide carries (the split-panel claim, the premise lead, a scene or video caption, policy-recommendation's impact line). **Never reading text:** a list row or a table cell is `--fs-body` whatever the component (2026-09-29). **NOT `content`** — it left this tier for `--fs-body` (#1292). |
| `--fs-emphasis` | 3.125 | 30 | Lead paragraph, key-insight callout, step-forward block. *One* block per slide that should read first. |

### 1.2 Heading scale

Six independent decisions — not a modular ratio. Each h-level sized
against its own role. h4/h5/h6 are deliberately tied to the
message/body/meta content tiers (same size, weight-differentiated).

| Token | cqi | pt | Role |
|---|---|---|---|
| `--fs-h1` | 5.0 | 48 | Title-slide hero, deck title, "the slide IS this heading" layouts. Dominates the slide. |
| `--fs-h2` | 2.9167 | 28 | **Standard slide title.** Every content slide. |
| `--fs-h3` | 2.3958 | 23 | Subheading, column header in multi-column layouts. |
| `--fs-h4` | 2.1875 | 21 | Inline bold heading inside body prose (= `--fs-message`, weight-differentiated). |
| `--fs-h5` | 1.67 | 16 | Small section marker, sub-list label (= `--fs-body`). |
| `--fs-h6` | 1.17 | 11.25 | Smallest heading — chrome-sized (= `--fs-meta`). |

### 1.3 Display tier

| Token | cqi | pt @ HD | Role |
|---|---|---|---|
| `--fs-hero` | 8.9583 | 86 | The ONE big number on a slide — big-number, kpi.spotlight/briefing primary, watermark backdrops. **Class-driven only — never bound to an h-element.** "This number IS the slide." Rows of comparable metrics (kpi.ops/compliance/trajectory, stats) use `--fs-h1` (48 pt), not hero. |

### 1.4 Three orientation categories (generated)

The coefficients above are the **landscape** scale. They are not hand-written in
`base.tokens.css` — they live in the manifest `lib/typography/scale.js` and are
emitted into `dist/lattice.css` by `lib/typography/emit.js`. The manifest carries
**three curated coefficient sets**, one per orientation, selected per slide off
the `data-orientation` stamp:

| Category | Aspect | Sizes | Reference width |
|---|---|---|---|
| `landscape` | `> 1.05` | hd · standard · 4k | 1280 (1cqi = 12.8 px) |
| `square` | `0.9 < aspect ≤ 1.05` | 1:1 social | 1080 (1cqi = 10.8 px) |
| `portrait` | `≤ 0.9` | portrait · story · mobile | 1080 (1cqi = 10.8 px) |

(Boundaries are the `data-orientation` stamp's. `orientationFor` in
`lib/engine/css.js` takes them from the shared classifier,
`lib/adaptive/families.js` `BOUNDARIES`.) Each is a *curated* hierarchy, NOT the landscape scale times a constant: portrait
pulls the title ramp down (so a 2-line `h1` fits a tall frame) while keeping body
generous; square stays punchier than landscape but smaller-titled than portrait
(a 1:1 box is height-limited). `landscape` is the unstamped default and is
byte-identical to the historical scale. To change a size, edit the manifest — one
source of truth, three scales that cannot drift apart. **Readable text always
uses a `--fs-*` token** (a drift-guard test bans raw `cqi` font-sizes), so it
follows its slide's orientation automatically. Full rationale + the §11 selection
mechanism: `engineering/decisions/2026-06-20-typography-categories.md`.

**Wider than 16:9 — `size: mobile-landscape`** (1560×720, ~19.5:9, a phone held sideways;
#2372 fork 9). It is `landscape`, and the landscape scale would put every size ~22% above its HD
value against an unchanged height, because every token is width-relative. So on a canvas wider
than 16:9 the engine sets the slide's design unit, `--_sec-1cqi`, to the 1% of a 16:9 canvas of the
same height (12.8 px at 720), and sets `--_wide-gutter` to half the extra width (140 px). The
slide's insets add that gutter: the section's inline padding (`base.elements.css`), a Form's
`--frame-x` (`stage.css`), the edge chrome's `--frame-inset-x` (`base.tokens.css`) and the
divider's padding. So type, spacing, the content box and the chrome around it are HD's to the
pixel, centered, and the backgrounds, split panels and full-bleed media run the full width
(`orientationCss` in `lib/engine/css.js`, `wideFactor` in `lib/core/sizes.js`, and the runtime's
`patchSectionGeometry` for the live preview, which reads the factor off the section's box only
when that box has a registered wide canvas's shape, `canvasWideFactor`). The gutter is unset on every other canvas, so the
`var(--_wide-gutter, 0px)` terms add nothing there. A component that insets from the slide edge on
its own must add the gutter too, the way the divider and an unwrapped `.chart-frame` do. A
**full-bleed** frame is the exception: `split-panel`, `split-compare` and `image` zero the section's
padding and run their panes to the edges, so there is no padded column for the chrome to follow.
They reset `--frame-inset-x` to the 16:9 inset, where the header and footer line up with the panel
text; with the gutter, the footer crossed the panel seam and was cut (found by the checker, gallery
page 18).

## 2 — Author's mental model

> **HTML heading**: use `--fs-h<level>`. `h1` → `fs-h1`. `h2` → `fs-h2`. …
> No decision about "which one fits"; it's the element you wrote.
>
> **Card / list / inline prose**: `--fs-body` (16 pt). The cascade
> default — most container content needs no override.
>
> **Table cell, list row, glossary definition**: `--fs-body` too. Reading
> text has ONE size, whatever the component; a table fits fewer rows than it
> did at 13.5 pt, and each component's "By venue" line says how many.
>
> **Code**: `--fs-body-compact` (13.5 pt), one step below the reading size,
> because a line of code cannot wrap. (The other exceptions are display text,
> chart keys, label boards and fixed cards; §7 "One reading size" lists them.)
>
> **Slide-level statement body**: `--fs-message` (21 pt). Paragraphs in
> statement, quote, divider, centered, big-number layouts, and the one lead
> sentence a slide carries. The "this is what the slide says" prose — never
> a row of a list.
>
> **Lead paragraph or key-insight callout** (not a heading, but one
> block that needs to step forward): `--fs-emphasis` (30 pt).
>
> **Chrome and labels**: `--fs-meta` (11.25 pt). Pagination, footers,
> eyebrow labels, micro-captions, pills.
>
> **Backdrop / KPI / watermark / extreme display**: `--fs-hero`,
> selected by class.

The default cascade lands on `--fs-body` (16 pt), so the common case —
cards, lists, prose — needs no opt-out. Dense tables/grids opt *down*
to compact; slide-level statements opt *up* to message. This inverts
the first-rethink model, where the 24 pt default forced every dense
layout to opt out.

## 3 — HTML element → token mapping

`lib/base/base.elements.css` wires the headings automatically. Authors
who write `## Slide Title` get `--fs-h2` for free.

| Element | Token | Notes |
|---|---|---|
| `section` (default body) | `--fs-body` | 16 pt. Paragraphs / cards / lists inherit from this. |
| `section h1` | `--fs-h1` | Display font, weight 700. |
| `section h2` | `--fs-h2` | Display font, weight 700. |
| `section h3` | `--fs-h3` | Display font, weight 700. *The eyebrow pattern is the inline-code paragraph (`\`label\``), not an h-tag.* |
| `section h4` | `--fs-h4` | Body font, weight 700 (= `--fs-message`). |
| `section h5` | `--fs-h5` | Display font, weight 700 (= `--fs-body`). |
| `section h6` | `--fs-h6` | Display font, weight 700 (= `--fs-meta`). |

The eyebrow is delivered by the `\`label\`` inline-code paragraph modifier in
`base.modifiers.css`, not by an h-tag. Its voice — the heading face's italic, as written, at
`--chrome-fs` × 1.45 and never under `--fs-meta`, half of `--fs-h1` on a bookend — comes from
the `typography:` set (§ Type sets below).

## 4 — Anti-patterns

- **Picking a size by feel.** "A bit smaller than h2" → use `--fs-h3`,
  not "let me try `--fs-xl` or `--fs-2xl`." The old t-shirt names
  are gone; everything has a role.
- **Setting reading text in any role but `--fs-body`.** A list row at
  `--fs-message` or a table cell at `--fs-body-compact` puts a second
  reading size on the deck (the #2361 talk showed three at once). The
  blockquote in a quote slide, the lead paragraph under a title, the
  divider subtitle read `--fs-message`; rows, cells and cards read
  `--fs-body`; code reads `--fs-body-compact`. `npm run audit:reading-size`
  lists every component's role at every venue.
- **Using `--fs-meta` to fit more body text.** If you find yourself
  reaching for `--fs-meta` to compress a paragraph, the slide has too
  much content — split it. Never shrink prose to fit.
- **Using `--fs-hero` for a row of metrics.** Hero is the ONE big
  number. Three or four comparable numbers (kpi.ops/compliance/
  trajectory, stats) use `--fs-h1`; a stack of supports beside a hero
  (kpi.briefing) uses a layout-local 38 pt. Hero on every cell overflows
  the grid.
- **Using an h-tag for the display tier.** `--fs-hero` is class-driven
  (`<div class="hero">…</div>`), never bound to `<h1>`. h1 is the
  *title* of the slide; hero is *the slide is this one number*.
- **Writing a measure in `cqi`.** A line-length cap is a count of
  characters, so it belongs in `em` (§8). `max-width: 62cqi` is a
  fraction of the *slide*, and the two agree only while the type size
  holds still — which it doesn't, because the scale is curated per
  orientation (§1.4). The same declaration set ~22 characters on
  landscape and ~12 on portrait until 2026-08-02.
- **Raw cqi font-sizes.** `font-size: 1.484375cqi` bypasses the token
  system. A few layouts legitimately need a size *between* tokens and
  use an explicit cqi value with a comment explaining why — the
  half-canvas pull-quote (split-panel pullquote, 3.9583cqi = 38 pt, between h2
  and h1), the split-panel decorative watermark (11.46cqi = 110 pt, above
  hero), and the kpi.briefing supports (3.9583cqi = 38 pt, between h2 and
  h1). These are documented exceptions, not the norm. Undocumented
  sub-token rawness in tokens.css is a bug. Each of the three wraps its
  literal in `calc(<n>cqi * var(--fs-scale))` so it tracks the global font
  scale (§7) — the *only* reason a raw cqi value should mention
  `--fs-scale`.

## 5 — History: the 16-token legacy and the rethink

The original refactor collapsed a 16-token t-shirt-sized scale
(`fs-xs` … `fs-watermark`, `fs-label`) into an 11-token role-named
system. A subsequent **rethink** (commit `392d4de`) corrected two flaws
the 11-token system shipped with, producing today's 12-token contract:

1. **Body default was backwards.** The 11-token system made `--fs-body`
   = 24 pt the slide default and `--fs-body-compact` = 18 pt the card
   escape. But cards/lists/tables are the common case (41 component
   sites) and slide-level statements the exception (15). The rethink
   inverted it: `--fs-body` = 18 pt is now the default; slide-level
   prose opts up to the new `--fs-message` = 24 pt. The whole heading
   scale shrank with it (h1 72→54, h2 45→36, h3 30→27, hero 122→96).

2. **No tier below the default.** Folding the old compact value into
   `--fs-body` left nothing for dense reference cells. The compact tier
   was reintroduced for tables, glossaries, and grids — surfaces
   scanned, not read.

3. **The whole scale was still inflated.** Even after the first rethink
   and ~14 follow-up reductions, every token sat 16–41% above the proven
   legacy footprint — because the founding premise ("projection floor =
   24 pt body") was misapplied: Lattice makes boardroom PDFs read at
   desk distance, not slides projected at 20 ft. A second **normalize**
   pass reset every value to the legacy footprint plus a small margin:
   body 18→16, message 24→21, h2 36→28, h1 54→48, hero 96→86, meta
   13→11.25, compact 16→13.5. The role-named structure and bug fixes
   from the first rethink are kept; only the values moved.

A handful of layouts use explicit cqi sizes *between* tokens (see §4):
the half-canvas pull-quote and kpi.briefing supports at 38 pt (between
h2 and h1), and the split-panel watermark at 110 pt (above hero). These
are documented in their component CSS.

## 6 — Cross-references

- `engineering/decisions/2026-08-02-sovereign-bookend-measures.md` — measure
  (§8) as a contract; why a `cqi` line-length cap is orientation-dependent.
- `engineering/decisions/2026-05-19-typography-token-refactor.md` — solver,
  audit, migration plan, risk register.
- `lib/base/base.tokens.css` — the canonical declarations.
- `lib/base/base.elements.css` — h1–h6 wiring.
- `lib/base/base.typography.css` — the `typography:` sets and the voice tokens (§ Type sets).
- `lib/base/base.modifiers.css` — eyebrow / subtitle / key-insight
  visual treatments that use `--fs-meta` and `--fs-body`; also the
  `scale-l` / `scale-xl` / `scale-2xl` modifiers (§7).

## 7 — Global font scale

The 12 tokens are normalized to a **desk-distance** footprint — Lattice
makes boardroom PDFs read at reading distance, not slides projected at
20 ft. When a deck *is* going to a projector, a large room, or needs an
accessibility bump, the whole scale can be raised in one move without
re-picking sizes.

A single unitless multiplier, **`--fs-scale`** (default `1`), is baked
into the scaling tokens: `--fs-body: calc(1.67 * var(--_sec-1cqi, 1cqi) *
var(--fs-scale))`, and so on. (The `1cqi` is wrapped in
`var(--_sec-1cqi, 1cqi)` so the section's OWN font-size resolves against the
slide width in iframe/VS Code previews, not the editor viewport — see
`engineering/gotchas.md` "Section geometry AND body font … look wrong". The
fallback keeps the canonical/print render identical.) The three documented between-token raw-cqi sites (§4) carry it
too. Raising it scales **every role in lockstep** — titles (h1, h2), body,
supporting headings (h3–h6), hero, chrome (pagination / footer / eyebrow)
— so the tuned proportions are preserved; only the magnitude moves.

### Every role scales, titles included (since 2026-09-29)

Until 2026-09-29 **`--fs-h1` and `--fs-h2` held their designed size** (48 / 28 pt) while
everything else grew, on the reasoning that titles are big enough for the back row and
that scaling them makes them wrap. The cost showed at the larger venues: display text kept
growing past the title it sits under, so at `hall` a 34.5 pt `h3`, 31.5 pt lead lines and
a 45 pt Key Insight all outranked a 28 pt slide title. The owner ruled for proportions
over wrapping: **every role scales**, so the ladder at every venue is the laptop ladder
multiplied (`NO_FS_SCALE` in `lib/typography/scale.js` is empty).

The measured cost, on the #2361 talk at `hall`: slide titles that wrap to two lines went
from 5 to 58 of 83, and clipped pages from 49 to 54. List, table and card budgets at hall
were unchanged at their authored lengths. A title that wraps at a large venue is the cue
to shorten it. Record: `engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §8.

### The ladder per venue (measured, pt at the 1280×720 slide)

| Role | laptop | huddle | conference | hall |
|---|---|---|---|---|
| `--fs-hero` | 86.0 | 98.9 | 111.8 | 129.0 |
| `--fs-h1` | 48.0 | 55.2 | 62.4 | 72.0 |
| `--fs-emphasis` | 30.0 | 34.5 | 39.0 | 45.0 |
| `--fs-h2` (slide title) | 28.0 | 32.2 | 36.4 | 42.0 |
| `--fs-h3` | 23.0 | 26.4 | 29.9 | 34.5 |
| `--fs-message` / `--fs-h4` | 21.0 | 24.2 | 27.3 | 31.5 |
| **`--fs-body` / `--fs-h5` (reading text)** | **16.0** | **18.4** | **20.8** | **24.0** |
| `--fs-body-compact` (code, support lines, chart keys) | 13.4 | 15.5 | 20.1 | 23.0 |
| `--fs-meta` / `--fs-h6` (labels) | 11.2 | 12.9 | 16.8 | 21.9 |

Each role sits above the one below it at every venue. The two lifts (next section) are
why the bottom three rows do not scale by exactly the venue step.

### What scales, what holds, what's independent

Verified by rendering each structure at `scale-xl` (both the marp-cli and
emulator paths):

- **Scales** (rides `--fs-scale`): body prose, lists, cards; supporting
  headings h3–h6; the hero / big-number tier (`--fs-hero`); chrome
  (pagination, footer, eyebrow); **table** cells (`--fs-body`) and
  headers (`--fs-meta`), including plain markdown tables;
  **code** blocks; **quote/blockquote** body text; **KaTeX math** (its
  `em`-relative sizing is anchored to the scaling container font-size);
  chart legends and token-styled labels.
- **Holds its designed size**: nothing that rides a role token since 2026-09-29 — slide
  titles, the KPI/stats headline numbers and panel metrics that reuse `--fs-h1`/`--fs-h2`
  scale with the rest. Values set in raw `cqi` outside the roles (a decorative quote mark,
  a chart's big value) still hold.
- **Independent of the scale** (rendered to SVG by its own engine):
  **Mermaid diagrams.** Mermaid sizes its node/edge labels itself (px
  baked into the emitted SVG via `themeVariables`), so a scaled slide
  enlarges the title and surrounding prose but *not* the diagram's
  internal text. If a diagram must read larger, size it at the Mermaid
  level (fewer nodes, a width/height directive), not via `--fs-scale`.
  **Chart SVG text** (drawn in viewBox units) is sized by the chart family: it follows
  `venue:` (§ Chart text follows the venue below), not a bare `scale-*` class.

Three modifier steps set it (`lib/base/base.modifiers.css`):

| Class | `--fs-scale` | Body lands at | Use |
|---|---|---|---|
| `scale-l`   | 1.15 | ~18.4 pt | Gentle bump — slightly larger rooms. |
| `scale-xl`  | 1.3  | ~20.8 pt | Strong — projection, back-of-room reading. |
| `scale-2xl` | 1.5  | 24 pt    | Dramatic — large halls, low-vision accessibility. |

### Why the calc lives on `:root, section`

Custom-property `var()` substitution happens at the element where a
property is **declared**, not where it's used. A `:root`-only
`calc(… * var(--fs-scale))` would bake in `--fs-scale: 1` and never see a
per-slide override. Declaring the 12 tokens on `:root, section` gives the
`:root` copy for the Marp chrome bridges and a per-`section` copy that
re-runs the calc against each slide's own `--fs-scale`.

### Scope is native Marp class scoping

No second mechanism — the same class works at both scopes through Marp's
own directive grammar:

```markdown
<!-- _class: scale-xl -->   <!-- this slide only (spot directive) -->
```

```yaml
---
marp: true
class: scale-xl            # whole deck (global front-matter directive)
---
```

A slide-level `_class` also scales that slide's `::after` pagination and
`header` / `footer` chrome, since they inherit `--fs-scale` from the
section. The modifier composes with any layout or variant (`dark`,
`cards-grid`, …) because it only sets one custom property.

### Venue — name the room, and the engine picks the scale

`venue:` in the front matter says where the deck will be seen. It is the author-facing
way to set the scale: an author knows the room, not the multiplier the back row needs.

```yaml
venue: conference   # laptop · huddle · conference · hall · phone · tablet
```

The default is `laptop` on a 16:9 deck and `phone` on a square, portrait, story or mobile
one; see "Handheld venues, and the shape sets the step" below.

| `venue:` | Who is watching | Back row, in screen-heights | Type step | Label lift | Code lift | Body x-height at the back row |
|---|---|---|---|---|---|---|
| `laptop` *(default)* | You on your own screen: a PDF or a handout | ≤ 3 | 1x | — | — | ~17′ |
| `huddle` | 4–6 people around a TV | ~4.5 | 1.15x | — | — | ~13′ |
| `conference` | 10–30 people, a large TV or projector | 5–7 | 1.3x | 1.15x | 1.15x | ~11′ |
| `hall` | 50–2,000 people, a stage screen | 7–10 | 1.5x | 1.3x | 1.14x | ~10′ |

`lib/core/resolve-venue.js` maps each venue to a class (`venue-laptop`, `venue-huddle`,
`venue-conference`, `venue-hall`, `venue-phone`, `venue-tablet`), and `base.modifiers.css` gives
each class its `--fs-scale` rung, its `--venue-meta-lift` and its `--venue-compact-lift`. A per-slide `venue-*`
overrides the deck's, and a slide can still carry `scale-*`, which wins over the venue's
rung (the venue rules come first in the file) while the label lift stays.

#### Handheld venues, and the shape sets the step (owner ruling 2026-11-05)

The room bands above assume a 16:9 slide on a screen across a room. A square post or a story
is mostly read in a hand, where the same step reads differently. Measured on a 1080-wide box,
converted to points on a 390pt-wide phone (whose own reading size is 17pt):

| Shape | laptop step on a phone | characters a line at hall (x1.5) |
|---|---|---|
| square | 10.9pt | 44 |
| portrait, story, mobile | 17.0pt | 28 |
| 16:9 | 6.5pt (not read in a hand) | 74 |

So a square post at the old default read at caption size, and a tall slide at hall set too
few characters a line to read. Two changes follow, and they are the only way type size moves:

- **`phone` and `tablet` venues**, and `phone` is the default for square, tall and strip decks.
  On a square deck `phone` is x1.5 (about 16pt on a phone; it is also the measured hall rung,
  so every capacity budget measured there applies exactly). On a tall or strip deck it is x1,
  the designed size, which already reads at 17pt. `tablet` steps down (x0.75 square, x0.6
  tall, x0.72 strip), because a tablet shows a slide larger than a phone does.
- **The rooms rise less on a tall slide**: x1.1, x1.17 and x1.22 instead of x1.15, x1.3 and
  x1.5, so a story at hall keeps about 35 characters a line (the text-room tight threshold).
- **The small rungs are curated on a phone and a tablet** (owner, 2026-11-06: "our font size
  ladder for phone and tablet are not readable"). One step moves every rung together, and the
  shapes hold meta at different fractions of body (square 0.73, tall 0.64), so at the step that
  set body near 17pt a footer or a label read at about 11pt, Apple's floor. The handheld venues
  keep their step and set the meta, compact and chrome lifts the rooms already use, solved per
  shape for these sizes on the device (a 393pt phone, an 820 x 1180pt tablet):

  | Rung | Target | Phone, every shape | Tablet: square, story, mobile |
  |---|---|---|---|
  | meta (labels, chips, eyebrows) | 13pt | 13.1 | 13.1–13.3 |
  | body-compact (code, support lines, keys) | 15pt | 15.0 | 14.9–15.2 |
  | body | 17pt | 16.5–17.1 | 17.1–17.3 |
  | chrome (footer, page number) | about 12.5pt | 12.6–12.7 | 12.5–13.0 |

  A portrait slide on a tablet, limited by the tablet's width rather than its height, reads
  larger (body 21.4pt). Larger targets (19 / 17 / 15pt) were built and measured first: across
  the galleries at the phone venue they clipped 90 to 236 more slides per shape even when split
  by measurement, so these were chosen. The lifts are in `base.modifiers.css` beside the steps.

The table is `VENUE_SCALE_BY_FAMILY` in `lib/core/resolve-venue.js`, applied in
`base.modifiers.css` off the section's `data-family` stamp, so the default follows the box a
slide renders at; `venue: laptop` stamps `venue-laptop` to opt out. Lint reads each venue at
the smallest measured rung at or above its step (`venueRung`), so a budget never promises
room the slide does not have. The before/after on a real deck and every gallery is §18 of
`engineering/decisions/2026-10-28-fit-everywhere-model.md`.

**Why the room reduces to one number.** How big text looks is the angle it takes up in
the eye: `angle (arcminutes) ≈ 3438 × text height ÷ viewing distance`. Slide text is a
fixed share of the screen's height, so for a back row `k` screen-heights away the angle
is `3438 × (text height as a share of screen height) ÷ k`. The screen's size cancels:
a boardroom TV and a stadium screen read the same at the same `k`, and rooms are built
so a bigger audience gets a bigger screen. That is why your office's six room sizes fall
into four bands.

**The threshold.** We read lowercase words by their x-height. At about 5′ of x-height a
viewer with 20/20 vision can just make letters out; around 8–12′ young readers read
fluently; about **12′** is comfortable for a mixed audience, including readers over 60,
many of whom see around 20/40 even with glasses. A dim projector or a lit room raises
every figure. (These are standard figures from the reading-vision literature and the
"4-6-8" room-design rule; they set the bands, and nothing in the build re-derives them.)

**Lattice's sizes.** Body text is `1.67cqi`, about 3.0% of a 16:9 slide's height, and
its x-height about half that. The meta role (labels, captions, header, page number) is
`1.17cqi`, about 2.1%. So at scale 1, body text is `≈ 51.6 ÷ k` arcminutes and meta
`≈ 35.8 ÷ k`. The rung for each venue is the one that brings body text near 12′ at the
band's typical `k`; the label lift is the one that keeps meta at about 8′ or more there
while staying under the body (0.81 of body at `conference`, 0.91 at `hall`).

**The code lift keeps labels from out-sizing the data beside them** (owner ruling
2026-09-29). The label lift alone put labels (21.9 pt at hall) above code and support
lines (20.2 pt). So `--fs-body-compact` takes its own lift: the label lift at `conference`
(1.15x), and 1.14x at `hall`, the most that keeps it under body text (the label's 1.3x
would put code at 26.2 pt over a 24.0 pt body). The code pane's line and column budgets at
those venues are measured with it.

**`hall` cannot get there on size alone.** At 8 screen-heights even 1.5x leaves body text
near 10′. The answer is fewer words per slide, which is why `lint:deck`'s budget
message suggests a statement, big-number or divider slide at `hall`.

**What a venue changes, all at once:**

- the type step (the rung above);
- the label lift (`--venue-meta-lift`, a factor on the meta and h6 roles; 1 elsewhere);
  The running header, footer and page number opt out: they read `--chrome-fs`, which is
  `--fs-meta` with the lift divided back out, then cut by `--venue-chrome-cut` (0.85 at
  conference and hall; `lib/typography/emit.js`). They are wayfinding, not something the
  back row reads, so they sit at 0.60 of body text (laptop: 0.70). At hall that is 19.1px on a
  1280px slide, 5.7 arcminutes of x-height at 8 screen-heights, above the ~5 floor;
- the code lift (`--venue-compact-lift`, a factor on the body-compact role; 1 elsewhere);
- `capacity-scale` warns on a slide past its budget for the room;
- the fixed-size rule below applies, as it does to any scale;
- chart text grows with it (next section).

### Chart text follows the venue (since 2026-11-10)

A chart draws its labels in viewBox units inside an SVG fitted to its box. The venue grows every role around the
chart, so the box gets shorter, and until 2026-11-10 the SVG scaled its labels down with it: a captioned line chart's
category labels printed 14.1 px at laptop and 8.7 px at hall, about 2.5′ at the hall's back row
(`followups.d/3098`, `engineering/decisions/2026-11-09-type-hierarchy-study.md` §10).

**The target.** Chart labels (category names, axis numbers, data labels, the key) hold at least **8′ of x-height at
the venue's back row**, the label figure above. With the model `arcminutes = 3438 × (0.5 × px ÷ 720) ÷ k`, the floor
at a 1280 × 720 slide is:

| Venue | Back row `k` | Floor (px) | Meta role (px) | Meta at the back row |
|---|---|---|---|---|
| `laptop` | 3 | 10.1 | 14.9 | 11.9′ |
| `huddle` | 4.5 | 15.1 | 17.2 | 9.1′ |
| `conference` | 6 | 20.1 | 22.4 | 8.9′ |
| `hall` | 8 | 26.8 | 29.2 | 8.7′ |

**The mechanism** (`lib/transformers/chart-text-venue.js`). The chart frame hands every kernel one factor, `ctx.textScale`.
The kernel draws on a canvas that many times smaller in user units with its text the same size in them, so the
labels print that many times larger in the same box. Every room a kernel reserves from its font size (the tick
column, the category row, a key) is reserved at the larger size too, so the drawing lays out for its text instead of
colliding: a crowded axis thins evenly, as it does on any narrow chart. The factor is
`growth × box at laptop ÷ box at the venue`:

- **growth** is how much larger chart text prints than at laptop: the meta role's own growth (step × label lift),
  or what takes the smallest laptop chart label (13.1 px, a 7-unit axis number on a captioned chart) to the floor,
  whichever is larger. Huddle 1.16, conference 1.54, hall 2.05.
- **the box** is modeled from what the slide carries above and below the chart. Measured in Chromium on a 1280 px
  slide with a running header, meta and footer (cuoio), one bar slide per variant, the chart body's height in px:

  | | laptop | huddle | conference | hall |
  |---|---|---|---|---|
  | bare (one-line title) | 442 | 435 | 427 | 416 |
  | an eyebrow takes | 23 | 25 | 30 | 37 |
  | each extra title line | 45 | 51 | 57 | 64 |
  | each subtitle line | 36 | 41 | 46 | 52 |
  | a source line | 81 | 84 | 93 | 103 |

  The bare box barely moves (0.94 at hall). A title that wraps, a subtitle and a source line are what cost the
  chart its height, so the factor reads them off the slide (`chart-frame.js` `slideChrome`).
- **the cap**: the factor stops at **2.5**, a landscape canvas no shorter than 72 units, the floor the family already
  sets for a pane (`cartesian.js` `PANE_VIEW_MIN`). Past it the text reservations leave no plot: at 2.7 a bullet's
  rows printed over each other and a waterfall flattened to a sliver. A slide that would need more is too full for
  the room, and its labels print as large as a working layout allows.

The canvas (`chartTextCanvas`, handed to kernels as `ctx.textCanvas`) gives up the height the venue takes
(180 ÷ factor) and spans **80% of the chart box's width** in the same units, never less than the laptop chart's own
width. At a venue the box is far wider than 16:9; a 16:9 canvas letterboxed into half of it, turned a column chart
into cramped rows and cut its names. The other 20% is for what a kind draws beside its canvas (stacked-bar's key):
at 90% that key made the width bind and left stacked-bar at 26.1 px at hall, under the floor. A waterfall draws
nothing beside its plot and takes the whole box (`wide`), so a one-word step name keeps its slot. On a short plot
the value axis prints every Nth tick label so they stay a line apart (`buildValueTicks`); the gridlines stay, and
the guard below then steps the factor down, since a thinned label is a label lost. A Cartesian key (bar, stacked-bar,
line, heatmap) keeps its laptop type size (`fontScale: ctx.textScale`): its type is a share of the canvas height, so
without that it shrank as the canvas did (a grouped bar's key printed 18.7 → 14.6 px). A keyed chart (pie, map,
radar) fits its key to the canvas (`svg-legend.js` `fitKeyToPane`), and at a venue its right rail may take the
portrait key's wider label column so a label holds one line. **Laptop is exactly 1**: a laptop deck's charts are
byte-identical.

**The guard: the factor never costs a label** (`chart-frame.js`, `chart-text-venue.js` `keepsEveryLabel`). A larger
type in a smaller canvas can cut a name to "…", thin an axis or make a key bind on width, and a name lost is wrong
data. So at a venue the frame draws each chart twice, at factor 1 (the drawing it made before this change) and at the
venue's factor, and keeps the venue drawing only if it has no more "…", no fewer `<text>` labels, no more label-drop
records and no smaller unit in the modeled box. Otherwise it steps the factor down (75%, 50%, 25% of the way to 1) and
falls back to factor 1. A finer ladder was tried and rejected: a step the modeled box passes can still bind on width in
the real box (histogram at hall printed 19.9 px). The guard does not see overlaps; the regression test below does.

**Where it applies.** Landscape 16:9 slides only. The box model is measured on a 1280-wide landscape slide, and on
portrait, square and 4:3 slides the factor overlapped text and pushed it off the slide, so those keep factor 1 (today's
drawing). So does a chart in a **pane** (its canvas divided by the factor cut category names), and so do bullet, slope,
risk-matrix, tower and quadrant, whose layouts broke or whose key shrank on a venue canvas. Every kind still short of
the floor is in `followups.d/3098-p1-chart-text-venue-remaining-kinds.md`.

**Measured** on each kind's default gallery slide, landscape, the smallest chart text in px (before → after). No kind
prints smaller than before at any venue or slide size, which `test/integration/components/chart-text-venue-regressions.test.js`
pins for every slide of the factor-taking kinds' galleries:

| Kind | laptop | huddle | conference | hall |
|---|---|---|---|---|
| bar | 17.4 | 17.1 → 20.4 | 14.1 → 26.7 | 13.0 → 32.5 |
| funnel | 16.0 | 15.7 → 21.1 | 13.4 → 24.6 | 12.7 → 31.8 |
| heatmap | 16.3 | 15.9 → 19.0 | 15.4 → 29.2 | 12.1 → 30.3 |
| waterfall | 16.3 | 15.9 → 19.0 | 15.4 → 25.1 | 12.1 → 25.7 |
| stacked-bar | 16.0 | 13.9 → 16.6 | 13.4 → 22.1 | 12.7 → 25.2 |
| ep-curve | 14.3 | 13.9 → 16.8 | 13.4 → 22.5 | 12.7 → 26.4 |
| line | 17.2 | 16.9 → 22.8 | 14.4 → 17.4 | 13.7 → 19.0 |
| histogram | 16.0 | 13.9 → 16.8 | 13.4 → 20.4 | 12.7 → 17.4 |

`test/integration/components/chart-text-venue.test.js` pins the floor at every venue for bar, funnel and heatmap.
Waterfall, stacked-bar, ep-curve, line and histogram take the factor and grow, but the guard stops them short of the
floor where the full factor would cut or drop a label (line's quarter names at conference, histogram's bin labels at
hall). The HTML kinds (kanban, progress, timeline-list, journey, matrix-grid) already ride the role tokens.

**What it cannot do.** A slide whose chart box is very short at a large venue (a two-line title AND a two-line
subtitle at hall leave a pie about 210 px) cannot hold five key rows at the floor; the key prints as large as the box
allows. That slide is too full for the room: cut the subtitle, as the `hall` budget advice says.

### The scale is a setting: a slide too full for it clips

Type grows with the scale and the box does not. A one-line element needs about `s` of its
designed height, and a wrapped paragraph about `s²` (1.69x at `scale-xl`). A slide filled
to its component's designed capacity therefore cannot hold 1.3x.

**The engine renders every slide at the size the deck asks for, whatever its content.** A
venue is an intentional setting, like desktop zoom: the author chose the room, so nothing
shrinks a slide, or the deck, to fit (owner ruling 2026-09-27). What you get:

- **One size, deck-wide, by construction.** Body text, the running header, the eyebrow, the
  footer and the page number are the same size on every slide, on every surface — the PDF,
  the exported `.html`, the Studio's preview and Present — because every surface renders
  the same fixed scale. Nothing measures the whole deck, and one added line can never move
  the deck to another size.
- **A slide too full for the size clips, and is named three ways.** `lint:deck` warns
  (`capacity-scale`) while you write; the Studio rings the slide and offers a one-click fix —
  split the slide, or move the whole deck to the next venue down; the export's `⚠ OVERFLOW`
  line lists the page.
- **Pick the room in the Studio.** Deck settings → **Look → Venue** writes `venue:`.
  Present has a venue switch that changes the room size live, for this showing only, without
  editing the deck.

**What was retired.** From 2026-09-25 to 2026-09-27 the engine stepped a slide that did not
fit down the ladder (STEP) and then put every slide that asked for the scale on the lowest
rung any of them needed (LEVEL), with a hidden whole-deck measuring frame in the Studio to
do the same for one-slide previews. It was not deterministic (one line could move the whole
deck to another size), it cost about 1.3 s of main-thread work per measure on an 81-slide
deck, and it shipped two live bugs. The record, with the numbers, is
`engineering/decisions/2026-09-25-font-scale-fit.md`, Amendment 2026-09-27 (3).

- **Every component states its budget per venue.** Its manifest's `venueCapacity` holds the
  element count it fits at `laptop` / `huddle` / `conference` / `hall` (measured at a wide
  @size by `tools/calibrate-capacity.js`), or one sentence saying why it has no count budget
  (a chart scales to its box; a title has nothing to count). Its `.docs.md` prints it on a
  "**By venue**" line, and `dist/docs/components.pick.md` has a `by venue` column, so you can
  pick a component that fits the room before you write.
- **`lint:deck` flags it first.** `capacity-scale` names a counted component past that
  budget at the deck's scale, and a `code` block past the pane's scaled line or column
  budget. It reads the same numbers, baked into
  `lib/authoring/venue-capacity.generated.js`. A `split-panel` claim panel, and `list`,
  `cards-grid`, `list-steps`, `compare-prose` and `cycle` in the registers their manifest measures
  (`venueCapacity.panel` and `venueCapacity.rows`), are judged by the LINES their text wraps to
  rather than by a count, because an item's line breaks decide whether it fits (the decision
  record's Amendments (6), (7) and (9)). A `code` or `compare-code` pane reads the row measured
  under as many heading lines as the slide's heading wraps to, and `glossary` and `list-tabular`
  read an item's length in characters, with an eyebrow's measured cost (Amendment (8));
  `glossary` under an eyebrow reads a row measured on a 4k deck when the deck is 4k, where the export forgives 12 px rather than 36
  (Amendment (9)). `tools/score-venue-lint.js` scores
  the rule against the export's clips on any deck.

Code keeps scaling, and its line cap scales with it: at a wide @size the pane holds 15 /
13 / 11 / 10 lines at 1 / l / xl / 2xl (13 / 11 / 10 / 8 under an eyebrow), and
`floor(102 / (s × lift))` columns, where the lift is the code role's venue lift (1 / 1 / 1.15 / 1.14). See `engineering/decisions/2026-09-25-font-scale-fit.md`.

### One size across modifiers — spacing may change, a type role may not

One size per deck holds only if nothing on a single slide changes a type role's size. So
**a per-slide class may change spacing, chrome and color, never the size of a type role**:

- A role token (`--fs-*`, and the lifts `--venue-meta-lift` / `--venue-compact-lift`) is declared only on
  `:root` / `section` in a `*.tokens.css` file or by a venue / scale rung (`section.venue-*`,
  `section.scale-*`). The rung is the one carve-out: a spot `_class: scale-xl` (above) still
  sets one slide apart; `lint:deck` names it (`spot-scale`: a warning for a spot `venue-*`, a note for a spot `scale-*`).
- A cross-component modifier (`compact`, `claim-*`, `accent`, a mood, tone or state stamp)
  sets no type size on content. `claim-hero` tightens the frame; it does not shrink the text.
  Pseudo-elements (a state stamp's label, a drawn mark) are chrome and are exempt.
- A component's OWN variant may assign its elements to roles (`list principles` sets rows in
  `--fs-emphasis`): that is a different layout, and each role still has one size per deck.
  Code's step down (`--fs-body-compact`) is a role for the same reason.

`checkTypeSizeModifiers` in `tools/check-ownership.js` enforces it in `build:check`, budget 0,
with `SANCTIONED_TYPE_SIZE_MODIFIERS` for the provably size-neutral — each with its reason.
`cards-stack compact` and `q-and-a compact` used to drop their text a step; since 2026-09-27
they tighten spacing only, so a fifth q-and-a pair needs `compact` and a sixth needs a new
slide. The audit is in `engineering/decisions/2026-09-25-font-scale-fit.md`, Amendment
2026-09-27 (2).

### One reading size — every component reads at `--fs-body`

The venue multiplies every role by one factor, so it cannot make two components agree: if
a list reads at `--fs-message` and a table at `--fs-body-compact`, a deck shows two reading
sizes at every venue. So **every component's reading text is `--fs-body`** (owner ruling
2026-09-29): 16 / 18.4 / 20.8 / 24.0 pt at laptop / huddle / conference / hall.

| Venue | Reading text | Code |
|---|---|---|
| `laptop` | 16 pt | 13.5 pt |
| `huddle` | 18.4 pt | 15.5 pt |
| `conference` | 20.8 pt | 20.1 pt |
| `hall` | 24.0 pt | 23.0 pt |

The named exceptions, each reading at its own role on purpose: display components (title,
divider, quote, big-number, closing, topic, stats, kpi); display registers (`list principles`,
`list-steps ghost`, `q-and-a solo`, `image statement`, `citation-card margin` and
`pull-quote`); one lead sentence per slide (split-panel claim, premise lead, scene and video
lead lines, policy-recommendation's impact line and quote, inventory's callout band and pull
line); text a chart draws (SVG labels, HTML chart keys and legends); label boards (kanban,
logo-wall, obligation-matrix); fixed cards (contact, wifi); code; and **support lines**, which
read one step below the row they support (a list item's detail line, `content`'s sub-bullets,
split-panel `proof` / `capstone` supporting lines, a timeline-list milestone's description —
owner ruling 2026-09-29). The rule holds in every family and finish, not only the wide
default: portrait `decision`, `compare-prose` and `roadmap horizons` read at `--fs-body`, and
so does the `sketch` finish's split-panel. A generated `glossary: auto` appendix pages itself
by the glossary's measured budget for the venue, so a long one no longer clips.

Three things keep it that way:

- **`build:check` counts the smaller roles.** Every `var(--fs-message)` and
  `var(--fs-body-compact)` in engine CSS is counted per file against
  `SANCTIONED_READING_ROLE` in `tools/check-ownership.js`, which names the exception each
  use falls under. That list is the one place the exceptions are enumerated. A new use
  fails the build until it is sanctioned with its reason, and a sanction nothing uses fails
  as stale.
- **`npm run audit:reading-size`** renders every component at the four venues, prints
  component × venue → pt, lists the exceptions apart so each venue's reading line holds one
  value, and lists slides with most of their text at `--fs-meta` (MOSTLY AT THE CHROME
  SIZE). That last list is where reading text set at the chrome size shows up, which the
  count above cannot see.
- **`lint:deck` counts rows at laptop** for `list-tabular`, `glossary`, `premise` and
  `timeline-list` on a 16:9 deck, by each one's measured laptop row (`LAPTOP_JUDGED` in
  lint-core); the first two have no `capacity` block, and the other two hold fewer long rows
  than their `hard`.

The record, with the measured capacity cost of each option:
`engineering/decisions/2026-09-29-one-reading-size-per-venue.md`.

### When NOT to use it

This is a magnitude knob, not a size picker. If one element is wrong,
fix the element's token (§2) — don't scale the whole slide to fix one
heading. And if a slide clips at the scale you asked for, it has too
much content for that magnitude: trim it to its budget at that scale or
split it, the same as any overflow (§4). Choosing a smaller venue for the
whole deck is also fine — but it is your choice; the engine never makes it.

## Type sets — the faces and voices (`typography:`)

The `--fs-*` tokens set **how big** each role is. The `typography:` register sets **which face
speaks each role**: one curated set — `classic` (the default), `ledger`, `poster`, `festival` —
bundles the heading and body faces, the eyebrow's voice and the chart's text voice. Author
reference: `lib/base/base.registers.docs.md` § `typography:`. Record:
`engineering/decisions/2026-11-09-type-voices.md` § Decided, and the nine rules each set keeps in
`2026-11-09-type-hierarchy-study.md` §4.

**Three voices.** Chrome (header, meta line, footer, page number) stays in mono capitals at
`--chrome-fs`. The eyebrow is content: the heading face's italic, as written,
`max(--fs-meta, --chrome-fs × 1.45)` on a content slide and `max(--fs-meta, --fs-h1 × 0.5)` on a
title, dark divider or closing. The chart's ticks, category labels and keys take the body face with
`tabular-nums lining-nums`; its data labels take `--chart-figure-face`, the heading face only
when that face has tabular figures. The tokens (`--eyebrow-*`, `--chart-text-face`,
`--chart-figure-face`) live in `lib/base/base.typography.css`, declared on `:root, section` so a
set's re-pointed faces reach them.

**Size factors follow the face (rule 5: hold the x-height).** A face with a different x-height from
Outfit (0.48) or Playfair Display (0.52) would change what the reader sees at the same px, so each set
face carries an `@font-face` `size-adjust` in the font manifest (`lib/fonts/text-faces.js`
`sizeAdjust`): Inter 87%, Newsreader 100%, Fraunces 92%, Barlow Condensed 110%. The factor goes
wherever the face goes — a heading, the body, a chart label, a blockquote set in the display face at
body size — so no rule can pair a face with the other face's factor, and every `--fs-*` size is the
same in every set. The display factors are capped by width as well as x-height, because a heading that
wraps to a second line moves every box under it: Newsreader and Fraunces at 1.1× wrapped two headings of
the canonical gallery (journey, logo-wall), and Barlow Condensed at 1.2× clipped a split cover at hall.
The vector PDF, PPTX and ODP have no `size-adjust`, and the computed `font-size` does not carry it, so
each reader multiplies the loaded face's factor into the run's size: `faceSizeAdjust` in
`lib/core/pdf-compose/read-slide.mjs` (the PDF writer both hosts run) and in
`docs/src/lib/calco/reader.ts` (PPTX, ODP), and `tools/type-voice-audit.mjs` measures sizes the same
way. Without it the PDF drew Inter 15% too large at the positions the browser measured, and the words
collided. Canvas `measureText` applies `size-adjust` itself, so Calco measures spacing at the computed
size. Family names match case-insensitively, as the browser matches them. An author's own `@font-face`
with a `size-adjust` is honored by all three. The standalone chart-SVG export
(`tools/lib/chart-font-embed.js`) inlines the set faces with their factor.

**Baselines follow the face too.** Newsreader's own line metrics (ascent 0.735, descent 0.265 em) put
its baseline 0.13 em higher in a line than Outfit's or the mono's, so a row that aligns the faces on one
baseline grew: list-tabular's six rows ran past the frame under `ledger`. The manifest gives it
`ascent-override: 98%` and `descent-override: 26%` (`faceMetricsDecl`), Outfit's proportions. Engine and
theme CSS set every line-height, so a line in one face keeps its height and only its baseline moves; a
line that sets two faces on one baseline is where the height changes, which is the point. The PDF writer
and Calco place a baseline from the browser's line metrics (the override), not the font file's, or
Newsreader would land 0.12 em high in a PDF chart label.
`test/unit/parsing/resolve-typography.test.js` holds every set face's baseline inside the default faces'
range.

**The factor rides on the family name.** The set faces are declared under their real names, so an
author's `style:` that sets `font-family: Inter` gets the bundled Inter at 87%, the size that matches
Outfit's x-height, not a system Inter at 100%.

(An earlier cut put the factor on the `--fs-*` roles; about ten rules that set the display face at body
size were then scaled by the body face's factor, and Inter at an unfactored role read 15% larger. The
face-keyed factor removed both.)

**Checking a set.** `node tools/type-voice-audit.mjs --theme <t> --mode <m> --typography <set>`
prints every role's measured face, size and contrast and every content/chrome collision;
`test/integration/type-voices/typography-sets.test.js` runs it over every palette theme × every
set in both modes and fails on a zero-axis content/chrome pair, an inverted ink ladder or an AA
miss.

## 8 — Measure (line length)

Size is how tall a letter is. **Measure is how many characters fit on a
line**, and it is the other half of readable type. The two are governed
separately here, and confusing them is a live source of bugs.

### The unit rule

**A measure is written in `em`. Never in `cqi`.**

`em` resolves against the element's own `font-size`, so `max-width: 16em`
means "sixteen letter-heights of line" wherever it lands. `cqi` is a
fraction of the **slide**, so it fixes a pixel width and lets the
character count fall where it may.

Those two agree only while the type size holds still — and in this engine
it does not. The scale is **curated per orientation** (§1.4): portrait
runs much larger type on a much narrower frame, by design. So one `cqi`
cap resolves to a different measure on every slide shape. Measured before
the 2026-08-02 fix, a single declaration on the bookend headings allowed:

| | landscape | square | portrait |
|---|---|---|---|
| `max-width: 62.5cqi` | ≈22 characters | ≈17 | **≈12** |

Twelve characters per line. The same rule, the same slide, a different
shape. Writing it as `16em` makes it ≈33 characters everywhere.

`em` costs nothing in resolution-independence, which is the usual reason
to reach for `cqi`: `--fs-*` is *itself* `cqi`, so an `em` measure rides
the curated scale and renders identically at 4K and 8K for free.

### The ranges

Conventional, and what the tokens below are sized to:

| Tier | Measure | Why |
|---|---|---|
| Display (a heading) | **20–35 characters** | Short enough to take in as one shape; long enough not to shatter into stubs. |
| Reading (prose, a lede) | **45–75 characters** | The classic body range. Past ~75 the eye loses the line return. |

### Where measures live

The engine keeps **very few**, on purpose. Framing text on an ordinary
component *fills its masthead band* and takes its behavior from the
`headline:` register — a component does not compose its own chrome
(`engineering/decisions/2026-07-30-masthead-framing-fills-the-band.md`).
Fit is autosplit + atomization's job, never a width cap's.

The **sovereign bookends** are the exception: on `title` / `closing` /
`divider` the heading and subtitle *are* the slide's content, so a
composed measure is theirs. Two tokens serve all three
(`lib/base/base.tokens.css`):

| Token | Value | ≈ | Applies to |
|---|---|---|---|
| `--measure-bookend-heading` | `16em` | 33 ch | `title h1`, `closing h2`, `divider h2` |
| `--measure-bookend-lede` | `26em` | 56 ch | `closing p`, `closing` list rows, `divider.light p` |

**Where they bind: landscape, with one exception.** Portrait frames are
narrower than either token, so both go inert; on square the heading
measure does too. The square lede is inert inside `closing`'s frame by a
margin of ~10px — but `divider.light` drops divider's left inset, so its
frame is ~54px wider and the lede measure binds there by about 1em. That
one case follows from the light variant's own framing, not from the
measure. Override either in a deck's front-matter `style:` to compose
differently.

Body-prose measures elsewhere (`content`'s stage prose, `imagery`'s `ch`
caps, `quote`'s blockquote) are a separate concern and stay: a reading
measure on body copy is not a component composing its chrome.

### Measure is not line balance

They are orthogonal, and each fixes what the other cannot:

- **The measure** decides how wide the block is.
- **`text-wrap: balance`** decides where the breaks fall inside it.

Widening a cap to cure an orphaned last word does not cure it — it moves
it, and buys a longer line for nothing. Reach for `balance` on any
heading that can wrap; it spends no width. It is on every bookend heading,
on `imagery/image` + `imagery/scene`, and on the shared split note
(`base.modifiers.css`).

### Cross-reference

`engineering/decisions/2026-08-02-sovereign-bookend-measures.md` — the
measurement behind the two tokens, and why landscape was deliberately
*not* held byte-identical.
