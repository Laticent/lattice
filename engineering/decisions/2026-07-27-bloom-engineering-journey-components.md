---
status: shipped
summary: >
  Mapped a standalone deck ("From Remembering to Creating" — Bloom's Taxonomy applied to the
  software engineering career arc) against the component catalog to identify which of its nine
  layouts were direct matches, which warranted a new modifier, and which warranted a new
  component — then shipped the gap-fillers (split-panel's `proof` modifier, the
  chart/matrix-grid component) and the deck itself as a Playground showcase gallery. The
  initial pass reused generic components for premise/hook/axis/practice/title-close and gave
  the matrix its own hand-rolled palette; the author asked for every bloom slide to become its
  own FAITHFUL dedicated component (not generic reuse) and for the matrix to be a genuine
  chart-family member on the theme's chart palette. Shipped: the matrix conversion, a new
  sovereign `statement/premise` component, `quote`'s new `bare` variant (hook),
  `compare-prose`'s new `axis` variant (axis-explainer), `list-steps`'s new `capsule` and `cat`
  variants (practice), `split-panel`'s new `cat-1`…`cat-8` and `capstone` variants (the six
  level slides), and title/close's new `spectrum` variant. Two full page-by-page comparisons
  against the source — the recovered PDF, then the author's original ZIP bundle (markdown +
  CSS + PDF) — caught a title/close spectrum-bar gap, a matrix-grid column-axis mispositioning
  and arrow-direction bug, and five remaining deltas (level panel color, level 6's distinct
  capstone treatment, practice's masthead/centering/color, close's eyebrow, an axis numeral
  color bug) that an earlier pass had waved off as "minor" without confirming with the author.
  All are now fixed, verified against the source ZIP's actual CSS as ground truth rather than
  visual guesswork. See "What's still open" below.
---

# Bloom engineering journey — component mapping into Lattice

**Status:** in progress. **Context:** a standalone deck ("From Remembering to
Creating" — Bloom's Taxonomy applied to the software engineering career arc)
was recovered from a rasterized PDF and proposed as inspiration for new
Lattice components, then as a Playground showcase gallery.

## The mapping (original pass)

Nine distinct bloom layouts, mapped against the component catalog:

| Bloom layout | Lattice component | New work? |
|---|---|---|
| Title (light, radial glow) | `anchor/title` (dark) | No — bent to Lattice's dark-bookend convention rather than adding a light variant |
| Hook (pull-quote + caption) | `statement/quote` | No |
| Premise (intro + 6 colored verb rows) | `statement/split-panel` (default) | No |
| Level ×6 (claim panel + scenario + 2 proof cards) | `statement/split-panel` **`proof` modifier** | **Yes** |
| Axis explainer (I → II, arrow) | `comparison/compare-prose` | No |
| Verb × reach grid (3-state cells) | `chart/matrix-grid` | **Yes — new component** |
| Practice (3 step cards) | `progression/list-steps` | No |
| Close (light, radial glow) | `anchor/closing` (dark) | No |

Six of nine layouts had a direct or near-direct home already. The remaining
three (title/close, level, matrix) were real forks, resolved with the user
before implementation:

1. **Title/close stay dark.** Anchor's `bookend` form is explicitly dark
   ("the dark canvas anchors the deck visually," shared by title/divider/
   closing) — not a styling default but the form's definition. Rather than
   add a light-canvas exception for one deck, the gallery uses Lattice's
   existing dark anchors.
2. **Level slides → `split-panel proof`,** not a new standalone component.
   Split-panel's own docs already frame its function as "one prominent
   claim beside the points that substantiate it" — proof's job is the same,
   just with a fixed scenario-card + two-proof-card right zone instead of a
   flexible points list. Matches the `kpi` precedent (one base component,
   named layout modifiers).
3. **The matrix → a new component,** not an extension of `obligation-matrix`.
   Lattice already had the state-marker cell *mechanism* (`obligation-matrix`,
   `roadmap`, `verdict-grid` all share it), but obligation-matrix's bucket and
   voice are legal-domain-specific, and none of the three generalize to an
   NxM grid where BOTH axes are ordered categories and every row carries its
   own hue (not a pass/fail palette).

## Course correction — the author's review

After the first pass shipped, the author reviewed the rendered gallery and
asked for two changes (both confirmed via `AskUserQuestion`):

1. **The matrix is a chart-family member, not a comparison-bucket table with
   its own palette.** It must dispatch through
   `lib/components/chart/_chart-family/chart-family.js` and draw row color
   from the theme's chart categorical palette (`--chart-cat-N-hue`), the same
   tokens radar/piechart/quadrant use — never a hand-rolled or universal
   `--cat-N-mark` palette.
2. **Every bloom slide becomes its own FAITHFUL dedicated component or
   variant** — matching the original deck's centering, spacing, and aesthetic
   — not generic reuse of whichever existing component happened to render
   close enough. This expands scope beyond the original two new pieces
   (`proof`, the matrix) to premise, hook, the axis-explainer, practice, and
   title/close.

On the matrix's target architecture, the author's confirmed answer was "full
chart-family SVG rebuild" — but a literal SVG geometry rebuild doesn't fit
matrix-grid's discrete grid-cell data (a table of positional states, not a
continuous plot). The correct engineering interpretation of "chart family
member" is the `roadmap` precedent: `bucket: "chart"`, dispatched through
`chart-family.js`'s `SECTION_BUILDERS`, styled from the chart palette — a
table-based HTML transform, not SVG. `roadmap` itself proves chart-family
membership doesn't require SVG (it's `substance: "structure"`, a table).
matrix-grid follows that precedent exactly.

## What shipped

- `lib/components/statement/split-panel/` — `proof` modifier (CSS only; no
  `lib/core/split-panels.js` changes needed for the DOM shape — though a real
  shared-kernel bug surfaced during maker-checker review: `extractFirstP`
  didn't bound its search before the next heading, so an omitted lede let the
  extractor mistake `proof`'s signal paragraph for the lede. Fixed in
  `lib/core/split-panels.js`).
- `lib/components/chart/matrix-grid/` — a genuine chart-family component
  (moved from `comparison/`): manifest (`bucket: "chart"`, `adapt.mode:
  "reflow"` — every chart-bucket member inherits chart-family.css's
  box-local `@container … aspect-ratio` rule, so `"native"` isn't legal
  here), a dedicated markdown-it plugin (`matrixGridCells`, alongside
  `obligationMatrixBadges`/`verdictGridBadges` in
  `lib/integrations/markdown-it/plugins.js`, registered once in
  `lib/engine/index.js`'s `LATTICE_PLUGINS`), and `buildMatrixGridSection` in
  `chart-family.js` — the dispatch that splits the two-part eyebrow (column
  axis · row axis), wraps the table in `.matrix-grid-figure`, and wraps the
  swatch-legend caption in one `<span>` so the shared `.chart-caption`
  flex-column layout doesn't tear it into separate lines per element/text-run.
  Row border/stroke color comes from `--chart-cat-N-hue`; filled-cell
  background/ink follows the `quadrant`-label precedent for the identical
  problem — `--chart-cat-N-fill` (a pre-blended tint) + `color-mix(chart-cat-
  N-ink 65%, text-heading)` — since the raw `-hue` has no text-contrast
  guarantee at all (see the maker-checker findings below). The row-axis label
  renders via `writing-mode: vertical-rl` (not a `transform: rotate()` around
  a shrink-to-fit box — that pivot drifts wider than its gutter as the label
  text lengthens, overlapping the row-label column).
- `examples/bloom-engineering-journey.md` — the 13-slide gallery deck,
  registered as a Playground showcase (`docs/src/playground/galleries.mjs`).

### Bugs found and fixed during the chart-family conversion

Visual verification (rasterizing the actual gallery + deck PDFs, not just
reading the HTML) caught three real defects before they shipped:
- The swatch-legend caption tore into four stacked lines (the shared
  `.chart-caption` flex-column rule gives every child element and every
  inter-element text run its own flex item) — fixed by wrapping the legend
  in one span in `buildMatrixGridSection`.
- The rotated row-axis label overlapped the row-label column once the label
  text got long — the `transform: rotate()` approach's pivot point scales
  with text width; switched to `writing-mode: vertical-rl` sized to the
  reserved gutter.
- The matrix-grid slide clipped ~23px in the actual deck context (not in the
  standalone component gallery, where the masthead happened to leave more
  room) — trimmed the table's row spacing and cell padding to restore
  headroom.

### Maker-checker findings (independent review of the chart-family conversion)

An independent checker agent reviewed the conversion diff before it merged
and confirmed eight real defects beyond the three found by visual
verification, all fixed:
- A WCAG AA regression: pairing `--cat-on-mark` (gated only for the
  universal `--cat-N-mark` tier) with a raw `--chart-cat-N-hue` background
  measured as low as 3.30:1 on `laguna` dark, 3.57:1 on `onyx` light — fixed
  by the `--chart-cat-N-fill` + 65%-mix-ink pattern described above.
- `String.replace`'s special `$&`/`` $` ``/`$'`/`$$` replacement patterns
  could splice unrelated HTML into the table or caption from a literal `$`
  sequence in authored content — two of three `.replace()` calls in
  `buildMatrixGridSection` took a plain string, not a function, as the
  replacement.
- The eyebrow-split regex was unanchored, so a code-only subtitle or legend
  elsewhere in the slide (not just the true eyebrow) could be shredded.
- The row axis was double-escaped (once by markdown-it, once by `escAttr`),
  turning `&` into `&amp;amp;` in the rendered label.
- Outlined/empty cells carried zero accessible text (a code comment's claim
  that prose-projection covered this was false) — a visually-hidden
  `.cell-sr-label` now names the state.
- The rotated-label gutter was reserved even with no row axis authored.
- Two doc claims were already stale by the time they were written: the
  CHANGELOG called the `proof` modifier "CSS-only" (it also fixed a real
  `split-panels.js` bug), and `gotchas.md` called matrix-grid's transforms
  "engine-only" (`buildMatrixGridSection` is shared/mirrored; only
  `matrixGridCells` itself has no `lattice-runtime.js` mirror).
- Zero direct unit tests exercised `buildMatrixGridSection`/`matrixGridCells`
  — the gap that let the injection/anchoring/escaping bugs ship unnoticed;
  regression-lock tests now cover all three.

## Premise — the second faithful component

Built as a new sovereign component (`statement/premise`, a new
`lib/forms/frame/premise` Frame) rather than a `split-panel` variant: the
source deck's premise slide has NO colored panel divide (both zones share
the page background), and its rows are a genuinely different authoring
shape — one line with four inline segments (index, term, description,
right-aligned note) — not the nested title+body pattern any existing
card-style layout uses. Getting it right took two real fixes found by
rendering the actual PDF, not just reading the HTML:
- The base `section` rule's `flex-direction: column` was never overridden,
  so the claim and the ledger stacked vertically instead of sitting side by
  side — the bug was invisible in the HTML/CSS source, only visible once
  rendered.
- A long term name (`Advanced beginner` in the 8-row stress test) overflowed
  its fixed grid column and visually collided with the description text —
  fixed with `overflow:hidden; text-overflow:ellipsis` on the term.

Row color comes from the UNIVERSAL categorical palette (`--cat-N-mark`) —
correctly a *different* token system than matrix-grid's `--chart-cat-N-hue`,
since this is a structure-substance HTML list, not a chart-family member
(design/theming.md's two-system split). Precedent for `--cat-N-mark` as
text-on-neutral-background (not just a border/stroke) already existed in
`math.theorem`'s blockquote styling.

## Hook — the third faithful component

Built as a new `quote` variant (`bare`), not a new component: the source
deck's hook slide is structurally identical to `quote`'s existing DOM
contract (`blockquote > p` + a trailing attribution paragraph) — only the
CHROME differs (no card/border/shadow/quotation-mark glyphs, larger
display-scale type, an uppercase tracked caption instead of an em-dash
attribution line). A pure-CSS variant is the faithful AND the cheap-path
answer here: reusing `quote`'s DOM shape isn't "bolting onto" it in the
sense the author warned against, because the shape genuinely already
matched — no transform was bent to fit, none was needed. One real fix found
rendering the actual PDF: the attribution's `*italic*` markdown produces an
`<em>`, which kept its default italic styling under the new uppercase
treatment (the source deck's caption is upright) — fixed with
`font-style: normal` on that specific `em`.

## Axis-explainer — the fourth faithful component

Built as a new `compare-prose` variant (`axis`), not a new component: the
source deck's axis-explainer is structurally a two-card comparison with an
arrow connector — exactly `compare-prose`'s existing DOM shape (`ul > li`,
CSS-generated `❯`/arrow connector via `::before`, `order:1/2/3` bracketing).
What differs from the base layout is content, not structure: a lede
paragraph before the cards, a closing note after them, and each card's
interior reading as three positional lines (a facet numeral, a bold title, a
description) instead of one free-prose bullet. All three came free or
near-free from mechanisms that already existed for other reasons:

- **The lede** is a plain `<p>` immediately after the `h2` — since
  `compare-prose` is a `stage: "flow"` component, the heading is extracted
  into the masthead cell separately, so an author-written paragraph right
  after it simply becomes the stage's own first child. No slot, no
  transform — one CSS rule (`.axis > .cell-stage > p:first-child`) styles
  it.
- **The closing note** reuses the universal trailing-italic-paragraph
  "annotation" pattern (`base.modifiers.css`) that already fires for any
  `compare-prose` whose trailing paragraph is entirely `*italic*` — the
  shared `lib/core/below-note.js` kernel wraps it in `.below-note`, and the
  existing cross-component annotation rule gives it the ✦-glyph, muted
  italic, quiet-footnote treatment with zero new CSS. (The one visual
  departure from the source deck: bloom's footer is a bare italic line with
  no glyph. The ✦ marker is judged a worthwhile trade — reusing an
  established, WCAG-checked Lattice pattern beats a bespoke override for a
  detail this minor.)
- **The facet cards** keep the DEFAULT card chrome (`.card`'s
  background/border/radius, unchanged) and target the nested sub-list's
  first three items positionally via `nth-child` for the numeral/title/
  description tiers — no new plugin, because markdown-it's ordinary nested-
  list-to-HTML conversion already produces exactly that shape. The one
  authoring change from the base layout: leave each card's own leading bullet
  text blank (`- ` with nothing after it) instead of writing a label — the
  existing `slot-label-lift.js` already no-ops on an empty lead, so the
  base layout's corner-tag treatment (built for the OTHER `compare-prose`
  variants) never fires.

The facet numerals draw from the theme's `--accent` for both sides, not the
source deck's own two-hue level palette (`--l2` / `--l6`) — consistent with
the "pull color from the theme, don't bring your own" rule already applied
to `premise` and `matrix-grid`: this is a two-sided comparison, not a
categorical chart, so a single accent token is the faithful choice, not an
arbitrary two-color scheme with no theme backing.

One real fix found rendering the actual PDF (not visible from the CSS
alone): the base layout's outer-`<li>` grid uses `align-content: start`,
which is right for the OTHER variants' free-prose cards (content can run
long and should pack toward the top) but left a large dead zone under
`axis`'s short, fixed three-line content, since the cards still stretch to
match the tallest sibling's height. Fixed with `align-content: center`
scoped to `.axis`.

## Practice — the fifth faithful component

Built as a new `list-steps` variant (`capsule`), not a new component: the
source deck's practice slide is a three-card step sequence with a badge,
title, and description per card — exactly `list-steps`'s existing DOM and
`counter()`-generated `STEP NN` badge mechanism, already at the right
CONTENT (the source's badges read "Step 01" / "Step 02" / "Step 03",
literally what the default layout already produces from list position).
Only the CHROME differs: bloom centers everything and renders the badge as
a rounded, tinted pill instead of a plain mono caption, with a serif title.
Pure CSS, no transform or markup change.

Colour follows the same rule as `axis`'s facet numerals: one consistent
`--accent-soft`/`--accent` pill across all three steps, not the source
deck's own per-step hue (`--l1`/`--l4`/`--l6`) — a sequence of steps in one
process, not a set of categorical options, so a single repeated token is
the faithful reading, not an arbitrary three-color scheme with no theme
backing.

One real fix found rendering the actual PDF: the default cards stretch to
fill the stage's full available height (the right behavior for the OTHER
list-steps variants, whose body copy can run long) — this left a large
dead zone under `capsule`'s short, fixed-height content once cards
stretched to match. Fixed by sizing the `ol` to its own content
(`flex: 0 1 auto`) and centering it vertically in the stage, the same
pattern the existing `vertical`/`chevron` variants already use for their
own compact layouts.

## Title/close — dark canvas stands; the spectrum bar was a real miss

Reconsidered after the practice slide shipped, since the "every slide
becomes its own faithful component" directive could be read as overriding
the original title/close decision above. Asked the author directly rather
than guessing: **keep the dark anchor.** The `bookend` form (title,
divider, closing) is defined system-wide in `design/design-system.md` §4
as "Dark, centered, no chrome — full-canvas anchor" — not a per-component
styling default but the form's documented definition, shared by every deck
that uses it. A light variant faithful to bloom's radial-glow title/close
would mean amending that core invariant (or forking a parallel component)
for every consumer of the form, not just this showcase deck — a materially
bigger and riskier change than the other four components, each of which
only changed one component's own chrome or added a slot. Out of scope for
"make this deck's slides faithful"; Lattice's existing dark anchor stands.

**A subsequent side-by-side page comparison against the source PDF caught
a real gap this call had glossed over.** The source's title and closing
slides both carry a small centered gradient bar — every color the deck's
six cognitive verbs use, swept into one line — directly under the source
CSS's own `--spectrum` token, reused as the top border on every OTHER
slide too. It's the single visual element that ties the whole deck's
color story together, and calling title/close "faithful" without it was
wrong; it was flagged as a minor decorative footnote in the first delta
report, which undersold something the author is visibly invested in.
Fixed as `anchor/title`'s and `anchor/closing`'s new `spectrum` variant
(see `### Added` in `CHANGELOG.md` for the full mechanism and the two
rejected token choices — `--cat-N-mark` washes out to near-white on a
dark canvas, `--chart-cat-N-hue` is scoped to `.chart-frame` and resolves
to nothing outside it, both confirmed by actually rendering and looking).
The bloom deck's title/close now carry `title silent spectrum` /
`closing silent spectrum`.

## The full page-by-page delta audit — and a second real miss

"Shipped" above was premature. A full side-by-side comparison of every
Lattice-rendered page against its source PDF page (not spot checks, which
is what let the spectrum-bar gap through) found a second real miss, plus
four more deltas the first pass had waved off as "minor" or "intentional"
without actually confirming that with the author. Given the spectrum bar
was waved off the same way and turned out to matter, none of the four get
resolved unilaterally this time — each is being taken back to the author
before it's called settled.

- **Fixed: `matrix-grid`'s column-axis label.** It rendered as a masthead
  eyebrow beside the title — contradicting its OWN manifest doc, which
  already said "renders above the grid" (the implementation had drifted
  from the doc, not the other way around). Moved to a `data-col-axis`
  attribute + generated `::after`, mirroring the row-axis's existing
  `data-row-axis` + `::before` pattern, so it now centers above the figure
  like the source. Also restored a dropped caveat sentence in the same
  slide's legend ("placements are illustrative and company-specific"),
  trimmed to fit the frame without tripping the export's overflow check —
  see `### Fixed` in `CHANGELOG.md`.
- **Fixed: the row-axis arrow pointed the wrong way, and both axis arrows
  read thin.** The author caught this by eye on the rendered PDF, not from
  the delta report — `writing-mode: vertical-rl` rotates a directional
  arrow glyph an extra 90° on top of the row axis's own 180° flip, so an
  authored "↑" rendered pointing left. Both axes' arrows are now solid
  triangles (▶▲◀▼) instead of thin strokes (→↑←↓) — filled shapes read at
  the label's own bold weight, where a stroke glyph didn't, regardless of
  font. Same visual language on both axes, differing only in rotation, per
  the author's ask: "consistency yet have their own semantics." See
  `### Fixed` in `CHANGELOG.md` for the exact mechanism.
- **Fixed: the levels 1–6 claim panel used one solid dark accent for all
  six** (source: a light pastel tint per level, keyed to a six-hue palette
  defined at the top of the source's CSS). Rather than importing the
  source's literal hex values, `split-panel` gained a new composable
  `cat-1`…`cat-8` variant that pulls from Lattice's own universal
  `--cat-N-fill` / `--cat-N-mark` tokens — the SAME family charts already
  use for categorical series, not the `.chart-frame`-scoped
  `--chart-cat-N-hue`. Each token is `light-dark(paleTint,
  deepSaturatedFill)`, so it pairs with the panel's ordinary
  `--text-heading` / `--text-secondary` text (not `--on-dark-*`, which
  assumes an always-dark surface) — the fill and the text flip together by
  palette mode, same as `--bg`/`--text-*`. The author's call on the
  approach: "use our existing on brand color pallet" — on-brand color, not
  the source's own swatches. All six levels now carry `cat-1`…`cat-6`.
  Went further than the fill: the source also colors the level's badge
  label and its two checkpoint-card labels with the SAME level hue
  (`.l1 h6, .l1 h3 { color: var(--l1) }`, `.l1 > ul > li::before { color:
  var(--l1) }`) — `cat-N` now tints `.panel-eyebrow` and (under `proof`)
  the checkpoint `<strong>` labels with `--panel-mark` too, not just the
  fill, so the category identity carries every labeled element on the
  slide, matching the source's actual coverage rather than a partial
  read of it. Verified rendered in both `indaco` and `indaco-dark` — all
  six read with strong, clear contrast in both modes. See `### Added` in
  `CHANGELOG.md`.
- **Fixed: level 6 used the same checkpoint-card treatment as levels 1–5**
  (source: a distinct "THE SIGNAL" quote card + top-rule "PROOF 01"/"PROOF
  02" pillars — the source's own `.capstone` class, a deliberately
  different layout from its `.level` class levels 1–5 use).
  `split-panel` gained a `capstone` variant that composes with `proof`:
  same DOM (the `### signal` heading + paragraph + two-item checkpoint
  list), but the paragraph renders as a quoted card (left accent border,
  italic display face) instead of a plain callout, and the checkpoint
  cards render as plain top-rule pillars instead of boxed cards. The
  bloom deck's level 6 slide is now `split-panel proof capstone cat-6`,
  with its signal heading retitled from "You know you're here when" to
  "The signal" to match the source's actual label (the component
  uppercase-transforms it, so it renders identically to source's "THE
  SIGNAL"). See `### Added` in `CHANGELOG.md`.
- **Fixed: the practice slide's cards sat under the standard masthead
  hairline** (source: no masthead at all). `_header: ''` suppresses the
  deck header on this one slide, and the base `rule-none` modifier drops
  `.cell-masthead`'s hairline (a `border-bottom`, not the separately-hidden
  `<hr class="masthead-rule">` — two different things that both needed
  addressing). The masthead BAND itself (title docked top, content
  vertically centered below it in the remaining space) stays — that split
  is a deck-wide Lattice layout convention (`.cell-masthead` / `.cell-stage`),
  not a per-slide choice, and re-architecting it to match the source's
  single-flex-column centering would mean touching every masthead-bearing
  layout in the engine for one deck's slide. The cards ARE centered within
  their own region, which is the achievable, non-invasive version of the
  same intent. Also went further than centering: the source colors each
  card's badge with its OWN hue (`l1`/`l4`/`l6`), not one repeated accent —
  `list-steps` gained a new `cat` variant (composes with `capsule`) that
  tints each badge with the theme's per-position categorical color,
  mirroring `statement/premise`'s existing per-row mechanism. The practice
  slide is now `list-steps capsule cat rule-none`.
- **Fixed: the close slide's subheading rendered above the heading as an
  eyebrow** (source: a single body paragraph below the heading — there is
  no separate eyebrow line in the source at all; the earlier delta
  description had assumed a repositioning fix when the actual fix was
  removing a line that shouldn't exist). `closing`'s eyebrow mechanism
  triggers specifically on a code-only paragraph after the heading
  (`h2 + p:has(> code:only-child)`); deleting that paragraph and folding
  its text into the ordinary body paragraph reproduces the source's shape
  exactly, with no CSS change needed.
- **Fixed in passing (found on-path, not part of the original delta list):**
  the "second axis" slide's Roman numerals were never actually colored —
  a `<strong>` auto-wrap from a slot lift carries its own explicit
  `section strong { color: var(--text-heading) }` rule, which silently
  wins over an inherited accent color regardless of specificity. One-line
  fix (`color: inherit` on the `strong`). See `### Fixed` in `CHANGELOG.md`.

All five items are now resolved against the actual source files (the
original ZIP bundle — markdown, CSS, and rendered PDF — not just the
recovered PDF's visual read), at the author's explicit direction after a
"faithful means faithful" correction: color is drawn from Lattice's own
theme tokens everywhere the source uses color, proportions and centering
match the source's intent within Lattice's own layout architecture, and
the deck's `title`/`closing` spectrum bar (fixed earlier in this doc)
remains in place.

## A second look — two more real misses in what had just shipped

The author reviewed the PR's rendered pages directly and flagged two more
deltas the fixes above still hadn't caught, both concrete, both real:

- **`proof`'s two checkpoint cards didn't match height or center their
  content.** `align-items:start` on the two-card grid meant a shorter card
  sat top-anchored at its own content height beside a taller one, with
  neither card's text vertically centered — visibly asymmetric next to the
  source's two cards, which stretch to a shared height and center their
  content as a block. Fixed with `align-items:stretch` on the grid plus
  `display:flex; flex-direction:column; justify-content:center` on each
  card. Applies to every `proof` slide (levels 1–6), not just the one that
  surfaced it.
- **Level 6's panel-left still wasn't faithful even after the `capstone`
  fix above** — it composed the right elements (eyebrow, heading, quoted
  signal, proof pillars) but still crammed the full descriptive sentence
  into the left panel below the heading, bottom-anchored with the rest of
  the panel's content, where the source keeps that sentence in the RIGHT
  column as a lead paragraph above "THE SIGNAL" card and leaves the left
  panel with only the eyebrow, heading, and a short italic question spread
  across the panel's full height. Root cause: `split-panels.js`'s
  `extractFirstP` only lifts the FIRST paragraph before the `### signal`
  heading into the left panel — a second paragraph authored before that
  heading was never going to go anywhere but the left panel's lede slot
  unless it was actually split into two paragraphs. Fixed by authoring the
  italic question as its own short paragraph (→ panel-left's lede) and the
  descriptive sentence as a second paragraph (→ falls through to
  panel-right, styled as a plain lead by a new `.capstone .panel-right >
  p:first-child` rule), and switching the panel's `justify-content` from
  `flex-end` to `space-between` so its new, shorter contents spread
  top-to-bottom instead of clustering at the bottom with a dead zone above.

Both fixes verified rendered in `indaco` and `indaco-dark`. See `### Added`
/ `### Fixed` in `CHANGELOG.md`.

## What's still open

Nothing outstanding from the original five-item delta list, or from the
second look above. Future review should still be a full page-by-page
comparison against the source, not spot checks — that discipline, twice
over now, is what caught every fix in this section.

## What's deliberately different from the source deck

The gallery does not attempt to reproduce the original deck's literal
palette or typography — it authors the *content* through Lattice's existing
slot contracts and lets the active theme (indaco, in the shipped example)
supply the look. That's the point: the components are reusable, not a
one-off skin.
