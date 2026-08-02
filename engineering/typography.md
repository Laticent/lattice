# Typography contract

Lattice has **12 font-size tokens** organized as three independent scales.
Each token has a single, named role. Picking the right token is a
one-step decision, not a "which size feels right" judgement call.

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
the size for cards, lists, and inline prose read at desk distance.
Slide-level statement bodies step up to `--fs-message = 2.1875 cqi`
(21 pt). Values are normalized to the proven legacy footprint, a touch
above it — not the projection-floor inflation the first rethink shipped.
Five steps.

| Token | cqi | pt | Role |
|---|---|---|---|
| `--fs-meta` | 1.17 | 11.25 | Chrome only — pagination, footer, eyebrow labels, micro-captions, pills. |
| `--fs-body-compact` | 1.40 | 13.5 | **Dense reference cells** — table cells, glossary definitions, grid-quadrant prose (list-tabular, glossary, compare-table, matrix-2x2, verdict-grid, obligation-matrix, actors) **and every plain markdown table**, via the base layer's universal table treatment (`base.elements.css` § UNIVERSAL TABLE). Scanned, not read linearly; packs many cells in a fixed box, so it sits one step below the default body. |
| `--fs-body` | 1.67 | 16 | **Default container body.** Cards, lists, inline prose, list-item bodies. The cascade default (`section { font-size }`). |
| `--fs-message` | 2.1875 | 21 | **Slide-level statement body.** Paragraphs in statement / quote / divider / centered layouts. Lead prose under headings. Anything author-written for "this is the slide's message." |
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
| `square` | `0.95–1.05` | 1:1 social | 1080 (1cqi = 10.8 px) |
| `portrait` | `< 0.95` | portrait · story · mobile | 1080 (1cqi = 10.8 px) |

(Boundaries are the `data-orientation` stamp's — `orientationFor` in
`lib/engine/css.js`.) Each is a *curated* hierarchy, NOT the landscape scale times a constant: portrait
pulls the title ramp down (so a 2-line `h1` fits a tall frame) while keeping body
generous; square stays punchier than landscape but smaller-titled than portrait
(a 1:1 box is height-limited). `landscape` is the unstamped default and is
byte-identical to the historical scale. To change a size, edit the manifest — one
source of truth, three scales that cannot drift apart. **Readable text always
uses a `--fs-*` token** (a drift-guard test bans raw `cqi` font-sizes), so it
follows its slide's orientation automatically. Full rationale + the §11 selection
mechanism: `engineering/decisions/2026-06-20-typography-categories.md`.

## 2 — Author's mental model

> **HTML heading**: use `--fs-h<level>`. `h1` → `fs-h1`. `h2` → `fs-h2`. …
> No decision about "which one fits"; it's the element you wrote.
>
> **Card / list / inline prose**: `--fs-body` (16 pt). The cascade
> default — most container content needs no override.
>
> **Dense table / grid cell**: `--fs-body-compact` (13.5 pt). Wired into
> the table/grid component CSS (list-tabular, glossary, compare-table,
> matrix-2x2, verdict-grid, obligation-matrix, actors). Authors don't
> pick it; the component does, because those surfaces pack many cells
> in a fixed box.
>
> **Slide-level statement body**: `--fs-message` (21 pt). Paragraphs in
> statement, quote, divider, centered, big-number layouts. The "this is
> what the slide says" prose.
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

The eyebrow visual (mono uppercase 13-ish px) is unchanged — it's
delivered by the `\`label\`` inline-code paragraph modifier in
`base.modifiers.css`, not by an h-tag.

## 4 — Anti-patterns

- **Picking a size by feel.** "A bit smaller than h2" → use `--fs-h3`,
  not "let me try `--fs-xl` or `--fs-2xl`." The old t-shirt names
  are gone; everything has a role.
- **Using `--fs-body-compact` for slide-level prose.** Compact is for
  dense table/grid cells. The blockquote in a quote slide, the lead
  paragraph under a title, the divider subtitle — those read
  `--fs-message`; ordinary cards and lists read `--fs-body`.
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
too. Raising it scales the readable sizes **in lockstep** — body,
supporting headings (h3–h6), hero, chrome (pagination / footer / eyebrow)
— so the tuned proportions are preserved; only the magnitude moves.

### `--fs-h1` and `--fs-h2` are exempt

Ten of the twelve tokens scale. **`--fs-h1` (48 pt) and `--fs-h2` (28 pt)
stay fixed** — they're left as plain literals, outside the multiplier.
That tier is the *dominant display* role: the deck title, the standard
slide title, and the KPI/stats headline numbers and table/chart column
headers that reuse those two tokens (see §3 and the consumer list in the
token CSS). It is already large enough to carry the back of the room, and
scaling it too is what makes titles balloon past the safe area or wrap to
a second line. So the rule is: **the big stuff holds its designed size;
the small, readable stuff grows toward it.** At `scale-2xl` a 16 pt body
(→ 24 pt) closes most of the gap to a 28 pt h2 — the title still leads,
but no longer by 12 pt. If you genuinely need a bigger *title*, that's a
per-element token choice (h1 vs h2), not a job for the global scale.

### What scales, what holds, what's independent

Verified by rendering each structure at `scale-xl` (both the marp-cli and
emulator paths):

- **Scales** (rides `--fs-scale`): body prose, lists, cards; supporting
  headings h3–h6; the hero / big-number tier (`--fs-hero`); chrome
  (pagination, footer, eyebrow); **table** cells (`--fs-body-compact`) and
  headers (`--fs-meta`), including plain markdown tables (`--fs-body`);
  **code** blocks; **quote/blockquote** body text; **KaTeX math** (its
  `em`-relative sizing is anchored to the scaling container font-size);
  chart legends and token-styled labels.
- **Holds its designed size** (the h1/h2 exemption above): slide titles;
  the KPI/stats headline numbers and panel metrics that reuse
  `--fs-h1`/`--fs-h2`; the decorative quote marks; `list-tabular`'s large
  index numerals; a chart's big value.
- **Independent of the scale** (rendered to SVG by its own engine):
  **Mermaid diagrams.** Mermaid sizes its node/edge labels itself (px
  baked into the emitted SVG via `themeVariables`), so a scaled slide
  enlarges the title and surrounding prose but *not* the diagram's
  internal text. If a diagram must read larger, size it at the Mermaid
  level (fewer nodes, a width/height directive), not via `--fs-scale`.

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

### When NOT to use it

This is a magnitude knob, not a size picker. If one element is wrong,
fix the element's token (§2) — don't scale the whole slide to fix one
heading. And if a slide overflows at a higher scale, it had too much
content for that magnitude: split it or step the scale back down, the
same as any overflow (§4).

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
