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
| `base.finish.css` | The `field` zone of the Finish family — 9 premium **stacked-layer** finish presets (`finish-atrium/meridian/strata/halo/ledger/nimbus/loom/savile/gallery`) on a per-role custom-property compositor (`--fin-wash`/`--fin-texture`/`--fin-mark`/`--fin-edge`), so layers combine by z-index instead of being either/or. `finish-none` (or back-compat `backdrop-none`) opts a slide out. **Rich-on-screen / safe-on-export:** each preset's slot DEFAULT is the richer "dissolving" screen look (directional fades to `transparent` — alpha the browser composites cleanly), with an `--fin-*-opaque` mirror holding the PDF-clean opaque value (every full-bleed fade ends on `var(--fin-canvas)`). One guarded block flips the slots to the opaque mirror for BOTH export paths — `@media print` (CLI vector PDF) and `.lattice-exporting` (the Studio html-to-image raster tags each section before capture) — so the screen is rich while every PDF/PPTX stays opaque-clean (an alpha area-fade bakes to a gray cloud in print-to-PDF). Both faces are palette-blind (`color-mix(var(--accent)/var(--fin-canvas))`), no masks, no `url()`; only the screen face uses alpha. **`--fin-canvas` is the surface THIS SLIDE paints** — `var(--bg)` by default, `--surface-inverse` on the three inverse bookends, which is what keeps a finish from washing out a title/closing/divider (#1656). Selected deck-wide via the `finish:` register or per-slide via `_class: finish finish-<name>`. See `engineering/decisions/2026-06-30-finish-the-surface-layer.md`. |

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
- **Playback + accessibility for free.** An animated chart runs through the same host as an Anima `scene`, so it gets the corner playback control (pause / play / replay), honors the viewer's `prefers-reduced-motion` (dropping to the safe, legible build), and pauses off-screen. Bound the policy per slide/deck with `data-scene-motion` (`still` / `legible`).
- **Funnel + pie today.** The remaining SVG charts (quadrant, radar, map) follow as each gets its choreography defaults and a real-surface check; the gradient-fill plumbing they share is now fixed (their `url(#…)` fills would namespace the same way), though not yet verified on those charts.

See `engineering/decisions/2026-07-19-anima-svg-first-cut-zdog.md` §0.75.

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
`list-criteria`, `list-steps`, `list-tabular`, `split-panel`, `timeline`,
`principles`.

Each layout owns its own counter style (corner tag, header pill, mono
rail, "STEP 01" prefix, large accent block, circle node — see each
component's `<name>.docs.md`).

---

## Tables

A plain GFM pipe table written at the top level of the slide body gets a house
treatment — no class needed. It renders with label-cased column heads over the
spectrum rule, hairline row rules, a quiet accent zebra, and compact cell type.

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
pair. Neither reaches a component that owns its own table.

```markdown
<!-- _class: table-plain table-fill -->
```

### A third switch — `state-cells`, for status in cells

`state-cells` is not a look; it changes what the table's cells MEAN. It opts the
slide into the universal state-marker decoding — `[x]` `[-]` `[ ]` `[/]` become
the color-blind-safe status disc — which `obligation-matrix` and `matrix-grid`
get by layout and every other table used to go without.

That gap is why so many comparison tables were typed with a `✓`. A typed check is
not a shape we draw: the deck's type family carries no glyph for it, so the
renderer falls back to whatever font that machine has, or to a color emoji that
ignores the palette, or to a hollow box (HARD RULE #29). The disc is drawn from a
mask, takes the status color from the theme, and — because each state has a
DISTINCT shape, not just a distinct hue — still parses in grayscale and for a
color-blind reader.

```markdown
<!-- _class: compare-table state-cells -->

## Where each tool actually lands.

| Criterion    | Chorus | Productboard | Notion | Sprig + Log |
| ------------ | :----: | :----------: | :----: | :---------: |
| Speed        | [x]    | [ ]          | [x]    | [x]         |
| Auditability | [ ]    | [x]          | [x]    | [x]         |
| Calibration  | [ ]    | [-]          | [ ]    | [x]         |
```

`[ ]` reads NEUTRAL in a cell — a true hollow ring, "not this one" rather than
"failed" — matching `obligation-matrix`, not `verdict-grid`. Every `checks-*`
style variant and `heat` works on it unchanged. A trailing label in the cell
(`[x] Certified`) is hidden, so the column header carries the meaning.

```css
/* or deck-wide, with no class on any slide */
:root { --table-zebra: transparent; }
```

**Where it does NOT apply.** Base stands off wherever a component owns the
table, and it only reaches the slide body's own top level:

| Not treated | Why |
| --- | --- |
| `compare-table` · `glossary` · `obligation-matrix` · `roadmap` · `matrix-grid` | the component styles its own table |
| `math derivation` · `statute-stack lane` | same, but only under that variant — a bare `math` or `statute-stack` slide DOES get the treatment |
| a table inside `split-panel`, `split-compare`, `compare-code` or `image` | it lands in a side frame, not the slide body's top level |
| a table a chart transform generated | it is wrapped in a `<figure>`, and belongs to the chart |

Reach for one of the owning components when the table IS the slide — they carry
row capacity, autosplit and the portrait card reshape that a plain table does
not. The universal treatment is for a table that *supports* prose.

`checkUniversalTableGuard` fails the build if that list and the engine's CSS
ever disagree, in either direction and at variant granularity.

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
row rules (`compare-table`, `glossary`, `obligation-matrix`, `list-tabular`),
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

### State markers — `[x]`, `[-]`, `[ ]`, `[/]`

Four layouts — `checklist`, `verdict-grid`, `obligation-matrix`, and
`roadmap` — accept state markers as a leading prefix on each item (or
table cell). The marker syntax, color tokens, and **marks** are unified
so authors learn one vocabulary; three of the four markers render
identically everywhere, and the fourth (`[ ]`) reads by local meaning.

```markdown
- [x] Done — succeeded / chosen
- [-] Partial — caveat / partial success
- [ ] Todo — not yet started (neutral); "not met" only in verdict-grid
- [/] Out of scope — waived / N/A
```

Each marker is a **status-colored circle carrying a distinct mark**. The
mark *shape* carries the meaning independently of color — the
color-blind-safe redundant channel — so the states stay unambiguous in
grayscale or for color-vision-deficient viewers (the old fill-level
discs, distinguished only by how full they were, did not).

| Marker | Class | Mark | Semantic |
|---|---|---|---|
| `[x]` | `state pass` | check (green) | succeeded, chosen, complete |
| `[-]` | `state warn` | dash (amber) | partial, caveat, qualified pass |
| `[ ]` | `state todo` *(neutral)* / `state fail` *(verdict-grid)* | open ring (neutral) / ✕ (red) | **todo / pending** in checklist, obligation-matrix, roadmap; **not met** in verdict-grid |
| `[/]` | `state skip` | slash (gray) | out of scope, waived, N/A (row struck through) |

**Why `[ ]` flexes — clarity over uniformity.** In `checklist` (todo),
`obligation-matrix` (exempt), and `roadmap` (planned), `[ ]` is a
**neutral "not yet / on the slate"** — not a failure — so it renders as a
**true hollow ring** (`--muted-mark` edge ring, empty center — no inner mark,
so it reads "open", not a "selected" center-dot bullseye). In `verdict-grid`,
`[ ]` is a criterion **not met**, which *is* a negative,
so it keeps the **red ✕** (`--fail`, `--mark-x`). The decoder is
layout-aware; the stable marks (check / dash / slash) are identical across
all four. One vocabulary, but the one genuinely-ambiguous marker reads
correctly in each context.

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
`--bg`, so variants stay theme-aware. See `base.modifiers.css`.

**Theme tokens:** `--pass`, `--warn`, `--fail` (disc fill + ring + left
bar) and `--muted-mark` — which carries BOTH the neutral `[ ]` todo ring and
the `[/]` skipped mark, because each is a SHAPE and so takes the 3:1
graphical tier rather than a text one. The skipped mark read `--text-muted`
until #1715 split that token's two roles; the todo ring read `--text-label`
until #1821, when #1801 restored that token to accent-hued emphasis and took
the supposedly-neutral ring with it. Sharing one ink is deliberate and safe
here precisely because the two are told apart by shape, not color: the todo
ring carries no inner mark at all, while `[/]` is a filled disc with a slash
and a struck-through label. Plus `--pass-bg` / `--warn-bg` / `--fail-bg` (10% color-mix row
tints). The mark *shapes* are the shared masks `--mark-check` /
`--mark-dash` / `--mark-x` / `--mark-slash` (each with a `-bold` sibling for
`checks-bold`); the neutral `[ ]` todo uses no mask — it's a hollow ring.
The knockout mark uses `--bg` (the
canvas), so it adapts to light/dark and to each theme. All foreground
tokens meet WCAG AA on body backgrounds. The `.heat` modifier remaps
`--state-color` to the load/risk axis and the discs follow.

**Implementation contract:** the marker is processed in three channels
that must stay in lockstep — the engine (`lib/engine` →
`lib/integrations/markdown-it/plugins.js`), emulator (`lattice-emulator.js`),
and VS Code preview (`lattice-runtime.js`). Each strips the marker and
adds `class="state {pass|warn|fail|skip|todo} {state-full|state-half|state-empty|state-slashed|state-todo}"`
to the carrier element — a **layout-aware** decoder emits `state todo
state-todo` for the neutral `[ ]` (checklist / obligation-matrix /
roadmap) and `state fail state-empty` for verdict-grid's "not met".
`roadmap` draws the same disc + masked-`--state-mark` recipe. CSS owns all
visual chrome: the disc (`::before`) and the masked mark (`::after`).

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
<!-- _class: compare-table -->
<!-- _focus: row 4 -->        <!-- a table body row -->

<!-- _focus: col 5 -->        <!-- a column -->
<!-- _focus: cell 4,5 -->     <!-- one cell: row 4, column 5 -->
<!-- _focus: item 3 -->       <!-- a list / card-grid item -->
<!-- _focus: line 8-9 -->     <!-- code lines (a range) -->
<!-- _focus: row 2, row 5 --> <!-- two targets -->
<!-- _focus: item 2-4 -->     <!-- a range -->
```

The universal form is **`_focus: <axis> <ordinal>`** (ordinals count from
1). Axes by surface: `item` (lists, card grids), `row` / `col` / `cell`
(tables), `line` (code).

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
inverting the brightness on dark-canvas layouts (`.title`,
`.divider`, `.closing`, `.dark`) so the mark stays legible on every
theme without per-author light/dark variants. Works on SVG, PNG, and
JPEG.

```yaml
---
logo: ./acme-logo.svg
logo-style: auto | brand          # optional, default `auto`
logo-on: all | title              # optional, default `all`
---
```

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

## Composition syntax

Modifiers compose space-separated after the layout name.

```markdown
<!-- _class: cards-grid compact dark -->
<!-- _class: closing accent -->
<!-- _class: list-steps phase -->
```

**Cascade rule:** when two modifiers tune the same variable (e.g.
`compact loose`), the last one in source wins. When modifiers tune
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
