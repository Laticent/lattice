# base

The foundation every component inherits. Authoring patterns that work on
any slide without needing a class modifier, plus the universal variants
that any component can opt into.

**Files in this folder:**

| File | What it implements |
|---|---|
| `base.tokens.css` | `:root { ... }` token definitions: spacing scale, font sizes, radii, line heights, palette consumers. Every other CSS file reads these. |
| `base.elements.css` | Semantic HTML defaults (`section`, `h1`-`h5`, `p`, `strong`, `em`, `code`, `hr`, `ul`, `ol`, `blockquote`). Element selectors only. |
| `base.modifiers.css` | Auto-detected chrome — eyebrow, subtitle, key-insight panel, below-note, annotation. Triggered by markdown patterns the author writes (no class needed). |
| `base.variants.css` | Universal opt-in variants — `dark`, `mirror`, `numbered`, `silent`, state markers, tone tokens. Composed via `_class:`. |
| `base.treatments.css` | 27 treatment utility classes — 12 tints (`tint-corner at-tl`, `tint-vignette`, etc.) and 11 marks (`mark-orbit`, `mark-seeds`, etc.) plus `treatment-none` — for peripheral atmospheric accents. |
| `base.sketch.css` | The `sketch` **mode** (rendering hand) — a deck-wide hand-drawn skin (handwriting type, drawn boxes, and rough.js-drawn lines). Palette-blind; set via `mode:` or `class:` / `_class:`. |
| `base.finish.css` | The `field` zone of the Finish family — 9 premium **stacked-layer** finish presets (`finish-atrium/meridian/strata/halo/ledger/nimbus/loom/savile/gallery`) on a per-role custom-property compositor (`--fin-wash`/`--fin-texture`/`--fin-mark`/`--fin-edge`), so layers combine by z-index instead of being either/or. `finish-none` (or back-compat `backdrop-none`) opts a slide out. **Rich-on-screen / safe-on-export:** each preset's slot DEFAULT is the richer "dissolving" screen look (directional fades to `transparent` — alpha the browser composites cleanly), with an `--fin-*-opaque` mirror holding the PDF-clean opaque value (every full-bleed fade ends on `var(--fin-canvas)`). One guarded block flips the slots to the opaque mirror for BOTH export paths — `@media print` (CLI vector PDF) and `.lattice-exporting` (the Studio html-to-image raster tags each section before capture) — so the screen is rich while every PDF/PPTX stays opaque-clean (an alpha area-fade bakes to a gray cloud in print-to-PDF). Both faces are palette-blind (`color-mix(var(--accent)/var(--fin-canvas))`), no masks, no `url()`; only the screen face uses alpha. **`--fin-canvas` is the surface THIS SLIDE paints** — `var(--bg)` by default, `--surface-inverse` on the frames that paint an inverse panel (`title`/`closing`/`divider`/`topic`), `var(--accent)` on the six accent covers (the five the splitter emits plus the shared `lat-split-cover`) in **every** mode, `var(--panel-fill)` on a `split-panel` cover carrying a category, and `var(--img-matte)`/`var(--scene-matte)` on the `image` and `scene` compositions that paint the matte — which is what keeps a finish from washing out a frame that paints its own canvas (#1656). It follows the frame **only where the frame actually keeps that canvas**, and after #2291 that is a question about `print` alone: `print` remaps the consumed tokens and `section.print` resets the surface, so a frame that loses the surface to it excludes it. `accent` / `spectrum-off` / `spectrum-edge-*` used to out-specify a frame's own rule and every arm here carried a mode-scoped group excluding them; none of the three was painting a canvas (each draws or removes a *bar* and restated the color while doing it), so they say `background-image` now and the exclusions are gone with them. The accent covers are **not** scoped to `dark` (they were until #2294): a cover paints `var(--accent)` in every mode, and the two arms differ only on print — `section.print` is bundled after the five component sheets and takes their field, while `section.lat-split-cover` is bundled after `section.print` and keeps it. Print has a **fourth** answer: `section.print[data-split-role="cover"]` de-floods any role-stamped cover to `var(--surface-inverse)`, so `--fin-canvas` mirrors it on the same stamp rather than on a frame class. `topic` differs by DOM shape AND by variant, so it takes three arms: `section.topic:not(:has(> ul.tile-track))` restates its canvas at (0,2,2), so a trackless topic holds it under everything, print included, and carries no condition at all; a topic carrying its track is back at (0,1,1) and loses it as `title` does; but `section.topic.fact` (0,2,1) restates it again and out-specifies `section.print` (0,1,1), so a **fact** slide keeps its inverse panel under print even when tracked — measured, `topic fact print` with the track is rgb(236,236,236) while the plain tracked arm was sending `--fin-canvas` to white. Selected deck-wide via the `finish:` register or per-slide via `_class: finish finish-<name>`. See `engineering/decisions/2026-06-30-finish-the-surface-layer.md`. |

---

## Safe-area for vertical feeds — the `safe` modifier

Vertical-video feeds overlay their own UI on a vertical post: a profile row
across the top and a caption + action rail across the bottom. The **`safe`**
modifier keeps slide content clear of those bands.

- **Opt-in.** Add `safe` to a slide, or deck-wide via `class: safe` in the front
  matter. (It's not automatic: a 4:5 / 1:1 *feed* post has no overlay UI, so only
  add it for story/mobile decks.)
- **Portrait/square only.** It takes effect when the deck's `@size` is
  portrait or square (`data-orientation`); on a landscape deck it's inert.
- **How it works.** The engine emits px safe bands from the geometry —
  `--safe-top` (12% of height) and `--safe-bottom` (20%, covering the taller
  caption bar) — and `safe` reserves them as content padding (content stays centered
  within the reduced area) and lifts the footer chrome above the caption band.
  The same bands are emitted by the runtime preview, so the Drawing Board matches
  the export. Tune per deck by overriding `--safe-top` / `--safe-bottom`.

See `engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md`.

## Animate a chart in place — the `chart-anima` modifier

On the live surfaces (Studio, Playground, Present), **`chart-anima`** brings a rendered chart to life — a funnel's bands build in top-to-bottom (its labels follow, the worst drop-off emphasizes); a pie fades in as a whole disc. Model-free: the motion is derived from the chart's own marks, no LLM.

- **Opt-in.** Add `chart-anima` to a slide (`<!-- _class: funnel chart-anima -->`, `<!-- _class: piechart chart-anima -->`) or deck-wide via `class: chart-anima` in the front matter. A section with the class but no animatable chart is a safe no-op.
- **Preview-only, export byte-identical.** The motion plays only on the live surfaces; the exported **PDF / PPTX / HTML show the finished chart still** (unchanged from a chart without the modifier).
- **Accessibility for free — but NOT a playback control.** An animated chart runs through the same host as an Anima `scene`, and pauses off-screen. It does **not** get the corner pause / play / replay control: the chart path passes `chrome: false` deliberately (a one-shot play-on-enter), so there is no control to show. A viewer whose system asks for `prefers-reduced-motion` sees the **finished chart, still** — the live host mounts it settled rather than playing a reduced build. Bound the policy per slide/deck with `data-scene-motion` (`still` / `legible`).
- **Funnel + pie today.** The remaining SVG charts (quadrant, radar, map) follow as each gets its choreography defaults and a real-surface check; the gradient-fill plumbing they share is now fixed (their `url(#…)` fills would namespace the same way), though not yet verified on those charts.

See `engineering/decisions/2026-09-02-frame-model-for-motion.md` (the current state of record; it carries forward §0.75 of the superseded `2026-07-19-anima-svg-first-cut-zdog.md`).

## Two components on one slide — panes

**Experimental — the syntax may change.** Put two components' body content on one slide, side by side or stacked.
The slide keeps its one eyebrow, title, subtitle, Key Insight, below-note, header, footer and page
number; only the body splits. Mark where each component's body begins:

```markdown
## Services outgrew licenses for the first time.

<!-- panes: 55/45 -->
<!-- pane: bar -->

- Licenses `42`
- Services `47`

<!-- pane: list -->

- Services crossed licenses in March
- Fold training into services

> The mix shift is structural, not seasonal.
```

- `<!-- pane: <component> -->` starts a pane; two per slide. Write each pane's body exactly as that
  component's own slide body, minus the heading.
- `<!-- panes: 40/60 -->` sets the split, 25–75 in 5% steps (default 50/50);
  `<!-- panes: stack 35/65 -->` stacks the panes top to bottom.
- A **spine** marks the seam between the panes: the same accent rule, fading at both ends,
  that separates a chart from its key. It turns horizontal when the panes stack. Add
  `no-rule` to drop it (`<!-- panes: 50/50 no-rule -->`) — a photo pane's own edge
  usually separates it already.
- The trailing `> quote` and `— note` belong to the slide, never to the second pane.
- **Which component can go in a pane is its own decision** — the `pane` field of its manifest,
  which `dist/docs/components.json` carries. `half` (44 of 70) reads
  in a pane of any share. `wide` (17: `table`, `gantt`, `roadmap`, `cards-grid`, …) needs 65% or
  more side by side, or a stack. `none` (9 whole-slide frames: `title`, `divider`, `split-panel`,
  …) opts out: that pane renders as `content`. `kpi` and `pricing` go side by side only — one tile
  already clips in a stacked band. `image` has a pane form: the picture covers its pane.
- **Each pane has a budget.** Write a pane's content tighter than a whole slide's — about half the
  words per item. At that density a `list` pane holds 6 items side by side and 4 in a stacked band,
  a `table` 7 rows at 65%, a `bar` chart 8 bars. A narrower pane holds proportionally fewer.
- `lint:deck` names each problem before you render: `pane-fit` (a component that opts out, a
  `wide` one under 65%, a side-by-side-only one stacked), `pane-overflow` (past the budget) and
  `pane-crowd` (past the comfortable count). It warns and never blocks; the Studio's editor
  shows the same warnings as you type. At export, a pane that really clips is marked like any
  clipped slide.
- **`cards:` works in a pane** as on a slide: a card row or list in a pane sits at the top,
  centers or stretches as the deck's `cards:` or the slide's `_class: cards-*` says (the
  six components that take it: `cards-grid`, `cards-stack`, `verdict-grid`, `list`,
  `list-steps`, `compare-prose`). One setting per slide: both panes take it.
- **A chart in a pane draws for the pane.** Its labels, ticks and key print at the size a chart
  slide prints them, and the plot gets shorter or narrower instead. A pie, map or quadrant prints
  its key larger, beside or below the diagram, where the pane has room; a radar scales into its
  pane as it would on a slide.

Known limits while it is experimental: a Mermaid diagram scales into its pane, so it draws small
in a narrow one and nothing warns; the pane's size is modelled from the slide's chrome, so a title
that wraps to two lines leaves a chart pane a little tall; an installed package's CSS and the
Studio's extra CSS do not reach a pane yet (a deck's front-matter `style:` does, in the CLI export). Demo: `examples/panes.md`.
Design, audit, the measured budgets and every open gap:
`engineering/decisions/2026-09-25-panes-two-components-one-slide.md`.

## Auto-detected authoring patterns

These work on any slide without a class modifier. Write the markdown,
the CSS recognizes the shape, the chrome appears.

### Eyebrow labels

A paragraph containing only a single inline-code span, placed **above**
a heading or list, renders as a mono uppercase label.

```markdown
`Section 01 · Foundations`

# Section Title
```

```markdown
`Context · Competitive Dynamics`

## Slide Heading
```

```markdown
`Calibration Result · 6-Month Pilot`

- 14×
  - Description text.
```

The CSS pattern is `p:has(> code:only-child) + h1/h2/…`. Eyebrows are
**markdown-lint compliant**: a `<p>` containing code is not a heading,
so the eyebrow pattern can never violate heading-order rules.

**The WHOLE paragraph has to be the code span.** `` `Section 01` `` is an
eyebrow; `` `guards: loose` is the default `` is a sentence, and renders as
one. CSS `:only-child` cannot see text, so before #2308 any paragraph holding
exactly one code span matched — "The `background:` shorthand clears every
longhand" after a heading was re-typeset as a muted subtitle and lost its
pill. The engine now stamps `data-prose` on a `<p>` (or a tight-list `<li>`)
that mixes code with text (`lib/core/prose-code.js`, mirrored by the
runtime), and every `:has(> code:only-child)` rule carries
`:not(:where([data-prose]))`, which adds no specificity. A renderer that
never runs the kernel (a Marp for VS Code preview with scripts off) keeps the
old behavior. To keep a kicker that mentions code, put the whole line in
backticks.

**The eyebrow takes PLAIN inline code — a pill or a mark there is not a
kicker.** The selector needs a `<code>` ELEMENT as the paragraph's only
child, and the inline directive grammar (`{LABEL}` pills, `[x]` marks —
see *Inline pills — `{LABEL}`* below) replaces that `<code>` with a
`<span>`. So `` `{DRAFT}:c2` `` above a heading renders as a **pill alone
on a line**, not as a colored eyebrow, and `` `[x]` `` there renders as a
state disc. Both are legal; neither is promoted.

**The same shadow falls on the SUBTITLE** — a code-only paragraph immediately AFTER a
heading, which `base.modifiers.css` promotes to an italic muted line by the same
`> code:only-child` rule.

This is a shadow rather than a break: measured across every shipped deck — well over a
thousand spans across the two positions — **zero** dispatch. A real
one reads `` `Section 01` `` or `` `H1 FY26 · 1,840 person-hours` ``, and none starts with
a brace or is a bare marker. `test/unit/css/eyebrow-position-shadow.test.js` scans both
positions and fails if one ever does.
Want the literal braces as your kicker text? Escape it — `` `\{DRAFT}` ``
stays a `<code>` and stays an eyebrow.

Styling: `--font-label`, 13px (`--fs-label`), 600 weight, 0.18em
letter-spacing, uppercase, `--text-secondary` (the AA-tuned secondary
content tier — a `light-dark()` pair, so it resolves correctly on `.dark`
slides and dark themes). All three dark bookend slides (title, divider,
closing) override the color to `--on-dark-secondary` automatically.
(Before the 2026-06-05 token-structure audit the eyebrow rode the
decorative `--text-muted`, which dropped below AA in several themes —
see `engineering/decisions/2026-06-05-token-structure-audit.md`. That
token no longer drops below AA anywhere: #1715 gave it the floor its name
always implied and moved the decoration to `--muted-mark`. And
until 2026-08-11 `closing` alone rode `--on-dark-ghost`, the decorative
chrome rung, at 2.49–2.91:1 in every palette; ghost carries **no text**
and is now the rule/divider tier — see
`engineering/decisions/2026-08-11-on-dark-ink-tiers.md`.)

**Exception — `title` layout.** Placing an inline-code paragraph
before `h1` triggers markdownlint MD041 (_first-heading-h1_) because
the paragraph becomes the first content element in the file. On title
slides the order is reversed: `h1` first (satisfies MD041), inline-code
eyebrow immediately after. CSS on
`section.title h1 + p:has(> code:only-child)` recognizes the swap.

**Note on `split-panel watermark`.** The inline-code eyebrow paragraph is placed
**between `h2` and `h3`** in the source. The CSS grid fallback routes
it to the left dark panel automatically.

### Subtitle labels

A paragraph containing only a single inline-code span, placed **below**
a heading, renders as body-font italic in `--text-secondary` — no pill, no
mono, no uppercase.

```markdown
## How signals move from input to decision.

`Four-stage processing pipeline — weekly cadence`
```

CSS pattern: `h* + p:has(> code:only-child)`. Layout-specific `> p`
rules (diagram, stats, title, closing) govern container size
and color; the subtitle rule only strips the pill and applies italic.

This replaces the legacy `_em paragraph_` pattern for post-heading
descriptors — both are valid Markdown, but the inline-code form is more
explicit about intent.

**Exception — `title` layout.** On title slides the inline-code
paragraph after `h1` is claimed by the eyebrow rule, leaving no
inline-code slot for the subtitle. The subtitle is therefore a plain
paragraph placed immediately after the eyebrow:
`h1 → p:has(> code:only-child) → p`.

**What stays as `_em_`.** Table footnotes and body prose that happens
to be italic. These are not subtitles.

### Metadata pill (trailing inline code)

A trailing inline `code` span on a list row becomes a **pill** — a small,
fully-rounded status/metadata chip pinned to the end of the row.

```markdown
- Throughput target met `on track`
- API latency `at risk`
```

Authoring guidance: keep pill text to **one word (hyphenated is fine) or
two words at most**. Pills are `white-space: nowrap`, so a long phrase
will not wrap — it just makes a wide pill. (This is a guideline, not a
hard validator: enforcing a word count in CSS would require truncating
text, which hides content, so it is intentionally left to the author.)

**Pills share one structure, not one color.** Every pill across every
layout draws its geometry — radius, proportional (em-based) padding, the
body sans, weight, tracking, and center-/middle-aligned text — from the
universal `--pill-*` tokens in `base.tokens.css`. (Pills use the deck's
sans, not mono: a pill is a status / label chip, not code, and the sans
also vertically centers caps correctly where mono seats them high.) The
separate non-pill citation/identifier chips keep their own mono. Color
stays per-pill:
a layout sets `--pill-fg` / `--pill-bg` / `--pill-border` (or its own
semantic hue tokens) to carry the meaning. Three pills are **sanctioned
variants** that deliberately override specific axes and document why at
their own CSS site: chart-status (a bar-matching semi-round chip),
list-tabular `register` (a wide "stamp"), and redline `.annotated`
(footnote superscript / positioned counter).

### Key Insight panel

Any card-bearing layout that ends with a trailing `> blockquote`
renders it as a **Key Insight panel** — an accent-tinted bar that pins
below the card content. Use it to surface the one takeaway the
audience should remember from a card-grid slide.

```markdown
<!-- _class: cards-grid -->

## The framework has four components.

- **Signal Intake.** Body text.
- **Scoring Model.** Body text.
- **Decision Log.** Body text.
- **Calibration Loop.** Body text.

> Key insight: signals without decisions are noise.
```

**Supported layouts: almost all of them — this block is OPT-OUT.** A layout renders
the callout unless it declares `coda: { claims: ["blockquote"] }` in its manifest.
Ten do: `quote` (the quotation itself), `math` (a display equation),
`citation-card`, `redline`, `inventory`, `policy-recommendation` and `split-panel`
(its `pullquote` variant) all use the element for their own anatomy; `split-compare`
paints the same `--insight-label` on its verdict card. `contact` and `wifi` claim it
for a different reason — they are posters whose card fills the stage, so there is no
band position that does not crush it. The generated `layout-*` skeletons are excluded
by pattern. Everywhere else a trailing blockquote becomes the callout.

Don't derive the answer from that paragraph — read `authoring.blocks` in
`dist/docs/components.json`, which is generated from the same predicate the RENDER
uses (`rendersBeat`, `lib/core/coda.js`), and which the deck lint's
`block-unsupported` rule and Compose's grammar gutter also read (#1651).

The exclusions used to be a hand-written CSS `:not()` chain that a unit test parsed
back out of the stylesheet. Measured against a real render, it — and below-note's
substring list — were wrong for **eight of 61 layouts**, silently: the manifest
advertised the block, the transform swallowed or dropped the node, and the author got
nothing. Both lists are gone; see
`engineering/decisions/2026-08-24-universal-coda-cell.md`.

### Below-Note

A short paragraph after a list/table/blockquote, prefixed by an em-dash
hairline rule. Use for caveats, footnotes, or qualifications that
shouldn't get card weight.

```markdown
<!-- _class: cards-grid -->

## …

- Card 1
- Card 2
- Card 3

— Note: figures are pre-audit; final numbers ship in Q3.
```

**Supported layouts: opt-out, like Key Insight above — but a DIFFERENT set.** A
layout withholds the note by declaring `coda: { claims: ["trailing-paragraph"] }`,
and after the 2026-09-01 audit every surviving claim is one the layout's own anatomy
really uses: the bookend lede (`title`, `closing`, `divider`), `quote`'s attribution,
`stats`' italic lede, `image` and `split-panel`'s body regions, `split-compare`'s
verdict, `math`'s equation grid, the two QR posters (`contact`, `wifi` — a 527px card
in a 524px stage; there is no band position that does not crush it), and the fourteen
chart-frame layouts that turn a final paragraph into `.chart-caption` (twelve as the
caption proper, `matrix-grid` and `state-chart` as their swatch `legend`).
Everything else promotes, **including `content`**, which means any slide that names no
component at all, since that is what an un-classed slide resolves to (#1292).

**Two claims did NOT survive that audit, and the pattern is worth knowing.** Rendered
through the real emulator and measured in Chromium, `diagram` and `big-number` each
withheld the note to protect anatomy they do not render. `diagram` is the sharper case:
it claimed the paragraph for a `.diagram-caption`, and **no code path in the tree emits
that class** — what actually caught the paragraph was diagram's *dek* rule
(`section.diagram > .cell-stage > p`, the rule for the LEADING paragraph under the
heading), so the author's closing sentence rendered as a second dek at the foot of the
slide. `big-number` had no rule matching a trailing paragraph at all; its documented
caption is a nested bullet (`ul > li:first-child > ul > li`), not a paragraph. Both now
take the note, and diagram's dead caption rule is deleted with its claim. This is the
same defect `code` carried until 2026-08-30, when its claim was found to be protecting a
caption selector the markdown path never emits
(`engineering/decisions/2026-08-30-code-type-step.md` §3) — a claim can be dead for years
without anything failing loudly, because the failure IS silence.

**Three more looked dead and are not, which is the more useful half of the audit.**
`matrix-grid` and `state-chart` both LOOK like they render nothing with the trailing
paragraph, and a probe that appends a note to their sample sees exactly that. What the
probe cannot see is that the paragraph is already their documented `legend` slot
(`p:last-of-type`), which the transform pre-wraps in a span so `liftChartCaption` can lift
it into `.chart-caption` as one inline run. Drop the claim and the coda harvests the
legend instead — measured on their own manifest samples with nothing appended, the legend
became a below-note and the chart lost it. A probe that always adds a beat cannot see
this, because the added beat displaces the legend from the anchor position; the bare
sample is what shows it. `math` is the third: dropping its claim docks the band inside its
equation grid at 584.6px wide and 376px off the floor, where every other layout lands
full-width 56px above the footer. One manifest value cannot describe that, and fixing it
is a layout change rather than a claim change.

The two sets do not coincide: `inventory` takes a below-note but not a key insight,
`timeline-list` the reverse. Read `authoring.blocks` in `dist/docs/components.json`
for the per-component answer rather than deriving it from either list here (#1651).

Both blocks land in the same place: one `.cell-coda` cell at the end of the slide,
built before any component transform runs, docked by the section's declared outer
structure and carrying one `--coda-step` of separation from the body. The cell is a
direct child of the `<section>` — the frame peels it out of the stage wrap the same way
it peels a running `<footer>` — so the band sits at the bottom of the slide whatever the
body does above it, and an `align-top` / `align-middle` / `align-bottom` on the slide
moves the body without moving the band. That is why the step above a trailing block is
identical on every layout, and why a component whose transform wraps its body no longer
loses the block.

Promotion needs the paragraph to follow a **structural** block — a list, table,
blockquote, code fence or div. A paragraph after a paragraph is body copy on every
layout, so ordinary prose never turns into a note by accident.

Renders as muted body text with a thin top border. Inherits the slide's
text color so it reads on either light or dark canvas.

#### Opting out — `no-note`

Promotion is automatic, and on a prose slide it is not always what the author
meant: **"a list, then a concluding sentence"** is an ordinary shape, and promotion
turns that conclusion into a footnote — muted, hairline-ruled, and pushed to the
stage floor. `no-note` keeps the trailing paragraph as body copy.

```markdown
<!-- _class: content no-note -->

## What we decided.

- We ship the migration in two phases.
- Phase one lands before the freeze.

These two phases are one decision, and the second does not stand without the first.
```

#### Marking a note as an alarm — `note-warn`

The other half of the pair. `note-warn` marks the slide's callout as a warning:
the drawn warning triangle (`--shape-warning`) beside the label, both painted in
the theme's warn token.

```markdown
<!-- _class: list note-warn -->

## Adoption, as reported in June.

- Adoption reached 12% against a 90% target.
- The calibration loop has run once.

> These figures predate the Q3 restatement and are superseded by it.
```

Use it instead of typing a `⚠` in front of the sentence. The glyph is the single
most likely character in a deck to arrive as a full-color emoji on somebody
else's machine — ignoring the palette entirely — where the mark here is drawn
from a mask, flips with the theme, and prints in grayscale (HARD RULE #29).

Per-slide as above, or deck-wide in front matter (`class: no-note`) for a deck whose
prose habitually ends this way. It suppresses only the promotion; nothing else about
the slide changes, and a Key Insight (`> blockquote`) on the same slide is untouched.
**Deck-wide reaches every slide, including the ones that name their own `_class:`.**
(An earlier note here warned it did not, and named a per-slide workaround. That was
wrong about the engine and is retracted — the deck-wide token was always on the section;
one transform was reading the wrong attribute off it. #1358,
`engineering/decisions/2026-08-04-data-class-shadows-resolved-class.md`.)

`silent` deliberately does **not** imply it: `silent` hides the running *frame* —
header, footer, page number — none of which is the author's own words, whereas this
is the author's last sentence.

### Annotation

A trailing paragraph whose only content is an `_italic_` span renders
as an annotation — a `✦` in `--accent`, DRAWN from the `--shape-spark` mask
rather than typed (HARD RULE #29), followed by smaller, muted, label-size text.
It swaps the below-note's accent hairline for a **dotted** rule at the same
vertical position, so the gap above the rule is identical either way. Distinct
from a below-note: lighter visual weight, lower information density, signals
"this is a footnote, not a continuation of the argument."

```markdown
<!-- _class: cards-grid -->

## Slide heading.

- Card Title 1
  - Card body.
- Card Title 2
  - Card body.

_Source: pilot retrospective, six months across four product teams._
```

CSS pattern: `section .below-note > p:has(> em:only-child)` — the
paragraph must contain a single `<em>` and nothing else (no leading/trailing
text outside the italic span), and it has to have been promoted into the coda
band in the first place, which is what ties the register to `below-note`'s
support set. Mark: the `--shape-spark` mask at `1em` in `--accent`, in a
`1.5em` box whose spare `0.5em` IS the mark-to-text gap (geometry, not a
margin — HARD RULE #20). Text: `--fs-meta` in `--text-secondary`. Use for source citations, scope
caveats, asterisk-style footnotes — content that *frames* the slide
rather than extending its argument.

**Supported layouts: exactly the same set as Below-Note, by construction.** An
annotation IS a below-note — the same trailing paragraph, in the same `.cell-coda`
band, promoted by the same kernel under the same rule (it must follow a structural
block). All the register does is style it differently when the paragraph's only
content is an `_italic_` span. So there is one predicate, `rendersBeat`, and one
answer: read `authoring.blocks` in `dist/docs/components.json` and if it lists
`below-note`, the annotation works there too.

This paragraph used to say something else, and the correction is worth keeping.
Below-Note was **opt-out** while Annotation was **opt-in** — a hand-enumerated union
of seventeen layouts written three times over in `lib/base/base.modifiers.css`. Two
sets, two mechanisms, and no way for them to agree. Measured through the real
emulator, one probe slide per component: **15 layouts got the mark and 19 that render
a below-note silently got an ordinary one instead** — body-size, accent hairline, no
`✦` — including `content`, which is what every un-classed slide resolves to. Two of
the seventeen names, `timeline` and `principles`, are not COMPONENTS but VARIANT classes
(`inventory`/`regulatory-update` timeline, `list` principles) — so `principles` was
redundant with its own base and `timeline` was the union's only reach into an
`inventory timeline` slide, a reach every layout now has by construction.

The union is gone. The register now keys on the `.below-note` wrapper, which the kernel
emits only for a layout that renders the beat, so the two sets cannot drift apart again.
Adding a layout means nothing here: it takes the annotation the moment it takes the
below-note. (Keyed on the WRAPPER, not on the `.cell-coda` cell — the cell is a DOM
position, and keying on it drops the register for a hand-authored `.below-note` that the
Form transform folds into `.cell-stage`.)

*(One name list survives, and it is not this one: the CSS-only fallback tier, for a
Marp deck that loads `lattice.css` without the runtime and so has no coda cell. It is
derived from the catalog by `test/unit/transformers/coda-fallback-union.test.js`,
which fails on a missing name and on a stale one.)*

### The three trailing-paragraph registers — comparison

The three registers are told apart by MARKDOWN SHAPE, not by a class the author
types. They do not all reach the same layouts, and the counts are measured on a real
render rather than derived from this page — 61 layouts, one probe slide each:
**key insight 51, below-note 36, annotation 36.** The last two are equal by
construction: an annotation *is* a below-note that happens to be italic-only.

| Markdown shape | Renders as | Visual |
|---|---|---|
| `> blockquote` | **Key Insight** | accent-tinted panel, "KEY INSIGHT" eyebrow |
| Plain `<p>` (em-dash prefix) | **Below-Note** | hairline rule + body text |
| `<p>` containing only `_italic_` | **Annotation** | drawn `✦` + dotted rule + muted label-size text |

A slide may carry one Key Insight (blockquote) plus one trailing-
paragraph register (below-note OR annotation), in that order. See
`examples/gallery.md` slide 21 for key-insight + below-note,
slide 22 for key-insight + annotation.

#### Renaming the eyebrow — `insight-*` modifiers

The eyebrow word is not fixed. The Key Insight panel emits its eyebrow as
`content: var(--insight-label, 'KEY INSIGHT')`, so an `insight-*` modifier on
the slide `_class` (or a deck-wide frontmatter `class:`) swaps the word to a
curated boardroom heading — the panel chrome, color, and sizing are untouched.
Defaults never move (the `var()` fallback), so every existing deck renders
identically; the vocabulary is a small, edited set, not free text.

The **split-compare verdict tag** reads the *same* `--insight-label` seam
(default `RECOMMENDATION`), so one vocabulary drives both surfaces — the
recommendation is a Key Insight variant, not a split-compare special. See
`examples/insight-labels.md` and
`engineering/decisions/2026-07-17-insight-label-vocabulary.md`.

| Modifier | Eyebrow | Modifier | Eyebrow |
|---|---|---|---|
| `insight-key` | KEY INSIGHT | `insight-verdict` | VERDICT |
| `insight-recommendation` | RECOMMENDATION | `insight-so-what` | SO WHAT |
| `insight-takeaway` | TAKEAWAY | `insight-bottom-line` | BOTTOM LINE |
| `insight-the-ask` | THE ASK | `insight-our-view` | OUR VIEW |
| `insight-implication` | IMPLICATION | `insight-next-step` | NEXT STEP |
| `insight-why` | WHY IT MATTERS | | |

`insight-key` / `insight-recommendation` are the two defaults as explicit
modifiers, so either word can move onto the other surface. Grow the set in
`base.variants.css` § INSIGHT LABEL — keep new words uppercase to match the
eyebrow's `text-transform` and the label voice.

### Labeled Corner Tag

The named-slot sibling of the numbered corner tag. On `compare-prose` (incl. the
`transition` variant) and `decision`, the slot label sits at the top of
each card as a flush corner tag — same geometry as the numbered tag
(see Auto-Numbered Cards below), but the content is editorial text
instead of a counter. The card body fills from the top; no first line
is consumed by a label.

```markdown
<!-- _class: compare-prose transition -->

## Decisions used to require a quarterly re-litigation.

- Before
  - Every prioritization debate from first principles, average close 4 hours, billed as agility.
- After
  - Resolved against logged weights and prior outcomes, average close 18 min, billed as rigor.
```

**Layouts that support the labeled corner tag:** `compare-prose`
(incl. `transition`), `decision`.

**Authoring is plain.** Write the slot label as the first line of each
list item — no bold, no syntax. The build pipeline lifts it into a
`<strong>` automatically because in these named-slot layouts the
leading text is structurally a slot label, not editorial emphasis.
Authors don't carry presentational markup.

- Tag chrome matches the numbered corner tag — accent fill, white mono
  text, flush top-left geometry. The labeled and numbered variants are
  visually a family.
- `compare-prose` uses the unified accent fill (its slots have semantic
  ordering — before/after via `transition`, or A/B). `decision` is the
  categorical case: each slot is an independent reason, so the tag and
  the bottom border cycle through the categorical palette (`--cat-1-mark`,
  `--cat-2-mark`, `--cat-3-mark`, …) — same palette and cycle as
  `kpi.trajectory`, inverted to the bottom edge so the two layouts read
  as siblings (kpi.trajectory = top accent, decision = bottom accent).
- Composes with `compare-prose` modifiers `chosen` / `decision` — the
  corner tag inherits the modifier's editorial signal.
- **`banner-tag` modifier** flips each card from a flush-corner tag
  into a full-width header strip:

  ```markdown
  <!-- _class: decision banner-tag -->
  ```

  The card becomes a vertical column-flex: tag fits its content height
  and spans the full card width; body stretches into the remaining
  height (vertically centered). Use when the slot label is the
  architectural signal of the card — the categorical case (`BUILD` /
  `WHY NOT BUY` / `WHY NOT DELAY`) — rather than a quiet marker.
  Default flush-corner stays for the editorial register where the body
  owns the card. Same lift infrastructure feeds both styles, so
  authoring is unchanged. Composes with all existing modifiers
  (`chosen`, `decision`, `mirror`, `vertical`).
- Named-slot only — `compare-prose` (incl. `transition`) and `decision`
  exist precisely to label their cards. Other card-bearing layouts
  (`cards-grid`, `cards-stack`, etc.) keep the in-card title row
  because their card titles are editorial sentences, not categorical
  labels.

### Auto-Numbered cards

A card-bearing layout authored as `ol` (`1. … 2. … 3.`) instead of
`ul` (`- … - … - …`) automatically stamps an accent corner tag on each
card with the index. Use whenever the cards carry a sequence —
problem → cause → fix, or step 1 → step 2 → step 3.

```markdown
<!-- _class: cards-grid -->

## Signal Intake produces three outputs.

1. Weekly Signal Brief
   - A ranked list of the top 10 signals…
2. Anomaly Alerts
   - Real-time flags when a signal exceeds the 2σ threshold…
3. Monthly Signal Index
   - The source of truth for the calibration loop…
```

> **Indentation rule for `ol`:** sublists must be indented **3 spaces**
> to clear the `1. ` prefix. 2 spaces breaks the nesting — Markdown
> treats it as a sibling list, not a child list.

**Layouts that auto-number when authored as `ol`:** `cards-grid`,
`cards-stack` (incl. `horizontal`), `list`,
`list-steps`, `list-tabular`, `split-panel`, `timeline`,
`principles`.

Each layout owns its own counter style (corner tag, header pill, mono
rail, "STEP 01" prefix, large accent block, circle node — see each
component's `<name>.docs.md`).

---

## Tables

A plain GFM pipe table written at the top level of the slide body gets a house
treatment — no class needed. It renders with label-cased column heads over the
spectrum rule, hairline row rules, a quiet accent zebra, and compact cell type.

The hairlines sit **between** rows only — the last row of the table draws none. That rule would
be the table's outer bottom edge, and the stage already draws a boundary under it: a
below-note's hairline sits about 25px below a table that fills the stage, and two
rules that close with nothing between them read as one thick line rather than two
boundaries. If you want the table bounded top *and* bottom instead, put the deck (or
the slide) on `rule: none` — the masthead hairline steps aside and the table's own
spectrum bar becomes its top edge. See
`engineering/decisions/2026-09-03-table-outer-edge-rules.md`.

```markdown
| Region | Q3 revenue | Q4 revenue | Change |
| --- | --- | --- | --- |
| North America | $4.2M | $5.1M | +21% |
| EMEA | $3.8M | $3.9M | +3% |
```

**Column alignment is native markdown's, always.** `:---`, `:---:` and `---:`
compile to an inline `style="text-align:…"` on every cell in the column, header
included, and an inline style outranks the treatment — so the engine sets no
`text-align` on `td` at all. The one default it does set is on an *unaligned*
header, replacing the browser's centered default with left. Nothing is emphasized
for you either: `**bold**` is the only emphasis, and it works in any cell.

### Two switches

Both are custom properties, so they can be set from CSS at any level a property
reaches — a theme's `:root`, a deck's `style:` block, a component — and the class
is just the author-facing spelling.

| `_class` | Property | Effect |
| --- | --- | --- |
| `table-plain` | `--table-zebra: transparent` | Turns row striping off; the hairlines carry the rhythm alone. |
| `table-fill` | `--table-grow: 1` (+ `--table-valign: middle`) | The table takes the leftover stage height and its rows spread to use it, centered in their band. |

They are independent, not an axis — `table-plain table-fill` is a legitimate
pair. Neither reaches a component that owns its own table. The `table`
component is not one of those: it styles no table element, so both switches
work on it, and `table-fill` is how you ask a `table` slide for the filling,
band-reading geometry instead of its hug-and-center default.

```markdown
<!-- _class: table-plain table-fill -->
```

### A third switch — `state-cells`, for status in cells

`state-cells` is not a look; it changes what the table's cells MEAN. It opts the
slide into the universal state-marker decoding — the six markers become the
color-blind-safe status disc — which `obligation-matrix` and `matrix-grid` get by
layout and every other table used to go without.

That gap is why so many comparison tables were typed with a `✓`. A typed check is
not a shape we draw: the deck's type family carries no glyph for it, so the
renderer falls back to whatever font that machine has, or to a color emoji that
ignores the palette, or to a hollow box (HARD RULE #29). The disc is drawn from a
mask, takes the status color from the theme, and — because each state has a
DISTINCT shape, not just a distinct hue — still parses in grayscale and for a
color-blind reader.

```markdown
<!-- _class: table state-cells -->

## Where each tool actually lands.

| Criterion    | Chorus | Productboard | Notion | Sprig + Log |
| ------------ | :----: | :----------: | :----: | :---------: |
| Speed        | [x]    | [!]          | [x]    | [x]         |
| Auditability | [!]    | [x]          | [x]    | [x]         |
| Calibration  | [!]    | [-]          | [?]    | [ ]         |
```

A comparison cell wants the difference between `[!]` — checked, and the answer
is no — and `[ ]`, nobody has checked yet; `[?]` is the cell somebody checked and
could not settle. Each draws what it draws in every other layout. Every
`checks-*` style variant and `heat` works on them unchanged. A trailing label in the cell
(`[x] Certified`) is hidden, so the column header carries the meaning.

```css
/* or deck-wide, with no class on any slide */
:root { --table-zebra: transparent; }
```

**Where it does NOT apply.** Base stands off wherever a component owns the
table, and it only reaches the slide body's own top level:

| Not treated | Why |
| --- | --- |
| `glossary` · `obligation-matrix` · `roadmap` · `matrix-grid` | the component styles its own table |
| `math derivation` · `statute-stack lane` | same, but only under that variant — a bare `math` or `statute-stack` slide DOES get the treatment |
| a table inside `split-panel`, `split-compare`, `compare-code` or `image` | it lands in a side frame, not the slide body's top level |
| a table a chart transform generated | it is wrapped in a `<figure>`, and belongs to the chart |

**Reach for `<!-- _class: table -->` when the table IS the slide.** It is this
same treatment — it adds no table CSS at all — plus the things a manifest can
declare and a bare table cannot: a row capacity budget, autosplit, the portrait
card reshape, the `row`/`col`/`cell` focus axes, and the first-column row-label
switch. The bare universal treatment is for a table that *supports* prose.

### A third switch that is not a class — `row-label`

The first column of a `table` slide reads as a row label — 600 weight, heading
ink — when it actually is one. `lib/core/table-row-label.js` decides per table,
and it turns the emphasis OFF on the four shapes where the bet is wrong: a
single-column table, an index header (`#`, `No.`, `Ref`), an all-numeric first
column, and a column of bare state markers.

Overrule it either way with `row-label` / `no-row-label`, which also work on a
plain table — `row-label` is how a table outside the component opts in. The
explicit tokens always beat the measurement, and `no-row-label` wins a slide
carrying both.

**A table written as raw `<table>` HTML is not judged — it is emphasized.**
markdown-it passes raw HTML through untouched, so its rows never reach the rule
and there is no verdict to take. Rather than silently dropping the emphasis, a
slide holding a raw table gets it unconditionally on the first column, which is
what this component did before the rule existed. So a raw table always reads as
though its first column were a label, even when it holds numbers — the one case
where writing a pipe table instead buys you a real decision. Measured caveat: on a
Marp render of an exported bundle the browser-side pass DOES judge such a table
and declines it, so a numeric-first-column raw table reads bold in the PDF and
plain there. Confined to that one shape; a raw table with a genuine label column
agrees on both. `no-row-label` on
the slide does not suppress it, because the suppression rides the same verdict
the rule never reached. `compare-table` did emphasize such a table, so this is a
regression against it; `engineering/decisions/2026-09-20-table-component.md`
records the measurement and the two candidate fixes.

**Both are per-SLIDE tokens.** A deck-level `class: no-row-label` in front
matter does NOT reach them: the rule that stamps the table runs before
deck-class propagation, so the section has not received the deck token yet. Put
them in the slide's own `<!-- _class: … -->`. (Moving the rule later is not
free — it would land after the state-marker plugins, which rewrite a cell's
children into markup the text reader skips, changing what the measurement
sees.)

`checkUniversalTableGuard` fails the build if the engine's CSS deny list and the
components that actually style a `<table>` ever disagree, in either direction and
at variant granularity. **It does not read this markdown table** — it reads
`base.elements.css` and the component manifests — so the list above is
hand-maintained and can rot silently. Check it by eye when a component starts or
stops owning its table.

A short paragraph directly after a table **is** promoted to a Below-Note (see
above), on `content` and on an un-classed slide alike — so a source line or a
caveat gets the hairline treatment for free.

---

## Universal variants

Opt-in via `_class:`. Compose with any layout. The full set is defined
in `lib/components/index.js` as `UNIVERSAL_GROUPS`.

### `dark`

Reskins the slide canvas using the palette's `--dark-*` tokens. The
same layout structure works on either canvas. The dark bookend layouts
(`title`, `divider`, `closing`) include `dark` in their default chrome.

```markdown
<!-- _class: content dark -->
```

### `light`

The mirror of `dark`: forces this slide to a **light** canvas
(`section.light { color-scheme: light }`), so the palette's `light-dark()`
surface tokens resolve to the light side no matter what — inside a dark deck
(`color-mode: dark`, a `-dark` theme, or a dark website mode) or not. Use it for a
bright slide amid dark ones. Deck-wide color mode is the first-class `color-mode:`
key (`light` · `dark` · `system` · `inherited` · `print` — the legacy
`class: dark`/`light`/`print` is a deprecated alias, and **the key wins over it**:
where a deck carries both, the alias is dropped, not merged). A per-slide
`_class: light` wins over the deck-wide color mode, so light and dark slides can
coexist. Light is already the default canvas, so `light` is only meaningful as an
*override* of a darker context.

```markdown
<!-- _class: content light -->
```

> **Universal:** `claim-quiet` / `claim-hero` let content claim the stage on
> **every** component (the `claim` concept, 2026-07-03 decision); `claim-bleed`
> is a semi-universal opt-out (prose-dense layouts exclude it). A chart at
> `claim-hero` additionally gets a chart-family full-bleed caption band — the
> treatment that the retired chart-only `cover` modifier used to provide.
> Don't confuse `claim-hero` with image's own **`full`** photo variant.

### `mirror`

Flips the asymmetric half of a layout left/right. Applies only where
the layout has an inherent left/right asymmetry — symmetric grids
ignore it.

| Layout | Effect |
|---|---|
| `image` | image slot flips from right (default) to left. Alias of legacy `image left`. |
| `split-panel` (all variants) | accent panel and supporting zone swap sides. |
| `compare-prose` | left and right cards swap; chosen/decision read from the left. |

```markdown
<!-- _class: image mirror -->
<!-- _class: compare-prose mirror chosen -->
```

`image left` is preserved as a deprecated alias for `image mirror`.
`mirror` composes with `full` and `contain` (e.g. `image full mirror`).

### `numbered`

Stamps the running section index as a **masthead**: a display numeral in the
top band on the divider's own left margin, with a hairline running right
underneath it that stops just past mid-canvas so the top-right corner stays
free for a deck logo.

The numeral is `--fs-hero` in `--font-display` at weight 700, no tracking —
the treatment every oversized mark in the engine takes. The two rungs follow
the on-dark ramp's own division of labour: `--on-dark-secondary` for the
numeral (text) and `--on-dark-ghost` for the hairline (a line), resetting to
`--text-secondary` / `--border` on `divider light`.

**It is pinned to the section, not to the heading, and that is load-bearing.**
The headline block is vertically centered, so it grows away from a mark in the
top band: the numeral holds the same position on every divider regardless of
how long the heading runs. Two alternatives were rendered and rejected on
exactly this — one locked into the headline block (it drifts 22% → 14% down
the canvas as the heading grows from one line to three) and one pinned
bottom-left (it holds position, but the block grows toward it and overlaps at
five lines).

**The band is reserved, so a long heading cannot climb into the mark.** Pinning alone
was not enough: a centered block grows in both directions, and at four lines its top
edge crossed the hairline and the numeral struck through the eyebrow. The slide now
reserves the mark's band with symmetric padding and centers the block with
`safe center`, which falls back to `start` exactly when the block would overflow. So the
top edge stops at the band and the growth goes downward.

Measure clearance against the mark's **painted** bottom edge — the numeral's pseudo is
`content-box`, so beneath its height sit the gap and the hairline itself, 21.48px at
1280x720. Against that edge: a heading of one or two lines renders byte-identically to
the unreserved build (the reservation is symmetric, so the block's midpoint does not
move); three lines shifts 6.14px down, because a 3-line block is taller than the band
and pins; from there on the block pins and clearance holds at +32.0px, which is `2.5cqi`
by construction and so the same at every size family.

`divider light` and `divider qr` need the band too. A light divider carrying the lede its
own subtitle rule styles sits at −15.2 without it, and `divider numbered qr` at −85.3 —
both +32.0 with it. The cost is that a block taller than the band stops centering on
those variants, and on `qr` the payload then sits 18.9px off the frame edge.

And a heading long enough to fill the band keeps going until it leaves the FRAME, which
the engine already knows how to say: the export prints `⚠ OVERFLOW`, tags the slide
"Content clipped" and the runtime rings it. The old failure was silent because a pseudo
lying on top of the copy is an overlap, and the overflow probe measures spill past the
frame. `review-core.js` warns one line earlier on the dark divider
(`divider-numbered-heading`, past ~128 characters of prose — a character count is a loose
proxy for line count, so wide-set text can clip without it firing).

```markdown
<!-- _class: divider numbered -->         → stamps "01", then "02", …
<!-- _class: divider light numbered -->   → same series, no restart
```

The number is stamped as `data-lat-section` by `lib/core/section-index.js` and read
with `attr()` — it is NOT a CSS counter, because a counter cannot count across Marp's
per-slide containers and produced `01` on every divider there. Authors do not number
sections manually. Where nothing stamps it (a surface that runs no script and that we
do not render ourselves, e.g. marp-cli's PDF output) the numeral does not draw at all,
which is deliberate: a blank mark is a gap you can see, a wrong one is not.

**It suppresses the running header and the footer** on the slides that carry
it. The masthead owns the top band, and a section start is the one slide that
does not need to be told which deck it is in. The page number is deliberately
untouched — it sits bottom-right, nowhere near the mark.

One consequence worth knowing before you reach for it: **a numbered divider
cannot carry a `_footer:` caption.** The component galleries label each variant
in the footer, so the two numbered slides in the baseline gallery are labelled
by their eyebrow instead. If a slide needs a visible footer, it cannot also be
`numbered`.

**A heading is required, and the count advances either way.** The numeral rides
the heading's pseudo, so a numbered divider with no heading paints nothing — but
it still increments the series, so the next divider reads one higher. A deck
that does this silently skips a number; `lint:deck` does not catch it.

The numeral rides the slide HEADING's `::after`, so a `numbered` slide needs
its heading — the required slot here anyway. It deliberately does NOT ride
`section::after`: that pseudo is the engine's page number, which `silent` /
`no-paginate` null and which the browser-path stylesheet reserves for the
pagination attribute. On the heading it composes cleanly — `divider silent
numbered` stamps the index with no other chrome, and a paginated `divider
numbered` keeps both the index and its page number.

### `silent`

Suppresses header, footer, and pagination on a single slide. Use on
bookend slides (`title`, `divider`, `closing`) where the dark canvas
should read uninterrupted, or to omit chrome from a single section
break.

```markdown
<!-- _class: title silent -->
```

Equivalent to writing all three Marp suppression directives
(`<!-- _paginate: false -->`, `<!-- _header: "" -->`,
`<!-- _footer: "" -->`) in one token.

### `sketch`

The hand-drawn **finish** — a deck-wide skin that swaps Lattice into a
hand-drawn register: felt-tip headings (`--sketch-font-display`, Caveat),
a legible hand-sans for prose (`--sketch-font-body`, Shantell Sans), and
the card surface of
**every card-style layout** (`cards-grid`, `cards-stack`, `verdict-grid`,
`decision`, `matrix-2x2`, `pricing`, `compare-prose`,
`citation-card`) redrawn as a sketched box — an asymmetric corner radius,
an offset "ink" stroke, and a fractional per-card tilt on the multi-card
grids. The same hand treatment reaches **every other structure that draws
its own lines**, and the LINES among them are real
[rough.js](https://roughjs.com) strokes rather than bent CSS: table frames +
row rules (`table`, `glossary`, `obligation-matrix`, `list-tabular`),
the `list.principles` rules, the `<hr>` divider, an agenda ledger's active
row, and — in place of a bespoke heading underline — the **masthead↔stage
divider** every Form slide already draws. Boxed blockquotes (`quote`,
`redline`) and bordered rows (`actors`, `list`, `checklist`, `agenda` cards
and rings) still bend a `border-radius`; they convert next. The
governing rule is *roughen the lines the deck draws, never invent a box* —
so structures that draw none (`big-number`, `stats` — pure centered type)
stay font-only, and content the slide merely contains (photos, real
`code`, chart/diagram SVG geometry) is left untouched. Where a structure
carries a meaning-bearing color (the per-actor hue, redline's add/remove
spine) the finish wobbles the corners but never recolours the border.
Every glyph of prose takes a hand face. The display numerals (`stats`,
`big-number`, `quote`, KPI heroes) ride the felt-tip via the `--font-display`
token; the label voice — eyebrows, table column headers, stat sub-labels,
KEY INSIGHT, the running header/footer, pagination, counters and card number
badges, BEFORE/AFTER and status chips, stamps, captions, chart legend values
and axis ticks — rides the hand sans via the `--font-label` seam; the slide's
default font goes hand too, so emphasis, links, and any stray prose follow
without enumeration; and label pills/badges ride the `--pill-font` seam.

What stays monospace is a closed, gated list: real inline `code` and `pre`,
math notation, error surfaces that quote your own source back at you, the
engine's authoring-diagnostic tabs, and the wifi password (which has to be
transcribable without ambiguity). A component may not simply *reach for*
`--font-mono` — `checkLabelVoiceFont` (`tools/check-ownership.js`) holds it to
that allowlist, because the wrong choice is invisible on every other theme:
`--font-label` **defaults to** `var(--font-mono)`, so the two render
identically until the finish is switched on. See
`engineering/decisions/2026-08-12-sketch-label-voice.md`.

One face is deliberately NOT reached: text inside a rendered **Mermaid**
diagram stays mono, a pre-existing divergence in the diagram theme-variable
path (`engineering/mermaid.md` §5.3), not something the finish can reach from
CSS.

It is the **`mode:` axis** — the deck's rendering *mode* (its typographic
hand), a sibling of the `finish:` backdrop within the Function · Form · Substance
· Finish model: it changes type and box geometry, never color. Every stroke
resolves through a palette token, so the style is **palette-blind** — pair it
with any theme and that theme colors it. The curated `carta` paper-and-ink
palette is the blessed pairing.

```yaml
---
theme: carta      # paper + ink; any palette works
mode: sketch     # deck-wide rendering mode — propagates to every slide
---
```

Or per slide: `<!-- _class: cards-grid sketch -->`.

### Front-matter registers — moved

The deck-level registers that used to live here — **`mode:`, `finish:`, `split:`,
`stamp:` / `tone:`, `spectrum:` / `spectrum-edge:`, `rule:`, `eyebrow:`,
`headline:`, `lift:`** and **`corners:`** — are in
**[`base.registers.docs.md`](base.registers.docs.md)**, with a table at the top
naming what each one selects and its default.

Nine of them were nested under `### sketch` above, which is a per-slide variant:
`mode: sketch` is how you turn sketch on deck-wide, so the first register landed
there fairly, and eight more followed it. Nothing about `headline:` or `lift:`
belongs under a section on handwriting, and the heading structure gave a reader
no way to find them.

**The per-slide `_class:` tokens went with them**, and HARD RULE #6 sends
`_class:` authoring to *this* file — so every one of them is listed here, by the
register it belongs to. Each is documented in
[`base.registers.docs.md`](base.registers.docs.md); this table exists so that a
`grep` of the file the rule names still finds the token you are about to write.

| Register | Per-slide `_class:` tokens |
|---|---|
| `mode:` | `sketch-clean-body` |
| `finish:` | `finish-atrium` · `finish-gallery` · `finish-halo` · `finish-ledger` · `finish-loom` · `finish-meridian` · `finish-nimbus` · `finish-none` · `finish-savile` · `finish-strata` |
| `stamp:` | `stamp-bar` · `stamp-bracket` · `stamp-dot` · `stamp-flag` · `stamp-mark` · `stamp-notch` · `stamp-pill` · `stamp-pin` · `stamp-ribbon` · `stamp-seal` · `stamp-tab` · `stamp-underline` · `stamp-veil` |
| `spectrum:` | `spectrum-card` · `spectrum-card-duo` · `spectrum-card-edge-bottom` · `spectrum-card-edge-right` · `spectrum-card-edge-top` · `spectrum-card-mono` · `spectrum-card-rainbow` · `spectrum-card-solid` · `spectrum-duo` · `spectrum-edge-bottom` · `spectrum-edge-left` · `spectrum-edge-off` · `spectrum-edge-right` · `spectrum-mono` · `spectrum-off` · `spectrum-solid` · `spectrum-trim` · `spectrum-trim-restrained` |
| `rule:` | `rule-accent` · `rule-full` · `rule-none` · `rule-short` |
| `eyebrow:` | `eyebrow-arrow` · `eyebrow-bar` · `eyebrow-dot` · `eyebrow-underline` |
| `headline:` | `head-center` · `head-left` · `head-right` |
| `lift:` | `lifted` |
| `corners:` | `corners-rounded` · `corners-square` |

An earlier version of this paragraph named eight of them and told you to grep the
folder instead. Both were wrong for the same reason: HARD RULE #6 says to open
*this* file, so a token that is not in it is not findable by someone following the
rule. Moving the registers out cost 38 of these tokens their only hit here, which
a checker pass caught — the list above is derived from the class names in
`lib/base/*.css` rather than hand-picked, so it is complete by construction as of
2026-08-30.

### `scale-l` / `scale-xl` / `scale-2xl`

Bump the readable fonts on the slide up in lockstep. The typography
tokens are normalized for desk-distance reading; these steps raise the
global `--fs-scale` multiplier so body, supporting headings (h3–h6),
hero, and chrome all grow together — proportions hold, only the magnitude
moves. **The two largest headings (`h1`, `h2`) stay fixed** so slide
titles don't balloon or wrap; the body grows toward them instead. Reach
for these when a deck is headed to a projector, a large room, or needs an
accessibility bump — not to fix one oversized element (use the right
token for that).

| Class | Scale | Body lands at |
|---|---|---|
| `scale-l`   | ×1.15 | ~18 pt |
| `scale-xl`  | ×1.3  | ~21 pt |
| `scale-2xl` | ×1.5  | 24 pt  |

Scope is native Marp class scoping — the same class does both:

```markdown
<!-- _class: cards-grid scale-xl -->   <!-- this slide only -->
```

```yaml
---
marp: true
class: scale-xl                        # whole deck (front-matter directive)
---
```

Composes with any layout or variant (`dark`, `cards-grid`, …) since it
only sets one custom property. If a slide overflows at a higher scale,
it had too much content for that magnitude — split it or step down.

Coverage: tables (cells + headers), code blocks, quote text, and KaTeX
math all scale, alongside body, lists, and cards. The one structure it
does **not** reach is a **Mermaid diagram** — mermaid renders its own SVG
text at a fixed size, so a scaled slide grows the title and prose around
the diagram but not the labels inside it. Full contract:
`engineering/typography.md` §7.

### `with-period` / `no-period`

Typography variant pair. Default behavior: layouts that end headings
with a period (the Lattice editorial convention) — but some layouts
default to no-period. The pair lets authors override on a per-slide
basis.

### Tone tokens — `tone-pass`, `tone-warn`, `tone-fail`, `tone-skip`

Apply a semantic tone to the slide's accent strip. Used to signal
overall slide status (e.g. `tone-pass` for an "all green" KPI slide,
`tone-fail` for an alert slide). The tone token sets the **color**; the
**shape** it paints in (rail / edge / glow) comes from the deck-wide `tone:`
register or a per-slide `tone-<style>` token — see *The `stamp:` / `tone:`
front-matter registers* in [`base.registers.docs.md`](base.registers.docs.md).

```markdown
<!-- _class: kpi tone-warn -->
```

### State markers — `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`

Six markers, each with **one meaning in every layout** — `checklist`,
`verdict-grid`, `pricing`, `obligation-matrix`, `roadmap`, a `state-cells`
table, and an inline mark in a sentence. Write one as a leading prefix on an
item (or alone in a table cell):

```markdown
- [x] Yes — done, met, included
- [-] Partly — in progress, limited, qualified
- [!] No — failed, not met, missing
- [?] Unknown — somebody looked; the answer cannot be settled yet
- [ ] Open — not started, not assessed
- [/] Does not apply — out of scope, waived
```

| Marker | Class | Drawing | Answer |
|---|---|---|---|
| `[x]` | `state pass state-full` | check on a solid green disc | yes |
| `[-]` | `state warn state-half` | dash on a solid amber disc | partly |
| `[!]` | `state fail state-empty` | ✕ on a solid red disc | no |
| `[?]` | `state unknown state-unknown` | drawn `?` in a hollow gray ring | unknown |
| `[ ]` | `state todo state-todo` | hollow gray ring, empty | open |
| `[/]` | `state skip state-slashed` | slash on a solid gray disc, label struck | does not apply |

Three rules keep the six readable:

- **Shape carries the meaning.** Every answer has its own shape, so the marks
  parse in grayscale and for a color-blind reader; color is the redundant
  channel.
- **Fill says whether the answer is settled.** The findings (yes, partly, no)
  and *does not apply* are solid discs. The two unsettled answers — unknown and
  open — are hollow rings, told apart by the drawn `?`.
- **A layout supplies the WORDS, never the meaning.** Each layout names the
  answers in its own register (a roadmap says *missed* for `[!]`, pricing says
  *coming* for `[ ]`), through its key, label set and narration. The answer
  itself is the same on every slide.

`[ ]` used to read by layout — a red ✕ "not met" in verdict-grid and an open
ring everywhere else — so one keystroke drew opposite answers on two slides of a
deck. "No" is `[!]` now, everywhere. The record, including the per-layout words:
`engineering/decisions/2026-09-24-six-state-marks.md`.

Only these six forms are markers. `[X]` is not one: GitHub-flavored markdown
reads it as a *checked* box, the opposite of what a cross suggests.

**Style variants (`checks-*`).** The disc treatment is one of five
boardroom-ready styles, switchable per slide (`_class: checklist
checks-outline`) or per deck (`class: checks-bold`). The marks and
status colors never change — only the disc presentation:

| Variant | Disc treatment |
|---|---|
| *(default)* / `checks-ringed` | saturated fill + hairline darker ring; knockout mark. Stays crisp on its own status-tinted row. |
| `checks-knockout` | flat saturated fill, knockout mark. Cleanest/classic. |
| `checks-bold` | larger disc + heavier marks, knockout. Reads across a room. |
| `checks-outline` | transparent fill + ring + status-color mark. Editorial, low-ink. |
| `checks-tonal` | soft tint fill + ring + status-color mark. Calm; best on plain (non-tinted) backgrounds. |

Each variant flips only scalar CSS knobs (`--state-fill-pct`,
`--state-ring-*`, `--state-mark-pct`, `--state-disc-scale`) at section
scope; the leaf disc mixes the actual colors from `--state-color` +
`--bg`, so variants stay theme-aware. See `base.modifiers.css`. The two
hollow rings ignore the fill knob in every variant, and `[?]` paints its `?` in
the ring's own ink — a knockout mark would vanish on an empty disc.

**Theme tokens:** `--pass`, `--warn`, `--fail` (disc fill + ring + left
bar) and `--muted-mark` — which carries the `[?]` and `[ ]` rings and the `[/]`
mark, because each is a SHAPE and so takes the 3:1 graphical tier rather than a
text one. The skipped mark read `--text-muted` until #1715 split that token's two
roles; the open ring read `--text-label` until #1821, when #1801 restored that
token to accent-hued emphasis and took the supposedly-neutral ring with it.
Sharing one ink is deliberate and safe here precisely because the three are told
apart by shape, not color: the open ring is empty, the unknown ring carries a
`?`, and `[/]` is a filled disc with a slash and a struck-through label. Plus
`--pass-bg` / `--warn-bg` / `--fail-bg` (10% color-mix row tints). The mark
*shapes* are the shared masks `--mark-check` / `--mark-dash` / `--mark-x` /
`--mark-question` / `--mark-slash` (each with a `-bold` sibling for
`checks-bold`); the open `[ ]` uses no mask — it's a hollow ring. The knockout
mark uses `--bg` (the canvas), so it adapts to light/dark and to each theme. All
foreground tokens meet WCAG AA on body backgrounds. The `.heat` modifier remaps
`--state-color` to the load/risk axis and the discs follow; it leaves the two
hollow rings neutral.

**Implementation contract:** the marker grammar AND its meaning live in one
kernel, `lib/core/state-marks.js` — `MARKER_CLASS`, `LEADING_MARKER_RE` and
`stateClassesFor`. Every consumer builds its pattern from that kernel: the
engine (`lib/integrations/markdown-it/plugins.js`), the VS Code / export-to-Marp
runtime (`lib/runtime/index.js`), roadmap's transform, the table row-label
heuristic, and the docs-site Compose editor. Each strips the marker and adds
`class="state {sem} {shape}"` (a `badge` span on verdict-grid and pricing rows).
A unit test fails on a private copy of the marker class. Two consumers cannot
import the kernel and are pinned to it by test instead: the linter
(`lib/authoring/lint-core.js`, which runs in the browser and stays require-free)
only names markers in its advice, and the narration projection
(`lib/transformers/prose-projection.mjs`, a standalone bundle) keeps its own copy
of the spoken words. CSS owns all visual chrome: the disc (`::before`) and the
masked mark (`::after`).

### Treatments — `tint-*` and `mark-*`

27 utility classes for peripheral atmospheric accents — 12 tints
(gradient washes, vignettes) and 11 marks (SVG accent shapes), plus a
`treatment-none` reset. `tint-corner` and `tint-edge` carry a placement
axis (`at-tl`, `at-top`, etc.). All palette-blind via `var(--accent)`
so palette swap = treatment color swap.

```markdown
<!-- _class: content tint-corner at-tl -->
<!-- _class: divider mark-orbit -->
<!-- _class: closing tint-vignette -->
```

Available classes: `treatment-none`, `tint-corner at-tl`, `mark-orbit`,
`tint-vignette`, `tint-edge at-right`, `mark-threads`, plus 21 more.

### Focus & highlighting — `_focus:`

Tell a dense slide to focus the room on one thing. `_focus:` names an
**ordinal target** with one grammar that works on any focusable surface;
the engine tags the target and the treatment is pure CSS, palette-blind,
and identical in PDF, PPTX, and HTML (the dim/ring survives because PPTX
rasterises the rendered slide).

```markdown
<!-- _class: table -->
<!-- _focus: row 4 -->        <!-- a table body row -->

<!-- _focus: col 5 -->        <!-- a column -->
<!-- _focus: cell 4,5 -->     <!-- one cell: row 4, column 5 -->
<!-- _focus: item 3 -->       <!-- a list / card-grid item -->
<!-- _focus: line 8-9 -->     <!-- code lines (a range) -->
<!-- _focus: row 2, row 5 --> <!-- two targets -->
<!-- _focus: item 2-4 -->     <!-- a range -->
<!-- _focus: mark 3 -->       <!-- a chart mark: the 3rd bar, wedge, band, cell or state -->
<!-- _focus: series 2 -->     <!-- a chart series: the 2nd line, radar polygon -->
```

The universal form is **`_focus: <axis> <ordinal>`** (ordinals count from
1). Axes by surface: `item` (lists, card grids), `row` / `col` / `cell`
(tables), `line` (code), `mark` / `series` (charts).

**On a chart, the mark is the address.** Every chart stamps its marks with
their place (`data-mark`) and its series shapes with theirs (`data-series`),
so `mark N` names the Nth item in the order you wrote the list, and
`series N` names the Nth series under each category. Nothing is tagged by
hand, and the same line works on bar, pie, funnel, waterfall, heatmap,
gantt, state-chart, stacked-bar, scatter, slope, quadrant, bullet, map and
radar (`mark`), and line and radar (`series`). Scatter and slope take `mark`
only: a scatter's series is its dots, which carry no series index, and slope
numbers its lines by palette slot rather than by entity. The default
look is spotlight, and a receded mark keeps 40% rather than text's 24%,
because a chart's other marks are the context the focused one is read
against. A focused line also gains weight. `_focusStyle: ring` keeps every
mark at full strength and edges the focused one in the accent. Worked deck:
`examples/focus-chart-marks.md`.

**Look — content-aware by default.** Tables get a **ring** (an accent
outline; nothing is dimmed, so the comparison stays legible). Lists, grids,
and code get **spotlight** (the rest recedes, the target stays full).
Override per slide with `_focusStyle`:

```markdown
<!-- _focusStyle: spotlight -->   <!-- recede the rest (dim) -->
<!-- _focusStyle: blur -->        <!-- recede the rest (defocus — the camera-focus look) -->
<!-- _focusStyle: ring -->        <!-- outline the target, no dimming -->
<!-- _focusStyle: list-fill -->   <!-- accent-soft fill on the target -->
<!-- _focusStyle: pop -->         <!-- lift the target forward; rest stays legible -->
```

`blur` survives PDF and PPTX (the rest is rasterised soft, the target stays
sharp). On a list/grid it also gives the target a subtle lift (a slight scale +
a hard accent edge — hard-edged so it survives Apple PDFKit). Tune the radius
per deck via `--focus-blur` (default `0.15cqi`) and the lift via `--focus-pop`.

**Walk the slide — `_focusSteps`.** One authored slide expands into N
rendered slides, each focusing the next target — the static-format
equivalent of a live build:

```markdown
<!-- _class: cards-grid -->
<!-- _focusSteps: item 1 | item 2 | item 3 | item 4 -->
```

Each step is a `_focus` spec; the steps render as ordinary, separately
paginated slides. Worked deck: `examples/focus.md`. Design + rationale:
`engineering/decisions/2026-06-16-focus-highlighting.md`. (The grammar is
linted — a typo like `_focus: rows 4` or `_focusStyle: glow` is flagged
before render. Note: focus resolves on the engine render paths — the
emulator PDF/PPTX/HTML and the docs playground — and in published HTML; the
live VS Code Marp preview, which doesn't run the Lattice slide pipeline,
does not resolve `_focus`.)

### Narrative build — `_build`

Walk a slide one beat at a time. `_build` opts a slide into **progressive
disclosure** — its units appear step by step instead of all at once. It's
"`_focus` sequenced over time", so the grammar is a strict subset of `_focus`
(axis + grouping), derived from the slide's own structure — no per-element
authoring.

```markdown
<!-- _build -->            one step per item of the primary collection (default axis)
<!-- _build: rows -->      pick the axis: item (default) · row · col · line
<!-- _build: 1, 2-3, 4 --> group units into steps (step 2 reveals units 2 AND 3)
<!-- _build: none -->      opt this slide OUT (e.g. when a deck builds by default)
```

Axes by surface mirror `_focus`: `item` (lists, card grids), `row` / `col`
(tables), `line` (code). **Document order is the step order**; ungrouped units in
a grouped build show from step 1 (context).

**The reveal is pure CSS, and it degrades losslessly.** The engine only *tags*
each unit (`data-build-step`); a slide shows its full self unless a player is
actively driving the build, so **every PDF and every non-driven render is
byte-identical to the same slide with no `_build`** — the build is an enhancement
for the live walk-through, never the artifact. Live stepping (Present mode) and a
per-step overlay PDF export are staged follow-ons.

This is progressive disclosure (Beamer overlays / scrollytelling), **not**
PowerPoint animation: motion is derived, typed, meaning-bearing, and
print-faithful — there is deliberately no fly-in/spin/easing vocabulary. A build
is for genuine narrative sequence, not for drip-feeding an overstuffed slide.
Worked deck: `examples/build.md`. Design: `engineering/decisions/2026-06-16-narrative-step-spec.md`
(+ the model ADR `…-narrative-step-model.md`). Like `_focus`, `_build` resolves on
the engine render paths and in published HTML; the live VS Code Marp preview does
not run the Lattice pipeline, so it does not resolve `_build`.

### Custom logo

A discreet author-supplied brand mark, top-right corner of every
slide. A build-stage rewriter injects `<img class="deck-logo"
src="…">` as the first child of each selected `<section>` — same
shape Marp uses for `<header>` and `<footer>`. CSS desaturates the
img to a faint grayscale watermark via `filter: grayscale(1)`,
inverting the brightness on a DARK CANVAS so the mark stays legible on
every theme without per-author light/dark variants. Works on SVG, PNG,
and JPEG.

The flip is a token the canvas sets, not a list of layouts. `img.deck-logo`
reads `filter: var(--deck-logo-filter, <light-canvas default>)`, and every
rule that declares `color-scheme: dark` for a canvas sets
`--deck-logo-filter: var(--deck-logo-filter-inverse)` beside it; `.print`
gives the token back, because paper is a light ground. This used to name
`.title`, `.divider`, `.closing`, `.dark` — LAYOUT classes, which agree with
the canvas only while those layouts are always dark. They are not:
`divider light` replaces the canvas and the print band remaps it, and on
both the mark rendered light-gray on a light ground and disappeared (#2149).
A theme retunes the flip with `:root { --deck-logo-filter-inverse: … }`.

**A dark THEME is a canvas too, and no class carries it.** A `-dark` theme's
whole content is `color-scheme: dark` at the root — it never touches a slide
class, so every class-keyed rule above is blind to it, and the mark rendered at
the canvas's own lightness: not an error, not missing, just a slide that looks
as though it has no logo (#2156). `section[data-theme$="-dark"]` reaches it on
the theme's own name, declared ABOVE the per-slide rules so `light`,
`color-light` and `print` still win — a slide pinned light inside a dark deck
takes the light mark. The suffix is a convention, and
`test/unit/theme/dark-theme-logo-token.test.js` holds it: all 14 themes with
`role: variant-dark` are named `*-dark`, and nothing else is.

**That gate reaches SHIPPED manifests only, and one surface is outside it.**
The docs Studio registers a FABRICATED theme under whatever full name the user
gave it (`docs/src/lib/deck-theme.ts`), and that name may legitimately end in
`-dark` without the palette being dark — or be a genuinely dark palette named
without the suffix. Either way the mark is derived from the name rather than
from the ground, and no gate can see it, because the theme does not exist until
someone makes one. The equality above is a property of `themes/`, not of the
selector. Reading the declared ROLE instead of the name would close it, and
`checkThemeOwnership` is what currently prevents that: a `variant-dark` wrapper
"only pins the canvas", so it may not declare the token itself.

**And a light slide gives the token back.** `dark light` and
`divider light dark` are reachable by hand and deliberately un-linted; before
this the scheme and the ground went light while the INVERSE filter survived, so
the mark came out brightened at 0.45 opacity on white. `section.light` and
`section.color-light` now reset the token exactly as `.print` does.

**A bookend is a dark panel even when the slide is pinned light.**
`section:is(.title, .closing):not(.print)` forces `color-scheme: dark` at (0,2,1),
so a hand-authored `title light dark` renders dark and takes the inverse mark. The
exported player has to be told that separately — it rebuilds dark from flat rules
and has no cascade to consult — and until it was, such a slide came out white ink
on a white ground, 1.00:1.

One canvas is genuinely unanswerable, and one is not:

- `color-mode: inherited` takes its scheme from the deck root, which on a `-dark`
  theme is that theme. Knowable, so it gets the flip.
- `color-mode: system` defers to the reader's OS. A PDF rendered headless resolves
  light; the exported player resolves dark. No single treatment is right on both,
  so it keeps the light-canvas mark and is wrong on a dark OS.
- A full-bleed cover photograph has a lightness no token describes.

```yaml
---
logo: lattice                     # a built-in name, or a path / URL of your own
logo-style: auto | brand          # optional, default `auto`
logo-on: all | title              # optional, default `all`
---
```

**A name, or a path — and the difference decides where your deck works.**
`logo: lattice` is a BUILT-IN: the engine inlines Lattice's own mark, so it
paints on every surface — the CLI, the Playground, the Studio, an exported
`.html` opened offline, a phone. It is the only built-in, deliberately.

Anything else is taken literally, and a PATH only means something where the
deck FILE is. `logo: ./acme-logo.svg` resolves for the CLI, which knows the
`.md`'s directory; in the Studio and the Playground there is no file, so the
same line 404s — and a failed image load stops the PDF export outright (it
says so now). For your own mark on a web surface, give a URL the viewer can
fetch, or a `data:` URI.

A real DOM element (rather than a `::before` pseudo) is what lets
the logo compose with every treatment — tints
(`tint-sweep`, `tint-spotlight`, `tint-corner at-tl`, `tint-vignette`, …) and
marks alike (`mark-orbit`, `mark-asterisks`,
`mark-grid`, `mark-chevron`, …). Each layer paints
independently.

**Three render paths must agree:**

1. `lib/engine` — `applyDeckLogoToHtml(html, markdown)` runs in
   the `render()` wrapper alongside `applyChartFamilyToHtml`.
2. `lattice-emulator.js` — `require()`s the same helper from
   `lib/engine` and calls it on the assembled HTML.
3. `lattice-runtime.js` — `applyDeckLogoFromFrontMatter()` mirrors
   the same DOM injection at view time for published HTML decks.

⚠️ **Build-time only for marp-vscode preview.** The extension doesn't
run the engine's plugins, so the logo does not appear
there. The runtime path covers exported HTML viewed in a browser but
gracefully no-ops in the vscode-webview sandbox (fetch can't reach
workspace files). Same constraint `class: dark` has — see
`engineering/gotchas.md`.

**Brand style.** `logo-style: brand` adds `deck-logo-brand` to the
injected img. The silhouette mask is removed; the logo's original
colors render directly on a soft `--bg-alt` plate. Use when the
brand's colors carry meaning (government insignia, university
crests); reach for `auto` otherwise.

---

## Inline pills — `{LABEL}`

**Turning the grammar off:** `inline-code: literal` in front matter makes every
single-backtick span in the deck literal — pills, marks and all, including any in the
deck's own `header:` / `footer:`. One slide at a time is
`<!-- _class: inline-code-literal -->`. It is the switch for a
deck you did not write, where `` `[x]` `` in prose was never meant to draw anything. See
[`base.registers.docs.md`](base.registers.docs.md) § `inline-code:`; the Studio carries it
as **Deck settings · General · Inline pills and marks**.

A `{LABEL}` inside **single-backtick** inline code renders as a pill. Shape and color
belong to the value, not to the slide — one ledger can carry four different statuses
without any variant class on the section.

```markdown
1. Settlement engine
   - Shipped and load-tested `{STABLE}:c2`
2. Ledger migration
   - Cutover paused for review `{PARTIAL}:c4`
```

### Shape

`:tag` · `:tag-bordered` · `:chip` · `:circle` · `:chevron-right` · `:chevron-left` ·
`:diamond`. With no shape modifier you get the capsule `pill`.

Every shape is exactly as tall as the capsule, so pills of different shapes share one
center line and never make a row or a line of prose taller. `circle` is a
capsule-height disc and `diamond` a capsule-height rhombus, so they hold **one
character, or a number up to two digits** — `{3}:circle`, `{12}:circle`, `{!}:diamond`. The clipped shapes (the chevrons and the diamond)
carry the same 1px edge as the rest. The label is centered on its capitals, not on the
line box, so it sits on the pill's visual center in Chrome, Firefox and Safari alike;
lowercase descenders hang into the bottom padding. Anything longer stretches the box until
it stops reading as the shape (`{OK}:circle` is an oval, `{WM}:circle` a capsule), so
`lint:deck` **warns** (`pill-shape-crowded`), the editor underlines the pill, and the fix
points at `:tag` or `:chip`. It never blocks a deck.

### Color — `:c1` … `:c12`

Ordinal slots onto the categorical tokens, **not color names**. The same slot is sky
blue on `indaco` and deep red on `burgundy`, so a slot picks contrast, never meaning —
never write `:c2` because "green means good". Text contrast comes from the categorical
policy already in the engine, so a slot needs no per-pill contrast math.

### Size — automatic, then `:sm` `:lg`

A pill sizes itself from the text it sits in, so most pills need no size modifier:

| Where the pill sits | Size |
|---|---|
| A heading or other large text (`#`, `##`, a title slide, a lead or emphasis paragraph) | Half the text's size: large in a title, a step up in a slide title. Text under about twice the pill size, such as an `###` subheading, keeps the usual size |
| Body text, lists, cards, table cells | The metadata size, as always |
| A below-note, a chart caption or a figure caption | Small |
| Footers, headers and other small print | Small, 0.85 of the text around it |

`:sm` and `:lg` still work, and they scale whatever the context gave: `:lg` in a
footer is a bigger footer pill, not a heading-sized one.

Modifier order is free: `` `{X}:tag:c4:lg` `` and `` `{X}:lg:c4:tag` `` are the same pill.

### What stays literal

Plain inline code is untouched — `` `getUserId()` ``, `` `:root` ``, `` `[data-mark]` ``,
`` `--accent` ``, `` `{ ok, scene }` ``. A pill needs a brace pair whose label is
trimmed and comma-free, which is what separates a label from a JS object literal an
author wrote as code.

An unknown or repeated modifier fails back to literal rather than being ignored:
`` `{X}:c13` `` renders as code, visibly wrong in review, instead of quietly becoming a
pill the author did not ask for.

To force the literal for a label that WOULD qualify, put a **backslash** in front:
`` `\{LIVE}` `` renders as `{LIVE}`, and `` `\[x]` `` renders as `[x]`.

The backslash is only an escape when what follows would actually have become a pill or
a mark, so a regex is safe: `` `\[a-z]` `` and `` `\d+` `` are untouched and keep their
backslash.

**Fenced and indented code blocks are never touched at all** — they are not inline code,
so nothing in them is ever read as a directive.

### Where a pill can go

Anywhere inline code can — verified on a real render: a heading, a paragraph,
mid-sentence, a blockquote, a table cell, a footer, and a list row's clause. A fenced
` ``` ` block is not inline code and is never touched.

In a **`list-tabular` row** a pill takes the same cell a trailing `` `code` `` takes, so
`` 1. cards-grid `{STABLE}:c2` `` puts the pill in the trailing column. Two limits, both
measured:

- **`spec`** addresses its two codes by position among `code` elements, which cannot see
  a pill. A `spec` row whose trailing chip is a pill works; one whose **key** is a pill
  does not — the key stays in the trailing column.
- **Two trailing items in one row overlap**, e.g. `` 1. Name `META` `{PILL}` ``. That is
  not about pills: two plain `` `code` `` values do the same, because the row is a grid
  and a grid item paints over rather than pushing. Put one value in the trailing slot.

## Inline state marks — `` `[x]` ``

The same six markers an author writes bare at the start of a bullet — `[x]` `[-]`
`[!]` `[?]` `[ ]` `[/]` — draw the same disc when written inside **single-backtick**
inline code, anywhere inline code can go:

```markdown
1. Settlement engine
   - Signed by both parties `[x]`
2. Ledger migration
   - Cutover paused `[-]`
```

**Brackets make a mark, braces make a pill.** One vocabulary in two positions rather
than two vocabularies — bare at a bullet's start for a checklist row, inside inline code
for a mark in a sentence, a heading, a table cell or a row's trailing column.

The mark carries its name on `role="img"` + `aria-label`, so a screen reader says "yes"
(or "partly", "no", "unknown", "open", "does not apply") and the document holds no extra word. Every `checks-*` style variant reaches an inline
mark, because it uses the same `state` / semantic / shape classes a checklist row does.

**Only the six exact forms dispatch.** `` `[data-mark]` ``, `` `[0]` ``, `` `[~]` ``
and `` `[X]` `` all stay literal — the grammar is deliberately narrow, because `[` also
opens a CSS attribute selector, an array index and a citation.

### `{x}` is not a checkbox

Braces make a pill, so `` `{x}` `` would be a pill containing the letter `x`. The six
markers are **reserved** inside `{}` and render literal, with a `lint:deck` suggestion
pointing at `` `[x]` `` — the bracket form above.

## Composition syntax

Modifiers compose space-separated after the layout name.

```markdown
<!-- _class: cards-grid compact dark -->
<!-- _class: closing accent -->
<!-- _class: list-steps phase -->
```

**Cascade rule:** when two modifiers tune the same variable (e.g.
`scale-l scale-xl`), the stylesheet's order decides, not the order you write
them in — so `scale-xl scale-l` still renders at the xl size. Write one. When modifiers tune
disjoint properties (e.g. `compact dark`), they compose without
conflict.

### The three spellings of `class:`

They look interchangeable and are not. Which one you reach for decides whether a
slide can override it, and whether it may name a component at all.

| Spelling | Scope | A slide's own `_class:` | May name a component |
|---|---|---|---|
| `class:` in **front matter** | the whole deck | **composes** — the deck's tokens are appended to the slide's | **no** |
| `<!-- class: … -->` **mid-deck** | from that slide to the end, or the next one | **replaces** it for that slide | yes |
| `<!-- _class: … -->` | that slide | — | yes |

The front-matter register is appended to **every** slide, including one that
names its own layout — that is what makes `class: no-note` or `class: safe`
useful. It is also why it may not name a component: `class: kpi` plus a slide's
own `_class: cards-grid` would leave two layouts on one section, with CSS source
order picking the winner. A component name there is **ignored**, and the deck
linter says so (`deck-wide-component`). Name the layout per slide, or once for a
run of them:

```markdown
<!-- class: diagram -->        ← every slide from here is a diagram slide…
<!-- _class: closing -->       ← …until one says otherwise
```

**Color is the deck's `color-mode:` key, and it wins.** `class: dark` /
`light` / `print` in front matter is the legacy alias for the same axis; when
`color-mode:` is present, the alias is dropped rather than merged, so a
half-migrated deck cannot render one canvas and bake its diagrams for another.
A per-slide `_class: dark` still wins for that slide, and a mid-deck
`<!-- class: dark -->` still switches the canvas from there on.

---

## Accessibility — tracked changes (`<ins>` / `<del>`)

Markdown has no syntax for an insertion, so a tracked change is authored as
literal HTML — and that is the right thing to write:

```markdown
> A business that <del>collects</del> <ins>collects, sells, or shares</ins>
> consumers' personal information shall provide at least one designated method.
```

`~~text~~` also works for a deletion (it renders `<s>`, which `redline` styles
identically to `<del>`). There is no equivalent for an insertion, and `<s>`
means "no longer accurate" rather than "deleted", so prefer `<del>` where the
distinction matters.

**Write the elements and stop there — do not add your own "deleted:" wording.**
The tags carry the meaning: a browser exposes them as the `insertion` and
`deletion` roles, and a screen reader announces the boundaries from that. Orca,
for one, speaks "deletion start … deletion end" around the text by default, and
lets a reader turn that off. Literal text saying the same thing is heard twice
by anyone whose reader already announces it, and cannot be turned off by anyone
who has asked for less. We built exactly that and removed it before it shipped —
`engineering/decisions/2026-08-26-tracked-change-announcement.md` has the
measurements.

**Mentioning a tag is not writing one.** Backtick a tag you are talking ABOUT —
`` `<ins>` `` — or the engine renders it as a live element and the word
disappears from your sentence. This is a mistake the component's own docs made.

The distinction is never carried by color alone: `<ins>` is underlined and
`<del>` struck through, in addition to their hues, so both read without color
perception and both survive a grayscale print.

## Accessibility — color-vision-deficiency themes (`a11y-*`)

Color-vision-deficiency (CVD) accommodation is delivered as four **first-class
themes** — pick one exactly like any theme:

```yaml
---
theme: a11y-deuteranopia   # or a11y-protanopia | a11y-tritanopia | a11y-achromatopsia
---
```

They're selectable in the Drawing Board theme picker too (grouped under
**Accessibility**). There is no separate accessibility axis, `accessibility:`
directive, or override resolver — an accessibility need is met by **choosing the
theme**.

The four are **mode-invariant**: each is a fixed palette that ignores the
light/dark toggle, so an accessibility render reads identically for every viewer.
They share `themes/a11y-base.css` (the texture wiring + grayscale categorical
ramp + the forced light scheme); each theme file adds only its **status trio**
(`pass`/`warn`/`fail`, moved off that deficiency's confusion axis). The texture
`<pattern>` `<defs>` the fills reference are emitted by the engine on every
render (`lib/core/accessibility-textures.js`).

Because color alone distinguishes only ~1–2 categories under dichromacy, the
themes do **not** rely on recolouring. They pair the CVD-tuned **status colors**
with three redundant, non-color channels that carry meaning when color collapses:

- **Status glyphs** — `✓` / `!` / `✗` prefix the status-pill vocabulary.
- **Categorical textures** — a distinct pattern (diagonal, dots, grid, chevron,
  rings, checker, …) per categorical slot on diagram and chart fills, including
  the Mermaid pie.
- **Line-styles** — a per-series `stroke-dasharray` (solid / dashed / dotted / …)
  on multi-series line charts (radar), where a fill texture doesn't apply.

Authors write decks normally — no per-slide markup. `achromatopsia` leans
entirely on glyphs + textures + line-styles (its status trio is
luminance-separated grays) — the same channels that survive black-and-white print.
Design + rationale: `engineering/decisions/2026-06-16-colour-blindness-accessibility.md`
and `…-cvd-redundant-encoding.md`.

---

## Related

- `base.registers.docs.md` — the ten deck-level front-matter registers
  (`mode:` `finish:` `split:` `stamp:`/`tone:` `spectrum:` `rule:` `eyebrow:`
  `headline:` `lift:` `corners:`) and their per-slide tokens.

- `design/design-system.md §6.5` — the variant tier system (universal,
  semi-universal, layout-specific) and the rules manifests follow.
- `lib/shared/shared.docs.md` — the semi-universal modifiers
  (`compact`, `loose`, `accent`) that compose with most layouts.
- `lib/components/<name>/<name>.docs.md` — per-component contracts
  including layout-specific variants.
