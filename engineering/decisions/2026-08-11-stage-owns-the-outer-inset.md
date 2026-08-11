---
status: shipped
summary: States "the stage owns the outer inset, a body owns only the spacing between its own elements" as a named Forms invariant (design/forms.md §6.1) and brings the two buckets that broke it — chart and diagram — into line with the four that already kept it. Both re-derived the frame inset with the same `calc(100cqi - 2 * var(--sp-2xl))` expression, and the chart stacked its own `padding: var(--sp-lg) var(--sp-2xl)` on top, so a chart's figure paid 192px per side against prose's 64 and a diagram paid 128. Both calc copies retire; `.chart-body` and the mermaid box now fill their container exactly; the chart's per-chart inset tunings (family default, tall/strip, state-chart, timeline-list, timeline-list tall/strip) re-home to `.cell-stage` verbatim; the glass panel's inset moves to the opt-in `.canvas` rule where it is earned; the `section.chart-frame` padding block is SCOPED to `:not(.form)` rather than deleted (it is live on the `no-form` path — the card's "dead rule" reading was measured only under the Form). Block axis is neutral to the pixel (the cqh basis is the same number, subtracted one box higher); the inline axis reclaims the duplicate, so every chart figure gains 2 × --sp-2xl and every diagram body aligns with its own title, dek and Key Insight for the first time. Kept by two paired gates: `checkStageInsetOwnership` (browser-free, in build:check) and a measured inset assertion in check-chart-fit.js at three sizes.
---

# The stage owns the outer inset

**Date:** 2026-08-11
**Area:** forms / charts / diagrams / gates
**Issue:** #1598 (the structural precondition for #680, which stays open)
**Governing docs:** `design/forms.md` §5/§6 (the Cell ownership line, the gap +
clip contract), `engineering/decisions/2026-06-26-frames-as-flex-cell-trees.md`
§6/§7 (the record that revived `.cell-stage` as a real element)
**Adjacent and constraining, not superseded:**
`2026-06-15-form-chart-clip.md` (why the SVG sizes off a `container-type: size`
chart-body), `2026-07-04-chart-container-fill-sizing.md` (the container-fill
model built on it), `2026-07-15-viz-frame-merge.md` §5 (the flex pin that makes
an overstuffed chart spill rather than silently clip).

---

## 1. The rule

> **The stage owns the outer inset. A body owns only the spacing between its own
> elements — `gap` between its children, a CLIP MARGIN where its overflow must
> not cut at the layout edge, and whatever padding is genuinely required by a
> thing that paints its own surface.**

HARD RULE #20 already fixes *what* to space with (`padding` and `gap`, never
`margin`). This fixes *which box* the outer inset belongs to. Where there is no
stage — a `no-form` slide, a Read·Article `figure` re-host — the box that HOLDS
the body plays the stage's part. The rule is about ownership, not a class name.

Four of six buckets already kept it. This card wrote it down and fixed the two
that did not.

**The clip-margin clause is not decoration, and it is the one thing the card did
not know.** `overflow` cuts at the PADDING box, so a body's padding is doing two
jobs at once: it insets content from the box's edge AND it lets content paint
that far past the layout box before anything is lost. For chart and diagram the
INLINE half was a genuine duplicate of the frame inset and the BLOCK half was
the slack — and the difference is measurable, not a matter of taste. Removing
the block half clipped nine decks that had never clipped (§7). So this change is
**inline-only**, and the block padding stays on the body, renamed for what it
does. The property whose actual job that is, `overflow-clip-margin`, is the
right long-term spelling and does not work yet: Chromium 131 accepts only a
plain `<length>` there, and every spacing token in this repo is a `calc()` over
`--_sec-1cqi` (measured — `overflow-clip-margin: var(--sp-lg)` computes to
`0px`).

## 2. What was wrong, measured

Emulator render → headless Chromium, 1280×720 slide box, indaco, landscape.
Distance from the slide edge to the body box:

| bucket | body element | insets | body box | painted content |
|---|---|---|---|---|
| prose (`compare-table`) | `p` | stage only | 64 | 64 ✅ |
| code | `pre` | stage + the block's own padding | 64 | 88 ✅ |
| masthead (band) | — | stage inset; `padding-bottom` only | 64 | 64 ✅ |
| footer (band) | — | positional, no padding | 30 | 30 ✅ |
| **diagram** | `.mermaid-svg` | stage **+ a width calc** | 128 | 128 ⚠️ |
| **chart** | `.chart-body` | stage **+ a width calc + padding** | 128 | **192** ⚠️⚠️ |

Both violators re-derived the inset with the *same* expression,
`calc(100cqi - 2 * var(--sp-2xl))`, which appeared in exactly two components and
nowhere else in `lib/`. The shape is invisible as a defect because it reads as
**sizing**: it takes the container's own width in container units and subtracts a
spacing token, and the box it produces is centered, inside the frame, and
overflows nothing. It is simply inset twice.

The cost of that invisibility is on the record: #680 costed the chart's inline
debt as "128px of inline padding". It was **256** — the width calc was a second,
separate inset doing the first one's job, and it was not counted.

## 3. What changed

- **`.cell-stage` gained the outer INLINE inset** on the chart path
  (`section.chart-frame > .cell-stage { padding-inline: var(--chart-inset-x) }`).
  Diagram takes **no** stage padding — see §6.
- **Both width calcs retired.** `.chart-body`, the `.mermaid` runtime target, the
  un-rendered source `<pre>`, and `.mermaid-error` are all `width: 100%` now.
- **`.chart-body` lost its own INLINE padding and kept its block padding**, the
  latter documented as the clip margin it is. It keeps everything else that made
  deleting the element wrong: `container-type: size` (the definite box the SVG
  sizing model reads), the `flex: 0 0 auto` pin on the list-charts (so an
  overstuffed one SPILLS and `overflow-probe.js` catches it), the panel anchor,
  the clip, and its named contract in `check-chart-fit.js`, `overflow-probe.js`,
  `carousel.js`, `split-envelope.js`, `prose-projection.mjs`,
  `masthead.transform.js`, `player-core.mjs`, `manifest.schema.json`.
- **Five per-chart inset tunings re-homed** — a parent's padding cannot be
  overridden by a child, so a tuning of the inset has to travel with the inset it
  tunes. Values moved verbatim:

  | | block (clip margin, stays on the body) | inline (the inset, moves) |
  |---|---|---|
  | shared default | `--sp-lg` | `--sp-2xl` |
  | tall/strip family | `--sp-md` | `--sp-sm` |
  | state-chart | `--sp-md` | `--sp-2xl` |
  | timeline-list | `--sp-xl` / `--sp-lg` | `--sp-2xl` |
  | timeline-list tall/strip | `--sp-lg` | `--sp-xl` |

  Both columns re-home to **tokens on the section** (`--chart-inset-x`, `-top`,
  `-bottom`), not to padding on a box — see §5, which is the correction the trio
  forced. The stage reads the inline token; the body reads the block pair.

- **The glass panel keeps its inset and now OWNS it.** `.canvas` re-adds
  `padding-inline: var(--chart-inset-x)` to `.chart-body`, conditional on the
  surface existing (the block half never left). That is the same case `code`'s `pre` earns its padding for,
  and the reason the default (canvas off, nothing painted) earns none.
- **`.chart-caption` lost its inline padding, kept its block padding.** It is a
  stage SIBLING of the body, so its `--sp-2xl` was the same duplicated inset —
  and with the stage now carrying that inset, leaving it would have pushed the
  caption's text 64px inside the chart it captions. Measured: the caption's text
  box is the same 1024px at the same x as before.
- **The un-rendered diagram source `<pre>` lost its `--sp-sm`/`--sp-md`
  padding.** That box explicitly paints nothing (`background: none !important;
  border: none !important` two lines up), so it owns no inset — and the padding
  contradicted the rule's own stated goal three lines down, which is to MATCH the
  rendered `.mermaid` container so the slot does not reflow when the diagram
  swaps in. `.mermaid` has no padding.

## 4. The "dead rule" was not dead — it was mis-scoped

The card asked to delete
`section.chart-frame { padding: 0 0 calc(4.375 * var(--_sec-1cqi)) }` on the
grounds that it never applies: `section.form`'s
`padding: var(--frame-y) var(--frame-x) var(--footer-reserve)` has equal
specificity and lands later in the bundle, and a chart section measures 64px
sides despite a rule saying 0.

That measurement is right, and it was taken **only on the Form path**. `no-form`
(per slide) and `form: off` (per deck) are supported opt-outs, and on that path
there is no `.form` class for the frame rule to attach to — so this block is the
only thing insetting the section. Measured on a `no-form` piechart: section
padding `0 0 56px`, body box 1152 @ x=64, i.e. exactly the geometry this rule
plus the (now retired) width calc produced. Deleting it would have moved the body
box and the footer band on that path.

So it is **scoped, not deleted**: `section.chart-frame:not(.form)` now names the
one path it governs, and reads true. It carries the inline inset (`--sp-2xl`,
what the retired calc contributed there, so the body box does not move) as
padding, and the block seam as a `row-gap` — because on that path the section is
a flex column holding `h2 → .chart-body`, and a `padding-top` would have inset
the HEADING, which is chrome, not body. A gap is spacing between a container's
own children: the half of the rule a container is allowed to own.

A rule that reads as if it were in force and is not is worse than no rule. That
was the card's real complaint, and scoping answers it without breaking the path
the card had not measured.

## 5. The tuning is a TOKEN, because a chart has two holders

This is the one place the first cut of this change was wrong, and the adversarial
trio's inversion pass caught it with a measurement.

A chart body has **two possible holders**: `.cell-stage` under the Form, and the
SECTION itself on the `no-form` path (§4). The first cut spelled the inset as
`padding` on each holder — which means every per-chart tuning needs a PAIR of
rules, and nothing checks that a pair stayed a pair. It shipped the family default
and the tall/strip arm on both paths and **silently dropped state-chart's and
timeline-list's on the `no-form` path**: measured on a real render, a `no-form`
timeline-list lost the asymmetric block pair its own stylesheet calls the point of
the tuning ("the spine's date pills sit high, so the top seam is a step looser than
the bottom") and fell back to the family's symmetric 32px.

The failure was not the missing rules — those are three lines. It was the *shape*:
a rule per tuning per holder is a pairing invariant with no enforcement, and the
next tuning would have broken it again.

So the tuning is now a **token on the section**, and the two holders are its only
consumers:

```css
section.chart-frame            { --chart-inset-x: var(--sp-2xl);
                                 --chart-inset-top: var(--sp-lg);
                                 --chart-inset-bottom: var(--sp-lg); }
section.chart-frame > .cell-stage { padding: var(--chart-inset-top)
                                            var(--chart-inset-x)
                                            var(--chart-inset-bottom); }
section.chart-frame:not(.form)   { padding: 0 var(--chart-inset-x) <footer band>;
                                   row-gap: var(--chart-inset-top); }
```

A per-chart tuning restates only the token it changes. Overriding an inset can no
longer reach one path and miss the other, because there is only one declaration to
override. Verified on a real `no-form` render: timeline-list's seam is `--sp-xl`
(48px), state-chart's is `--sp-md` (24px), the family default is `--sp-lg` (32px) —
each the value that chart carried before. The Form path is byte-identical to the
padding-on-the-stage cut it replaces (re-measured, all 18 chart-fit slides).

Only the TOP token has a seam to sit in on the `no-form` path; that section's own
`padding-bottom` is the footer band, comfortably larger than any
`--chart-inset-bottom`, so it is the bottom clearance there.

## 6. Calls made explicitly, so they are not discovered later

- **Diagram takes no stage padding, chart does.** A chart is a figure among
  chrome; its stage inset is a real design tuning, and the values are the ones
  `.chart-body` already carried, so a chart's berth is unchanged. A diagram is a
  single self-scaling figure with PROSE SIBLINGS in the same cell — a dek `<p>`
  above and a Key Insight `<blockquote>` below, both `align-self: stretch` to the
  stage edge. Insetting the stage would have insetted them too. Before this
  change the mermaid box was the only thing on a diagram slide out of line with
  its own title; `width: 100%` with no stage padding puts it on the same left
  edge as the title, the dek and the Key Insight. Measured across all 26 diagram
  slides in `diagram.gallery.md`: body 1024 @ x=128 → 1152 @ x=64, heights
  unchanged.
- **The diagram caption's `padding-top` stays a padding.** It is spacing between
  stage children, which the rule would normally hand to `gap` — but the stage's
  gap is ONE value shared by every seam in that column (`--sp-sm`, and `--sp-xs`
  when a dek leads), and this seam wants a step more air than the others. A gap
  cannot be asymmetric, so expressing it as one would move two seams to fix a
  third. It adds nothing on the inline axis and nothing at the stage edge, so it
  is outside what the rule governs.
- **The marp-vscode webview is UNVERIFIED, not cleared.** Both retired calcs cited
  it ("the webview can resolve `100%` against an indeterminate ancestor"). The
  first cut of this change argued the surface away — that export-to-Marp
  "re-exports the deck rather than rendering it in that webview" — and that is
  **false**: `lib/core/marp-bundle.js` says in its own header that the bundle "is
  rendered with Marp (the VS Code extension or marp-cli)", it writes a
  `.vscode/settings.json` pointing that extension at these stylesheets, and it
  ships the browser runtime, so the webview does build `.cell-stage` and does see
  these rules. The surface cannot be driven from this sandbox, so under HARD RULE
  #23 it is marked UNVERIFIED at both declarations. What is known: `state-chart`
  has carried `width: 100%` through every bundle shipped to it without a report,
  and `max-width: 100%` still walls the box if an ancestor ever is indeterminate.
  HARD RULE #12's retirement is the precedent for how such a claim gets settled —
  retest it on a real one and record the result, rather than arguing either way.
- **The Read·Article projection (`figure.chart-frame`) is out of scope.** It
  re-hosts a chart body inside a `figure` with no Form and no `.cell-stage`, so
  an inset on the body is correct there. `timeline-list`'s figure arms keep their
  padding and the projection is byte-identical.
- **Two stages are not single-child.** `gantt` holds `chart-body |
  chart-details`; `state-chart` holds `chart-body | chart-caption | chart-details
  | state-legend`. A stage inset insets those siblings too. `chart-details` is
  `hidden` (no layout), `state-legend` is a centered flex band (narrowing it
  moves nothing), and `chart-caption` is handled above — measured identical.

## 7. What it cost, measured

`test/fixtures/chart-fit.md`, landscape, before → after:

- **Block axis: neutral to the pixel.** The `cqh` basis is "chart-body fill
  height minus the inset"; the inset moved one box up, so the number is the same.
  Every SVG chart's painted box keeps its height and its `y`. The card budgeted
  for this to move; it does not.
- **Inline axis: the duplicate is reclaimed.** Every chart figure's box goes
  896 → 1024 (+128). For a height-bound SVG chart that is a wider box around the
  same letterboxed ink; for gantt (width-bound at landscape) the drawing itself
  grows 209.1 → 238.9 tall; for the HTML-bodied charts (progress, kanban,
  timeline-list, roadmap) the content genuinely widens.
- **state-chart: byte-identical**, as predicted — it never carried the width
  calc, and is the in-tree precedent that the calc was never load-bearing.
- **A `canvas` chart is byte-identical too, after a fix the trio's checker
  forced.** The first cut left the stage's block inset in place AND had `.canvas`
  re-add the panel's, insetting the block axis twice: measured, a `quadrant canvas`
  lost 64px of drawing height and its glass card dropped 32px. No committed deck
  opts into `canvas`, which under HARD RULE #18 is exactly the "low-visibility is
  not an exit" case, not a reason to ship it. The fix is one line and only the
  token design makes it one: `.canvas` zeroes `--chart-inset-top`/`-bottom`, so the
  stage yields the block inset to the box that paints, on BOTH holder paths at
  once. Re-measured: panel 1024 x 407.7 @ x=128 filling the stage with its own
  32/64 inset — its pre-#1598 geometry exactly.
- **`claim-hero` / `claim-bleed` on a piechart or radar is byte-identical too,
  after a second fix the trio's red team forced.** That preset zeroes the
  SECTION's padding for a true bleed and gives `.chart-body` `width: 100%` with
  its own inset — so the stage's new padding silently put 32/64 back, insetting
  the full-bleed chart 64px per side and shortening its body by 64px, at which
  point the `<svg>` overflowed the `overflow: hidden` box by ~20px. The fixture
  carries no `claim-*` slide, so the render gate was green through it. The preset
  now zeroes the inset TOKENS alongside its `padding: 0`, because the two are one
  inset in two boxes. Re-measured against the pre-change tree, landscape and
  portrait: body content box and `<svg>` identical to the pixel.
- **A tall/strip `canvas` chart is byte-identical too, after a third.** The
  panel's internal inset was written as a literal `var(--sp-lg) var(--sp-2xl)`,
  which stopped following the tall/strip adaptive tuning that used to govern that
  exact declaration at (0,2,1). Measured on a portrait `quadrant canvas`: the
  panel's inline inset jumped 26.3 → 105.3px (4×) and the drawing lost 18% of its
  width inside a panel whose outer box had not moved. The panel now reads the same
  TOKENS the stage does, so it cannot drift from the tuning again.
- **A tall/strip `state-chart` keeps the tie it used to win, after a fourth.** As a
  padding, state-chart's tuning sat at (0,3,1) and beat the tall/strip family rule
  (0,2,1), so a portrait state-chart kept the wide `--sp-2xl` side inset. As tokens
  it declares at (0,2,1) and tall/strip at (0,1,1) — so an omitted
  `--chart-inset-x` fell through to `--sp-sm` and the body gained 158px (+20.7%).
  It now restates the inline token at the family default deliberately. Re-measured:
  body content `761.4 @ x=159.3` before and after.

  **The pattern in those three is worth naming**, because it is the cost of moving
  an inset up a box: a per-chart or per-modifier rule that used to win a
  specificity tie *on the padding declaration itself* does not automatically win
  the same tie on the token, and a rule that overrode the padding on the BODY has
  no purchase on a parent's. Every override of this inset had to be re-checked
  against the new tie, and three of them needed a line. The render assertion cannot
  catch this class — it checks ownership, not the tuning's value — which is why the
  before/after box chain on the real render is the evidence here.
- **Two moves that are NOT neutral, disclosed rather than discovered later.** The
  chart CAPTION, a stage sibling, moves 32px UP the block axis (its border box
  narrows to the stage content box; its text box is unchanged at 1024 @ x=128, which
  is the claim §3 makes and all it claims). And on the `no-form` path the section's
  new `padding-inline` insets the HEADING as well as the body — the `h2` goes from
  1280 @ x=0 to 1152 @ x=64. That one is an improvement (the heading used to bleed
  to the literal slide edge while the chart sat at x=128), but it is a change on a
  path the card never asked to touch, so it is stated here rather than left to be
  found. Also on `no-form`: the block seam is a `row-gap`, so it scales with the
  number of section children rather than being a fixed two-sided inset on the body.
  Measured — 2 children +32px of body height, 3 children neutral (the shape the
  values were checked against), 4 children −31.6px. Kept as a gap deliberately: it
  IS the seam between a container's own children, which is the half of the rule a
  container owns, and a uniform rhythm across a flex column is the more defensible
  behavior. No committed deck puts a chart on `no-form`.
- **`check:chart-fit` improved, and was already red.** Before: 5 clips
  (landscape roadmap +10.5, portrait progress +15, portrait timeline-list +12.3,
  square progress +55.5, square roadmap +203). After: 4 — landscape roadmap
  fixed, square roadmap 203 → 45.3, the other three byte-identical. The three
  survivors are a pre-existing capacity problem (a chart that does not fit at
  portrait/square even with autosplit), not an inset one, and are **off the path**
  of this change: tracked as **#1600** rather than pulled into this diff or left
  unrecorded (HARD RULE #18). `SANCTIONED_CLIPS` stays empty.
- **The overflow probe's reading got MORE accurate, and this is the one claim in
  the first cut that was simply wrong.** It said the spill threshold was
  "unchanged by construction". It is not: Chromium does **not** add a
  non-scrolling flex column's `padding-bottom` to `scrollHeight`, and
  `flowedSpill` compares child rects against the stage's BORDER box, so moving the
  inset up one box drops the reported spill by one `--sp-lg` (32px at hd).
  Measured directly — 200px of content, a 200px clip box, the only difference
  being which box carries the 24px block padding:

  | inset on | `scrollHeight` | `clientHeight` | reported spill |
  |---|---|---|---|
  | the body | 248 | 200 | 48 |
  | the stage | 224 | 200 | 24 |

  The 24 that stopped being counted was the body's own **blank** padding, not
  content — the phantom `overflow-probe.js`'s own comments complain about
  ("steadily reports ~43 hidden px on a page that plainly fits … fed
  `resplitDoc`, cutting a fitting slide into half-empty pages"). Real content is
  clipped at exactly the same point before and after (`C > clientH − padTop` both
  ways); what changed is that the probe used to fire one `padding-bottom` EARLY,
  on slides where nothing was actually cut, and now fires exactly on the loss. So
  this removes false positives rather than hiding true ones — but it does mean a
  chart in that narrow band no longer autosplits, and **#680 must budget for the
  threshold moving again, in the strict direction, when it zeroes that
  `--chart-inset-*`.** `chart-overflow-preserved.test.js` is 7/7 green.

### 7.1 The corpus sweep, and the two components it condemned

`npm run overflow:check` renders all 268 committed decks and ratchets clipped
pages against `test/integration/overflow-baseline.json`. It is the instrument
that settled the block axis, and it found what no box measurement could: the
first cut, with the block padding moved to the stage, made **nine decks clip
pages that had never clipped** — journey (5 pages), matrix-grid (5), the chart
bucket gallery, `gallery-jargon` p57, the CI baseline deck p89,
`data-viz-gallery` p4/p7, `chart-family-coverage` p3,
`bloom-engineering-journey` p11 and `impact-annual-report` p5.

The first of them was found by **looking at a raster**, not by a gate: a gantt
page came back from the golden re-render stamped "Content clipped". That is the
QUALITY BAR's rebuild-and-actually-look-at-it earning its keep — every automated
gate in the repo was green on that page.

Scoping to the inline axis took nine decks to four. The remaining four were one
component each, both latent for as long as they had existed and both tipped into
failure by the inline reclaim — HARD RULE #18's "a pre-existing fragility your
change merely tipped into failure" case, which is fixed, not filed:

- **gantt** — `.gantt-svg` has carried `max-height: 100%` all along and it never
  once bound: a percentage max-height resolves to `none` against an auto-height
  parent, and `.gantt-chart` had no height. The SVG's only real constraint was
  its width, so widening the body 896 → 1024 took the stress slide's drawing
  306 → 350px against a 315px stage. `.gantt-chart` now takes `height: 100%` (of
  `.chart-body`, which fills the stage by flex, so it is definite); the existing
  `max-height` binds and the drawing letterboxes. All five gallery slides
  measured: svg height ≤ stage height, the four that already fitted unchanged.
- **matrix-grid** — `.matrix-grid-figure` is `width: 100%`, and its
  `[data-row-axis]` arm adds a `padding-left` for the rotated label gutter. Under
  content-box sizing that made the figure `100% + --sp-lg`, **32px wider than its
  container by construction**, on every grid with a row axis. The body's inline
  padding was 64px of clip slack around it; reclaiming that left the figure
  spilling 16px past the clip on each side, taking the table's outer columns with
  it. `box-sizing: border-box` makes the gutter part of the figure instead of an
  addition to it.

Both are the same shape, and worth naming: **a box that is bigger than its
container, hidden by slack.** Reclaiming an inset is how you find them, which is
an argument for doing it rather than against.

Final sweep: **7 clipped slides across 4 decks, none above the committed baseline
of 7** — zero newly-clipping pages.

## 8. How the rule is kept

Two gates, paired deliberately, because each is blind to the other's failures.

- **`checkStageInsetOwnership`** (`tools/check-ownership.js`, via `build:check`).
  Browser-free, budget 0 + `SANCTIONED_STAGE_INSETS`, failing both ways like
  `SANCTIONED_MARGINS`. Two checks, because the defect has two natural spellings:
  **(a)** repo-wide, a container-unit SUBTRACTION on a sizing property, in
  `calc()`/`min()`/`max()`/`clamp()` alike; **(b)** `padding` on a rule whose
  SUBJECT is a body element (`.chart-body`, `.mermaid-svg`, `.mermaid`), which is
  the easiest wrong move of all and which (a) structurally cannot see. (b) exits
  on a selector naming `.canvas` (the panel paints, so it earns an inset) or
  `figure` (the projection has no stage). Both exits come from the rule's second
  clause rather than being bolted on.

  Its **known holes are stated in the gate, not implied**: (a) cannot see a
  pre-evaluated fraction (`width: 90cqi` is the same defect with the arithmetic
  already done — and the comment this change deleted literally taught that
  spelling), a hard-coded subtrahend (`calc(100cqi - 128px)`, excluded so a
  hairline correction does not fire), or an absolutely-positioned
  `left`/`right`/`inset` inset, which is a different mechanism entirely; and (b)
  only knows the three body classes it names. The render assertion covers the
  first two and nothing covers the third — an `inset`-based re-derivation would
  need its own check if one ever appears.

  Verified against 16 spellings, including the two false positives the trio found
  in the first cut: `calc(100cqi * var(--canvas-scale))` and
  `calc(100cqh * var(--zoom-factor, 1))` used to fail the gate, because a token
  NAME contains hyphens and the operator test could not tell one from a
  subtraction. `var(--…)` references are blanked before the test now.
- **The inset assertion in `tools/check-chart-fit.js`.** A real render at
  landscape / portrait / square asserting the body's border box coincides with
  the stage's content box on the inline axis, and that the body carries no
  padding of its own unless it PAINTS ITS OWN SURFACE — tested by measurement
  (a non-transparent background, a background image, or a real border), not by a
  class list that would need syncing with every future painted body.

  The block axis is deliberately unasserted: a pinned list body (`flex: 0 0
  auto`) is centered at its natural height and legitimately does not fill the
  cell, and an overstuffed one MUST spill it so `overflow-probe.js` can see it.

  Not vacuous, verified: run against the pre-change tree it reports all 18 chart
  slides and all 26 diagram slides; against the shipped tree, none. And not dead
  code in the shipped gate either — `test/fixtures/chart-fit.md` gained a diagram
  slide (with a `<blockquote>` sibling, the case that made diagram's second inset
  visible), so the `.mermaid-svg` arm of the body selector is exercised by
  `npm run check:chart-fit` rather than only by hand-pointing the tool at
  `diagram.gallery.md`. Still uncovered by the fixture: `matrix-grid`, one of the
  five `flex: 0 0 auto` pinned charts — a pre-existing coverage gap, noted in
  #1600 rather than closed here.

## 9. Relation to #680

#680 is the *outcome* card — quadrant point labels sit below the house's smallest
type tier. This was the *structural precondition*. Its "lever 2 — reclaim height"
is the same 64px, but #680 framed it as a raw padding deletion needing its own
costing and undercounted the inline side by half.

The measured arms (each patched into the live rendered page and re-measured, so
every arm is the same DOM):

| arm | quadrant svg | % of stage | painted label |
|---|---|---|---|
| baseline | 896×323 | 64.9% | 11.0px |
| **block padding → 0** | 896×387 | **77.7%** | **14.0px** |
| drop the width calc | 1024×323 | 74.1% | 11.0px |
| inline padding → 0 | 1024×323 | 74.1% | 11.0px |
| all three | 1152×387 | 99.9% | 14.0px |

The unit is **height-bound**, so every inline change buys a wider box and no
larger label. Only the block inset moves the label — **+27%**. This change took
the inline duplicate (which is a correctness fix, not a design change) and left
the block inset alone (which is a design decision about a chart's berth). After
it, #680's reclaim is **one number in one place** — the `--sp-lg` in
`section.chart-frame > .cell-stage` — instead of three insets in three boxes.

Neither card closes the other. #680 stays open.
