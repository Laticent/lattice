---
status: shipped
summary: States "the stage owns the outer inset; a body owns only the spacing between its own elements, a CLIP MARGIN, and whatever padding a box that paints its own surface needs" as a named Forms invariant (design/forms.md §6.1), and brings the two buckets that broke it — chart and diagram — into line with the four that already kept it. Both re-derived the frame inset with the same `calc(100cqi - 2 * var(--sp-2xl))` expression and the chart stacked its own padding on top, so a chart's figure paid 192px per side against prose's 64 and a diagram paid 128; #680 costed that debt at half the real number because the calc reads as sizing. Both calc copies retire and the bodies fill their container. THE CHANGE IS INLINE-ONLY, and that is the finding: a body's BLOCK padding is a clip margin, not an inset — `overflow` cuts at the padding box, so it is the slack a chart paints into, and removing it made NINE decks clip pages that had never clipped (`overflow:check`). `overflow-clip-margin` is the property that should carry it and cannot yet (Chromium 131 takes only a plain length, and every spacing token here is a calc), so it stays as `padding-block`, renamed. The inset is a TOKEN on the section rather than padding on a box, because a chart has TWO holders (`.cell-stage` under the Form, the section on `no-form`) and a tuning spelled per-holder is a pairing invariant nothing enforces — the first cut proved it by silently dropping state-chart's and timeline-list's. The `section.chart-frame` padding block is SCOPED to `:not(.form)` rather than deleted (it is live there; the card's "dead rule" reading was measured only under the Form). The adversarial trio found four override paths that had to re-win their tie on the token (`no-form`, `canvas`, `claim-hero`/`claim-bleed`, tall/strip `state-chart`), each re-measured byte-identical against a worktree at the base commit; the inline reclaim then exposed two boxes that were bigger than their container by construction — gantt's SVG (a `max-height: 100%` that never bound) and matrix-grid's figure (`width: 100%` plus a `padding-left` under content-box sizing) — both fixed here rather than filed. Kept by two paired gates: `checkStageInsetOwnership` (browser-free, in build:check, verified against a 24-spelling matrix) and a measured inset assertion in check-chart-fit.js at three sizes. §8.1 then went further on the owner's challenge: the SURVIVING inset was not a design choice either — no comment, no record, and two measurements against it (a height-bound SVG chart letterboxes so the inset was dead space; a width-bound one, gantt/map/word-cloud, was LOSING drawing size to it) plus the same masthead-alignment defect the diagram had. `--chart-inset-x` goes to 0 and a chart sits at the frame inset like prose, code and diagrams. The trio run against that follow-up found four more: `claim-bleed` on a card- or table-bodied chart ran to the trim edge (the old 64px had been silently FLOORING a bleed nothing ever tested), the first fix for it re-created the misalignment at `claim-hero` by flooring a value that was already the floor, deleting timeline-list's inline token silently retuned the `canvas` panel 3× tighter because both read one token, and insetting only the journey markers left a face 31.6px off the gridline it names. All four fixed here; the panel token is now gated by measurement and the fixture gained `claim-bleed`, `canvas` and `timeline-list canvas` slides, which had zero coverage anywhere in the repo. Logged not fixed: matrix-grid's table exceeds its box at portrait on `main` too (#1620).
---

# The stage owns the outer inset

**Date:** 2026-08-11
**Area:** forms / charts / diagrams / gates
**Issue:** #1598 (the structural precondition for #680, which stays open)
**Shipped in two passes:** the de-duplication (§1–8), then §8.1 — the correction
the owner's challenge forced, taking charts to the frame inset like everything else.
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

## 8.1 Follow-up: the chart's remaining inset was not a design choice either

Shipped the same day, on the owner's challenge — *"you said diagram has two
layers and chart has 3; explain why it needs 3."* It does not, and §6's claim that
the survivor was "a deliberate margin somebody had chosen" was an assumption I had
not checked.

**How it was checked, precisely** — because "going back through the history"
would overstate it. This repo is 62 commits deep and `chart-family.css` shows as
*added* at the oldest commit in the tree, so there is no archaeology to do. The
evidence is the in-file comments and the decision corpus, read end to end:

- the width calc's own comment justified it as a **sizing** workaround for the
  marp-vscode webview; pushing the chart in 64px was an unrecorded side effect;
- the `padding` line carried **no comment at all**;
- the nearest thing to a defense is the glass panel adopting *"its **existing**
  padding"* — a value already there for a reason nobody wrote down, on a panel
  that is opt-in with zero decks opting in;
- the per-chart notes that argue for it argue for charts matching **each other**
  (the panel's uniform size), never for charts wanting more room than prose.

Two places *did* consider this inset and leave it alone — the checker found both,
and calling the panel "the only defense" was wrong. Neither is a positive
justification, but both are deliberate: the same file's tall/strip header called
the wide inset *"right for a wide slide"* while pulling it in at portrait, and
`2026-06-19-chart-adaptive-sizing.md` §8 analysed this exact `--sp-2xl` in both
the calc and the padding and chose a fix that was *"box-local, not systemic
(chosen after rendering both)"*, explicitly leaving landscape untouched. So the
inset had been *looked at twice and kept at landscape* — on the strength of how it
looked, never against the masthead rule it fails to align with.

**Two measurements retired it, and they cut in opposite directions — which is the
point.** Sort the fourteen charts by what binds their drawing:

- **Height-bound SVG** (quadrant, funnel, piechart, radar): the figure letterboxes
  to its box, so a wider box is the same ink in a wider frame — a quadrant renders
  **byte-identical** at 64 and at 128 (md5-equal screenshots). The inset was pure
  dead space.
- **Width-bound SVG** (gantt, map, word-cloud): the drawing itself grows. Measured
  at hd, gantt's SVG goes 1024×238.9 → 1152×268.8 and **10.3% of the slide's
  pixels change**; map 9.0%, word-cloud 5.1%. The inset was not dead space here —
  it was *costing drawing size*.
- **HTML-bodied** (the remaining five, plus `radar small-multiples`, whose grid
  re-flows): the content genuinely widens, and it now shares an edge with the
  masthead rule.

Either the inset bought nothing or it cost something; no chart was better off with
it. **Do not compress this into "SVG charts don't care"** — an earlier draft of
this section did, and both the checker and §7 of this very document contradict it.
(§7 already recorded gantt's drawing growing 209.1 → 238.9 tall. The generalization
was written anyway.) The two arguments also apply to *disjoint* sets: "bought
nothing" is the height-bound four, and the alignment argument below is everyone
else — a quadrant's ink is byte-identical, so it gains no alignment either. Each
measurement settles its own half; neither settles both.

**(2)** It was an **alignment defect**: the masthead's hairline spans the full
frame, so a chart at 128 read visibly narrower than the rule directly above it —
precisely the misalignment §6 had just fixed on the diagram, left in place on the
chart.

One more thing grew that no one asked to grow: the opt-in **`canvas`** panel is
painted on `.chart-body`, so it follows the frame (landscape 1024→1152, portrait
864→972). Its own internal berth is unchanged and now has its own token.

`--chart-inset-x: 0px`, and **three per-chart overrides deleted rather than
added**: the family's tall/strip value pulled IN from the `--sp-2xl` landscape
default and against a 0 default would only push back out, inverting its purpose;
state-chart's inline restatement existed solely to hold a specificity tie whose
both sides are now 0; timeline-list-tall's did the opposite of what its neighbours
did — `--sp-xl` against the family's tall/strip `--sp-sm`, three times the berth,
pushing OUT — which is exactly the extra room this change retires.

**But one of those three had a second consumer, and deleting it moved something
else.** Before this change the `canvas` glass panel's *internal* inset also read
`--chart-inset-x`, so timeline-list-tall's `--sp-xl` was the panel's berth here
too: a `timeline-list canvas` at portrait went 78.975 → 26.325px, 3× tighter,
while all thirteen other charts' panels stayed put. The red team and the checker
found it independently, which is the sharpest thing either said about this diff:
the whole reason `--chart-panel-x` was split out of `--chart-inset-x` is that one
token must not silently move the other, and the split's very first outing missed
the one per-chart override feeding both. The panel half is restated on
`--chart-panel-x` — frame inset gone, berth kept — and `check-chart-fit` now
asserts that a painted body's inline padding IS that token, with a
`timeline-list canvas` fixture slide behind it (the `quadrant canvas` slide cannot
see this: it is a height-bound SVG on the family default).

**One override ADDED, not deleted, and it is the part to look at hardest.**
`claim-bleed` takes `--frame-x` to 0 and names `.chart-frame` wholesale; the old
64px inset silently floored that to 64, so no chart ever actually bled. Taking the
token to 0 removed the floor and a `kanban claim-bleed` put its first card at
x=0 — corner and shadow sliced at the trim edge; a `journey claim-bleed` sliced
its end task cards and put an actor badge 4px from the paper. The floor is now
explicit, `--frame-inset-x`, on the six card- or table-bodied charts (progress,
kanban, timeline-list, roadmap, matrix-grid, journey) — stage.css's own answer for
a non-media bleed. `state-chart` is deliberately out: it self-scales and centers,
so it is genuinely safe at the trim.

**The CSS floor is the second half of the fix, not the whole of it — the first
half already existed and had never been wired up.** The house answer to "this
layout must not bleed" is authoring-level: a prose-dense component declares
`"excludes": ["claim-bleed"]` in its manifest and `lint-core`'s
`claim-bleed-unsafe` warns the author off to `claim-hero` (2026-07-03 claim
decision §8, and `base.docs.md` states it plainly — *"`claim-bleed` is a
semi-universal opt-out (prose-dense layouts exclude it)"*). **matrix-grid was the
only chart that had declared it.** progress, kanban, timeline-list, roadmap and
journey now do too, and that is why the linter was silent when the inversion pass
found the regression by rendering: there was nothing for it to read. Verified
non-vacuous — the fixture's `kanban claim-bleed` slide now warns.

Both halves are needed and neither substitutes for the other. `claim-bleed-unsafe`
is a **warning**, so the deck still renders; before this change it rendered
sliced. The manifest tells an author not to; the floor makes it safe when they do
anyway.

**`claim-bleed` only — NOT `claim-hero`, and the first cut of this fix got that
wrong.** At hero `--frame-x` is already `--frame-inset-x`, so a floor there does
not floor, it stacks: the red team measured those charts at x=60 under a masthead
hairline at x=30 — *the exact misalignment this whole change exists to remove*,
re-created inside the fix for a different one, twenty minutes after it was
written. Two of the three trio lenses caught it independently. The lesson is
narrow and worth keeping: **a floor is only a floor against zero.** Applied to a
value that is already the floor, it is a second inset.

**And the same mistake once more, one layer down — `.form` only.** The red team
named `claim-bleed × no-form` as an intersection it had not stressed; measuring it
found the floor stacking there too. Every `--frame-x` retune in stage.css is
scoped `section.form`, so a `no-form` slide never bleeds whatever claim it
carries — and an unscoped floor there adds 30px on top of the hand-copied frame
inset instead of flooring anything (a `kanban no-form claim-bleed` at 94 against a
plain `no-form`'s 64). Scoped, and both paths re-measured: the Form path floors at
30, `no-form` is back to 64 and identical to a plain `no-form`. Three instances of
one error in one afternoon is a pattern, so state it as a rule: **before scoping a
floor, check that the zero it floors is reachable on the path you scoped to.**

### 8.1.1 The modifier cross, swept

Three instances of one mistake, the last found only because an agent's closing
paragraph happened to name the intersection, is evidence the search was not
systematic. So it was made systematic: **8 modifier arms × 14 charts × 3 deck
sizes = 336 measured cases** (`.scratch/cross/`), each asserting the three things
this change is actually about.

| invariant | violations |
|---|---|
| body border box == holder content box, inline axis | **0 / 336** |
| nothing paints outside the slide box | **0 / 336** |
| a card- or table-bodied chart never reaches the trim edge | **0 / 336** |

Arms: plain, `no-form`, `canvas`, `claim-quiet`, `claim-hero`, `claim-bleed`,
`compact`, `align-top`. Holders: 294 stage, 42 section — so the `no-form` path is
measured at every chart and every size, not spot-checked.

**One deliberate misalignment survives, and it is the floor's price.** Of 294
masthead comparisons, 18 differ: the six prose-dense charts under `claim-bleed`,
at all three sizes, where the masthead bleeds to 0 and the body floors at 30
(25.3 at portrait/square). A hairline runs edge to edge above cards that do not.
That is the very defect §8.1 exists to remove, accepted here because the
alternative is slicing a card at the trim — and because the *primary* answer is
the manifest opt-out, which tells the author not to write this slide. **Alignment
loses to not-cropping-content; everywhere the two do not conflict, alignment
wins.** No other arm misaligns anywhere.

### 8.1.2 The browser surface, driven for real

Everything above is the **PDF export** surface. HARD RULE #23 says a verification
claim names its surface, and the second surface this change ships to — the
docs-site Playground, where slide HTML renders into a live `srcdoc` iframe — had
been driven by nobody: not by me, not by any of the three trio agents. Left as
UNVERIFIED, that was a real hole, because the Playground loads the same engine
bundle through an entirely different path (no print box, no page box, a scaled
container).

So it was driven. `cd docs && npm run dev`, then a real browser that **clicks the
Playground's own component picker** and selects each chart in turn — not a
synthetic harness, not a hand-built document. Measured inside the live preview
iframe, normalizing out the preview's own scale (1.045):

| | |
|---|---|
| components driven through the real picker | **14 / 14** |
| chart slides measured in the live preview | **105** |
| inset violations (body vs holder content box) | **0** |
| chart body misaligned with its own masthead | **0** |

Body and masthead both land at **64** — the alignment this whole change is about,
now confirmed on the surface a human actually looks at rather than inferred from
the export. Artifact: `/tmp/pg-kanban.png`, the Playground with the kanban gallery
loaded, picker reading `kanban`, 10 slides rendered.

**Still genuinely unverified, and named rather than glossed:** the marp-vscode
webview. It cannot be driven from this sandbox — the retired width calc's comment
claimed that surface as its reason, and that claim remains untested in either
direction (see §6).

Found by the trio's inversion pass. Nothing caught it mechanically: the
`claim-bleed-unsafe` linter reads a manifest `excludes` list only matrix-grid
declares, and no committed deck combines a chart with `claim-bleed`, so there was
no golden to drift and no overflow-corpus page to clip. **That is the structural
lesson of this follow-up, and it is not a small one**: a default that is *silently
floored* by a value you are removing has no test standing between it and a
regression.

The follow-up is a smaller *diff* than the change it corrects and a **larger blast
radius** — it moves every chart on every deck, where the parent change moved a
duplicate nobody could see.

**And a third box bigger than its container.** `check:chart-fit` caught a journey
mood-5 face 5.3px past the portrait stage. Not tight spacing — the portrait
variant plots its marker at `left: ((mood − 1) / 4) × 100%`, so a mood-5 face was
centered ON the track's right edge with half of it outside, **always, at every
deck size**; the old padding was merely wider than the overhang. The 1..5 scale
now maps across `100% − 6.5cqi` offset by half a face — **and the gridlines are
inset by the same half-face**, so gridline N still sits exactly under a mood-N
face. That second half came from the red team: insetting only the markers left a
face up to 31.6px off the line it names, on the one chart whose entire contract is
that position IS the value. A readout that lies is worse than a readout that
overhangs.

That is journey, after gantt and matrix-grid, and the `claim-bleed` floor above
is a fourth of the same shape: **an inset is slack, and slack hides boxes that
were never inside their container.** Removing one doesn't create those defects —
it stops paying for them. Be precise about the shape, though, because the checker
was right to push on it: matrix-grid and journey were *always* oversize by
construction, while **gantt's drawing genuinely was inside its box until the box
widened** — its defect was a `max-height: 100%` that never bound. Two of the three
were pre-existing overflows; the third was a latent constraint that had never been
tested. The corollary is the same either way, and it is the uncomfortable half:
they surface as *your* regression, on *your* PR, and HARD RULE #18 says they are
yours to fix. All four were.

`check:chart-fit` 5 → 4 → **3** across this line of work; `overflow:check` clean
across 268 decks. **The attribution needs care** — journey appears in *none* of
those three counts. `main`'s four are progress×2, timeline-list-portrait and
roadmap-square; the reclaim fixes roadmap-square, and the marker fix cancels a
clip the reclaim would otherwise have *introduced*. Net zero on the gate, which is
the more interesting fact: the gate's number moved by one while two things
changed under it.

Logged, not fixed — off this change's path, per HARD RULE #18's find-vs-cause
split:

- journey's portrait rows overlap each other — identical on `main`, different
  mechanism (#1600);
- **matrix-grid's table exceeds its box at portrait (#1620).** `table-layout: auto` plus
  `width: 100%` means the table cannot go below its min-content width, so a
  realistic gallery-sized matrix overflows the slide at portrait — measured on
  `origin/main`, on **both** the Form and `no-form` paths, with the same content.
  It is pre-existing and matrix-grid has no adaptive arm to tune; a real fix is
  explicit column tracks, which is a component redesign, not this diff. **What
  this change does do is move the threshold**: `no-form` at portrait went from a
  26.325px margin to the frame's 54px (see below), so content sitting between the
  two now clips where it did not. That is the "latent fragility your change tipped
  into failure" case, and it is recorded here rather than hidden — the honest note
  is that the piece that moved the threshold is the piece that gave `no-form` a
  safe margin at all, so reverting it is worse than the defect.

**And the `no-form` inset moved at two sizes, which the first draft did not say.**
The record cited hd only, where the body lands exactly where it always did (1152 @
x=64). At the others it is a retune, not a restoration:

| `no-form` body | `origin/main` | here |
|---|---|---|
| portrait | 26.31 .. 1053.69 | **54 .. 1026** |
| square | 89.09 .. 990.91 | **54 .. 1026** |

Both are improvements — a portrait `no-form` chart previously sat 26px from the
edge of a 1080px slide, which is no safe margin at all — but "restored" was the
wrong word for it. One related edge, pre-existing and not caused here: the
hand-copied `5 × --_sec-1cqi` is `--frame-x`'s *default*, and every modifier that
retunes `--frame-x` (`claim-quiet`, `claim-hero`, `claim-bleed`) is scoped
`section.form`, so a `no-form claim-hero` chart sits at 64 where its absent frame
would want 30.

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
