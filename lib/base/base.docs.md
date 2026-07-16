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
| `base.sketch.css` | The `sketch` **mode** (rendering hand) — a deck-wide hand-drawn skin (handwriting type + drawn boxes). Palette-blind; set via `mode:` or `class:` / `_class:`. |
| `base.finish.css` | The `field` zone of the Finish family — 9 premium **stacked-layer** finish presets (`finish-atrium/meridian/strata/halo/ledger/nimbus/loom/savile/gallery`) on a per-role custom-property compositor (`--fin-wash`/`--fin-texture`/`--fin-mark`/`--fin-edge`), so layers combine by z-index instead of being either/or. `finish-none` (or back-compat `backdrop-none`) opts a slide out. **Rich-on-screen / safe-on-export:** each preset's slot DEFAULT is the richer "dissolving" screen look (directional fades to `transparent` — alpha the browser composites cleanly), with an `--fin-*-opaque` mirror holding the PDF-clean opaque value (every full-bleed fade ends on `var(--bg)`). One guarded block flips the slots to the opaque mirror for BOTH export paths — `@media print` (CLI vector PDF) and `.lattice-exporting` (the Studio html-to-image raster tags each section before capture) — so the screen is rich while every PDF/PPTX stays opaque-clean (an alpha area-fade bakes to a gray cloud in print-to-PDF). Both faces are palette-blind (`color-mix(var(--accent)/var(--bg))`), no masks, no `url()`; only the screen face uses alpha. Selected deck-wide via the `finish:` register or per-slide via `_class: finish finish-<name>`. See `engineering/decisions/2026-06-30-finish-the-surface-layer.md`. |

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
  caption bar) — and `safe` reserves them as content padding (content stays centred
  within the reduced area) and lifts the footer chrome above the caption band.
  The same bands are emitted by the runtime preview, so the Drawing Board matches
  the export. Tune per deck by overriding `--safe-top` / `--safe-bottom`.

See `engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md`.

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

Styling: `--font-mono`, 13px (`--fs-label`), 600 weight, 0.18em
letter-spacing, uppercase, `--text-secondary` (the AA-tuned secondary
content tier — a `light-dark()` pair, so it resolves correctly on `.dark`
slides and dark themes). Dark bookend slides (title, divider, closing)
override the color to `--on-dark-secondary` / `--on-dark-ghost`
automatically. (Before the 2026-06-05 token-structure audit the eyebrow
rode the decorative `--text-muted`, which dropped below AA in several
themes — see `engineering/decisions/2026-06-05-token-structure-audit.md`.)

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

**Pills share one structure, not one colour.** Every pill across every
layout draws its geometry — radius, proportional (em-based) padding, the
body sans, weight, tracking, and centre-/middle-aligned text — from the
universal `--pill-*` tokens in `base.tokens.css`. (Pills use the deck's
sans, not mono: a pill is a status / label chip, not code, and the sans
also vertically centres caps correctly where mono seats them high.) The
separate non-pill citation/identifier chips keep their own mono. Colour
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

**Supported layouts:** `cards-grid`, `cards-stack`, `compare-prose`, `compare-table`, `verdict-grid`,
`list`, `list-criteria`, `list-steps`, `list-tabular`,
`timeline`, `principles`, `matrix-2x2`, `decision`,
`actors`, `kpi`, `agenda`. Other layouts render
blockquote as default blockquote chrome.

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

**Supported layouts:** same set as Key Insight Panel above —
`cards-grid`, `cards-stack`, `compare-prose`, `compare-table`, `verdict-grid`, `list`,
`list-criteria`, `list-steps`, `list-tabular`, `timeline`,
`principles`, `matrix-2x2`, `decision`, `actors`, `kpi`, `agenda`.

Renders as muted body text with a thin top border. Inherits the slide's
text color so it reads on either light or dark canvas.

### Annotation (HTML-comment register)

A trailing `<!-- annotation: text -->` HTML comment on any slide
renders as a corner overlay (top-right by default) for editorial or
process notes. Used during deck review to mark slides as `WIP`,
`needs-data`, `pending-legal`, etc.

```markdown
<!-- _class: content -->
<!-- annotation: WIP — numbers from May; needs June refresh -->

## …
```

Suppressed when `_class` includes `silent` (review chrome shouldn't
leak into final delivery).

### Annotation (italic-paragraph register)

A trailing paragraph whose only content is an `_italic_` span renders
as an annotation — a `✦` (U+2726) glyph in `--accent` followed by
smaller, muted, label-size text. No hairline rule. Distinct from a
below-note: lighter visual weight, lower information density, signals
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

CSS pattern: `p:has(> em:only-child)` — the paragraph must contain a
single `<em>` and nothing else (no leading/trailing text outside the
italic span). Glyph: `✦` at `0.95em` in `--accent`. Text: 15px
(`--fs-sm`) in `--text-secondary`. Use for source citations, scope
caveats, asterisk-style footnotes — content that *frames* the slide
rather than extending its argument.

**Supported layouts:** same set as Below-Note —
`cards-grid`, `cards-stack`, `compare-prose`,
`compare-table`, `verdict-grid`, `list`, `list-criteria`,
`list-steps`, `list-tabular`, `timeline`, `principles`, `matrix-2x2`, `decision`, `actors`, `kpi`, `agenda`.

### The three trailing-paragraph registers — comparison

The blockquote / plain-paragraph / italic-paragraph registers compose
by markdown shape on the same set of card-bearing layouts:

| Markdown shape | Renders as | Visual |
|---|---|---|
| `> blockquote` | **Key Insight** | accent-tinted panel, "KEY INSIGHT" eyebrow |
| Plain `<p>` (em-dash prefix) | **Below-Note** | hairline rule + body text |
| `<p>` containing only `_italic_` | **Annotation** | `✦` glyph + muted label-size text |

A slide may carry one Key Insight (blockquote) plus one trailing-
paragraph register (below-note OR annotation), in that order. See
`examples/gallery.md` slide 21 for key-insight + below-note,
slide 22 for key-insight + annotation.

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
  height (vertically centred). Use when the slot label is the
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
key (`light` · `dark` · `system` · `inherited` — the legacy `class: dark`/`light`
is a deprecated alias); a per-slide `_class: light` wins over the deck-wide color
mode, so light and dark slides can coexist. Light is already the default canvas, so
`light` is only meaningful as an *override* of a darker context.

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

Stamps an auto-incrementing index in the top-right corner of bookend
slides. Each layout carries its own counter — a `divider numbered`
series and a `closing numbered` series number independently.

| Layout | Counter token | Stamp position |
|---|---|---|
| `divider` | `lat-divider` | top-right |
| `divider light` | `lat-divider-light` | top-right |
| `closing` | `lat-closing` | top-right |

```markdown
<!-- _class: divider numbered -->   → first stamps "01", next "02", …
<!-- _class: closing numbered -->   → independent counter, starts at "01"
```

The counter is set on `body` and walks the deck once. Authors do not
number sections manually — the layout does it.

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
a legible hand-sans for prose (`--sketch-font-body`, Shantell Sans), a
wobbly accent underline on the slide heading, and the card surface of
**every card-style layout** (`cards-grid`, `cards-stack`, `verdict-grid`,
`decision`, `matrix-2x2`, `pricing`, `compare-prose`,
`citation-card`) redrawn as a sketched box — an asymmetric corner radius,
an offset "ink" stroke, and a fractional per-card tilt on the multi-card
grids. The same hand treatment reaches **every other structure that draws
its own lines**: table frames + cell rules (`compare-table`, `glossary`,
`obligation-matrix`, `list-tabular`), boxed blockquotes (`quote`,
`redline`), bordered/ruled row layouts (`actors`, `list`, `checklist`,
`agenda`), and the `<hr>` divider rule. The
governing rule is *roughen the lines the deck draws, never invent a box* —
so structures that draw none (`big-number`, `stats` — pure centred type)
stay font-only, and content the slide merely contains (photos, real
`code`, chart/diagram SVG geometry) is left untouched. Where a structure
carries a meaning-bearing colour (the per-actor hue, redline's add/remove
spine) the finish wobbles the corners but never recolours the border.
Every glyph of prose takes a hand face. The display numerals (`stats`,
`big-number`, `quote`, KPI heroes) ride the felt-tip via the `--font-display`
token; the label voice — eyebrows, table column headers, stat sub-labels,
KEY INSIGHT, the running header/footer, and pagination — rides the hand sans
via the `--font-label` seam; the slide's default font goes hand too, so
emphasis, links, and any stray prose follow without enumeration; and label
pills/badges ride the `--pill-font` seam. Only real inline `code`, `pre`, and
the `math` component stay monospace, so data can't be misread.

It is the **`mode:` axis** — the deck's rendering *mode* (its typographic
hand), a sibling of the `finish:` backdrop within the Function · Form · Substance
· Finish model: it changes type and box geometry, never colour. Every stroke
resolves through a palette token, so the style is **palette-blind** — pair it
with any theme and that theme colours it. The curated `carta` paper-and-ink
palette is the blessed pairing.

```yaml
---
theme: carta      # paper + ink; any palette works
mode: sketch     # deck-wide rendering mode — propagates to every slide
---
```

Or per slide: `<!-- _class: cards-grid sketch -->`.

#### The `mode:` front-matter register (rendering mode)

`mode:` is the **deck-wide rendering-mode selector** — a Lattice front-matter
extension (Marpit has no native key) that names the whole-deck hand in one
readable token, orthogonal to `theme:` (palette) and `finish:` (backdrop). It
resolves to the same CSS classes you'd otherwise hand-spell on `class:`, and
**composes** with any per-slide `_class:` (the same append-not-replace semantic
as the deck-wide `class:` directive), so `mode: sketch` + `<!-- _class:
cards-grid -->` renders `class="cards-grid sketch"`. A per-slide `<!-- _class:
boardroom -->` opts one slide back to clean. Use `mode:` rather than `class:
sketch` when the intent is "this whole deck is sketch" — it reads as a register,
and a typo is caught by the deck linter (`unknown-mode`).

| `mode:` value | Resolves to | Effect |
|---|---|---|
| `boardroom` | *(no class)* | The baseline — clean type, square boxes. The default when `mode:` is omitted. |
| `sketch` | `sketch` | Full handwriting (headings **and** body) + drawn boxes. |
| `sketch-clean` | `sketch sketch-clean-body` | Keep hand headings + boxes; return prose to the clean `--font-body` for text-dense slides. |

#### The `finish:` front-matter register (backdrop)

`finish:` is the sibling **backdrop selector** — the palette-blind gradient layer
stack painted *behind* content. It composes with `mode:` and `theme:`
(`mode: sketch` + `finish: atrium` = a hand-drawn deck on an atrium backdrop).
`none` is the baseline (omitting the key renders it); a typo is caught as
`unknown-finish`.

| `finish:` value | Resolves to | Effect |
|---|---|---|
| `none` | *(no class)* | No backdrop — the baseline. The default when `finish:` is omitted. |
| `atrium` | `finish finish-atrium` | Corner glow + a fine grid + a left margin rule. |
| `meridian` | `finish finish-meridian` | Diagonal duotone wash + contour lines + an (author-set) oversized ghost numeral. |
| `strata` | `finish finish-strata` | Soft horizontal bands + a dot-matrix + a top hairline & corner tick. |
| `halo` | `finish finish-halo` | Centered spotlight + concentric rings + a vignette (a section/closing treatment). |
| `ledger` | `finish finish-ledger` | Fine horizontal ruled lines + a bold left margin bar + a top-right corner fold. |
| `nimbus` | `finish finish-nimbus` | A gradient **mesh** of soft accent blooms (a new wash type) + a seating vignette — pure premium atmosphere; the wash intensity tunes the bloom strength. |
| `loom` | `finish finish-loom` | A woven **lattice** cross-hatch (a new texture type — two ±45° weaves; on-brand) + a movable corner glow. Tune the weave scale, move the glow. |
| `savile` | `finish finish-savile` | A tailored vertical **pinstripe** (a new texture type; tune the pitch via scale) + a movable, author-set monogram mark. Editorial. |
| `gallery` | `finish finish-gallery` | A museum inset keyline **frame** (a new edge type — four crisp accent strips, no soft shadow) + a spotlight + a movable, author-set numeral. |

The nine `finish-*` presets are the **`field` zone** of the Finish family — a
z-index STACK of palette-blind, export-safe gradient layers painted behind
content (`lib/base/base.finish.css`). The base `finish` class carries the layer
compositor (`--fin-wash`/`--fin-texture`/`--fin-mark`/`--fin-edge`); each preset
sets those per-role props, so a future right-panel designer can drive any single
layer. Take one slide out of a deck-wide finish with `<!-- _class: finish-none -->`
(the back-compat `backdrop-none` is an alias); a per-slide `finish-<name>`
**overrides** the deck finish rather than stacking on it.

**Glyph-marks (the ghost monogram / numeral) are author-personalized and never
appear by default.** A finish's `mark` layer carries the layer *type* (so the
preset and the Studio designer still offer a monogram/numeral), but its rendered
text (`--fin-mark-text`) is **empty** out of the box — a deck-wide `finish:`
register paints **no glyph at all**, on any slide. (This is deliberate: a baked
placeholder like a literal "03" or "L" would otherwise paint the same wrong mark
on every slide of a deck.) To show a mark, the author sets the glyph themselves —
in the Studio designer's *Initials*/*Number* field, or in deck source by setting
the CSS slot on the slide's finish class, e.g. a per-deck/per-slide
`<style>section.finish-meridian { --fin-mark-text: "Q3"; }</style>`. The other
mark types (margin bar, registration tick) are pure geometry and render as part
of their preset; only the *glyph* marks wait for an author value. See the
`examples/finish-backdrops.md` demo (its meridian/savile/gallery slides opt in
with explicit glyphs to showcase the movable mark).

Every full-bleed gradient fades **opaque-to-opaque** (`color-mix(var(--accent)
N%, var(--bg))` → `var(--bg)`), never to `transparent`. This is load-bearing for
export: Chromium's print-to-PDF encodes an alpha area-fade so PDF rasterizers
interpolate toward transparent-black → a gray cloud (the browser hides it, the
PDF does not). Patterns are therefore uniform and faint (thin opaque lines with
`transparent` gaps), not directionally faded.

Both registers are **open** (`lib/core/resolve-finish.js` for backdrops,
`lib/core/resolve-mode.js` for the mode) and read by all three render paths.
An unrecognized value (e.g. `finish: atriumm` or `mode: sketchh`) resolves to no
classes — so it would silently ship the baseline — which is why `npm run
lint:deck` flags it (`unknown-finish` / `unknown-mode`).

**Reserved finish classes — do not author by hand.** `lattice-exporting` is an
**engine-reserved class**: the Studio raster export (`drawing-board-export.js`)
stamps it on every section right before `html-to-image` capture, which flips the
finish compositor to its opaque export face (`base.finish.css`, the OPAQUE FLIP).
Never put `lattice-exporting` in deck source — a slide carrying it would render
its *export* (flatter) finish on screen. The Studio's Finish faculty has an
**Export-preview** toggle that adds it to the live specimen on purpose, so a
designer can see the baked look; that is the only legitimate authoring use, and
it is transient (UI state, never written to the deck). The other reserved finish
words are the five preset slugs (`atrium`/`meridian`/`strata`/`halo`/`ledger`),
`finish-none`/`backdrop-none` (the per-slide opt-out), and `finish-preview` (the
faculty specimen) — a *saved* custom finish whose name collides with any of these
is namespaced (`atrium` → `atrium-custom`) so it can never shadow a built-in.

#### The `split:` front-matter divider

`split:` is the **deck-wide slide divider selector** — another Lattice
front-matter extension (`lib/core/resolve-split.js`), binary by design:

| `split:` value | Slides divide on | Notes |
|---|---|---|
| `headings` | the first `#` (lead) + every `##`, **and** `---` | The **default** (omit the key). Eyebrow-aware + hybrid (below). |
| `rule` | a top-level `---` only | Opt back into the Marp-classic separators-only behaviour. |

The default `headings` divider is **eyebrow-aware**: a slide's lead-in — its
`<!-- _key -->` directive comments and its eyebrow paragraph, both written
*above* the heading — is pulled onto the heading's slide, never orphaned onto
the one before. It is **hybrid**: a literal `---` still forces a break (use it
for a heading-less image slide, or two slides under one idea). It is
implemented as one shared `hr`-injection ruler
(`headingSplit` in `lib/integrations/markdown-it/plugins.js`, run `.before('lattice_slide')`)
so the owned engine (emulator + playground) and the Export-to-Marp baker produce identical boundaries —
and it is **slide-count-identical to `rule` on every classic `---`-separated
deck** (pinned by `test/unit/parsing/heading-split.test.js`), which is why the
default flip leaves existing decks unchanged. An unrecognized value resolves to
the default; `npm run lint:deck` flags it as an `unknown-split` warning.

**On vanilla Marp (incl. the marp-vscode live preview).** Lattice is the source
of truth: the Drawing Board preview and the PDF export both run our engine, so
the divider is always correct there. Stock Marp doesn't run our splitter, so a
deck opened directly in the marp-vscode preview divides only on `---`. That's
expected — Marp is an *export target*, served by a self-contained bundle
(`npm run export:marp`) that bakes the splits into literal `---` (and packs the
themes, assets, a renderer + a marp-cli config, and a README), not a live render
path we keep in lockstep. See `engineering/decisions/2026-06-13-export-to-marp.md`.

#### The `stamp:` / `tone:` front-matter registers (marker shape)

`stamp:` and `tone:` are the **deck-wide marker-SHAPE selectors** — siblings of
`finish:` / `mode:` that pick the *shape* the status markers render in, once, for
the whole deck. They are **orthogonal to which marker shows**: a state marker
(`confidential` / `wip` / `draft` / …) sets its own *label + color*; a tone marker
(`tone-pass` / `tone-warn` / …) sets its own *color*; these registers only choose
the shape both render in, so a deck reads as one family. They **compose** with any
per-slide `_class:`, and a slide carrying its OWN `stamp-<name>` / `tone-<style>`
token **overrides** the deck default (append-not-replace, like every register). A
typo is caught by the deck linter (`unknown-stamp` / `unknown-tone`). The vocab is
open (`lib/core/resolve-stamp.js`, `lib/core/resolve-tone-style.js`), read by all
three render paths, and surfaced in the Studio "This slide" drawer (the boardroom
subset first, then the wider range).

`stamp:` — the **state-marker shape** (the `::before` corner mark). The default
(omit the key) is the uniform `tab`. The curated boardroom subset:

| `stamp:` value | Shape |
|---|---|
| `tab` | A rounded corner tab. **The default.** |
| `notch` | A folded corner notch. |
| `bracket` | The label in `[ … ]` brackets, no fill. |
| `seal` | A pill-shaped seal. |
| `pill` | A soft-tinted pill. |

The wider range (also valid, surfaced under "More"): `ribbon`, `flag`,
`underline`, `dot`, `mark`, `veil`, `bar`, `pin`.

`tone:` — the **tone-marker shape** (how a `tone-*` color paints). The default (omit
the key) is the left `rail`. `rail` and `glow` are box-shadow-shaped, so they never
collide with the state `::before` or the pagination `::after`. `edge` **recolors the
spectrum brand bar** itself (the top border) with the tone color — the same move the
`accent` modifier makes — instead of a competing top band that would fight it:

| `tone:` value | Shape |
|---|---|
| `rail` | A left edge rail. **The default.** |
| `edge` | Recolors the top spectrum bar with the tone color (needs a semantic tone; a no-op where the spectrum is absent, e.g. a dark/divider slide). |
| `glow` | A full inset ring. |

Every marker uses the SAME shape by default (a coherent family, not a per-marker
signature); pick a different shape deck-wide with the register, or per-slide with
the token. `stamp: seal` + `<!-- _class: confidential stamp-notch -->` renders that
one slide's "Confidential" marker as a notch while the rest of the deck seals.

#### The `spectrum:` / `spectrum-edge:` registers (the spectrum accent finish)

The SPECTRUM is the accent gradient painted on the section edge AND on every accent that
reads the shared `--spectrum` token — table-header rails, the `list-steps` timeline spine,
code-panel strips, an author's `---` rule. Two orthogonal keys control it, both siblings of
the registers above (`lib/core/resolve-spectrum.js`), propagated to every section and
overridable per slide; a typo is caught as `unknown-spectrum` / `unknown-spectrum-edge`.

**`spectrum:` — the STYLE (the gradient identity).** Redefines the `--spectrum` token at the
section level, so **every** accent — bar and structure — follows as one system (the
consolidation). White-label lives here: pick a client's single color with `solid` and set
the theme's `--accent` to their brand.

| `spectrum:` value | Token | Effect |
|---|---|---|
| `on` | *(none)* | The rainbow 3-stop theme ribbon. **The default** (omit the key). |
| `solid` | `spectrum-solid` | A single **`--accent`** — everywhere. |
| `duo` | `spectrum-duo` | Two-tone: accent → the theme's duotone partner (`--tag-bg`). |
| `mono` | `spectrum-mono` | A quiet single-hue tint ramp (accent → canvas). |
| `off` | `spectrum-off` | Drops the section-edge / divider bar only. Structural accents (table rails, `list-steps` spine, `hr`) keep the current style — `off` never kills a structural rule (the white-label baseline). |

**`spectrum-edge:` — the PLACEMENT (where the section-edge bar sits).** Moves or removes
ONLY the bar, via a per-side `border-image`; it never touches the structural accents, so a
bar-off deck keeps its table rails and `---` rules.

| `spectrum-edge:` value | Token | Effect |
|---|---|---|
| `top` | *(none)* | The top border. **The default** (omit the key). |
| `left` | `spectrum-edge-left` | A left rail (the divider look, generalized). |
| `right` | `spectrum-edge-right` | A right rail. |
| `bottom` | `spectrum-edge-bottom` | A bottom rail — reads as a baseline. |
| `off` | `spectrum-edge-off` | No section-edge bar (structural accents survive). |

**`spectrum-card:` — a spectrum rail on CARD surfaces (opt-in).** Off by default; `on` paints
a left rail on every card (the `cards-grid` / `cards-stack` / `compare-prose` `.card`, and the
`stats` / `pricing` / `verdict-grid` tiles). The rail reads the shared token, so it inherits the
deck's STYLE. Per-slide: `_class: spectrum-card` opts one slide in, `_class: spectrum-card-off`
opts one out of a deck-wide `on`. A typo is caught as `unknown-spectrum-card`.

| `spectrum-card:` value | Token | Effect |
|---|---|---|
| `off` | *(none)* | No card rail. **The default** (omit the key). |
| `on` | `spectrum-card` | A spectrum left rail on every card surface, deck-wide. |

Kept opt-in on purpose: a rail on *every* card by default would be the ransom-note look — turn
it on where it earns its place.

The three keys compose: `spectrum: duo` + `spectrum-edge: left` is a two-tone rail on the left
with the duo gradient flowing to every accent, and `spectrum-card: on` extends that same duo
into a rail on each card. `spectrum:` also composes with `accent` /
`tone: edge` (per-slide bar recolors), which win over the deck register where they apply. On
a dark bookend a dark client accent reads faint — pick a theme accent that reads on dark, or
`spectrum: off` there. *(The old narrow `spectrum: on/off/solid` register — bar-only — is
superseded: `solid` now flows to every accent (but `off` stays bar-only). See
`engineering/decisions/2026-07-15-accent-finish-consolidation.md`.)*

#### The `rule:` front-matter register (heading underline)

`rule:` is the **heading-underline** accent finish — the line beneath a slide's heading (the
`form` masthead hairline; the split-panel kicker rule). Sibling register
(`lib/core/resolve-rule.js`), propagated to every section, overridable per slide; a typo is
caught as `unknown-rule`. Palette-blind; defaults to today's render.

| `rule:` value | Token | Effect |
|---|---|---|
| `auto` | *(none)* | Today's render — a full hairline where the masthead already draws one, nothing on a plain slide. **The default**. |
| `full` | `rule-full` | An explicit full-width hairline. |
| `short` | `rule-short` | A short left-aligned rule under the heading. |
| `accent` | `rule-accent` | A short rule painted in `--accent` — a signature without shouting. |
| `none` | `rule-none` | No heading underline. |

`rule:` governs the `form` masthead hairline — the canonical heading underline. The
split-panel kicker rule honors `none` / `accent` (drop or recolor it); `short` / `full` are
masthead-scoped. On a slide with no heading underline, `rule:` is a graceful no-op.

#### The `eyebrow:` front-matter register (kicker decoration)

`eyebrow:` decorates the mono-caps **eyebrow** kicker (the code-only line above a heading —
see *Eyebrow labels* above). Sibling register (`lib/core/resolve-eyebrow.js`), propagated to
every section, overridable per slide; a typo is caught as `unknown-eyebrow`. Palette-blind;
defaults to the bare label. Leading marks space with `gap` (never `margin`), so they measure
cleanly.

| `eyebrow:` value | Token | Effect |
|---|---|---|
| `plain` | *(none)* | The bare mono-caps label. **The default** (omit the key). |
| `dot` | `eyebrow-dot` | A small filled `--accent` disc before the label. |
| `bar` | `eyebrow-bar` | A short vertical `--accent` tick before the label. |
| `arrow` | `eyebrow-arrow` | A leading chevron (`›`) in the accent color. |
| `underline` | `eyebrow-underline` | A hairline rule beneath the label. |

Pick **one** eyebrow treatment deck-wide so every kicker reads as one family — mixing marks
per slide reads as a ransom note. Together `spectrum:` / `rule:` / `eyebrow:` are the Finish
axis's **accent** sub-family (marks on chrome), distinct from `finish:` (backdrops behind
content).

#### The `lift:` front-matter register (card elevation)

`lift:` is the **opt-in card-elevation control** for the "Struck" lift — the box-shadow
that lifts card surfaces (`cards-grid`, `kpi` tiles, `stats`, `pricing`, `verdict-grid`, …)
off the slide. It's a crisp dark contact shadow on a light deck, a 1px white top-edge
rim-light on a dark deck (the card *fill* never changes), and zero-blur so it survives the
vector PDF export. Sibling of the registers above (`lib/core/resolve-lift.js`), propagated
to every section, overridable per slide.

| `lift:` value | Token | Effect |
|---|---|---|
| `off` | *(none)* | Cards are flat. **The default** (omit the key). |
| `on` | `lifted` | Every card lifts, deck-wide. |

Per slide, `<!-- _class: lifted -->` lifts one slide in a flat deck, and
`<!-- _class: flat -->` drops one slide out of a lifted deck (include the layout too,
e.g. `_class: cards-grid flat`). The `lifted` class swaps the `--elevation-card` /
`--elevation-berth` tokens from their `none` / `0` default to the shadow **and** its berth
padding, so the two turn on together — a flat card gets neither the shadow nor the extra
padding. Ruled tables (`glossary`, `list-tabular`) and full-height rails (`split-panel`'s
left panel) never lift, even when `lift` is on. Toggle it from the **Deck Setting** drawer
(a **Card lift** switch alongside Auto-glossary / Page numbers) or by hand in the front
matter. See `engineering/decisions/2026-07-12-struck-elevation.md`.

| Token / class | Effect |
|---|---|
| `sketch` | Full handwriting (headings **and** body) + drawn boxes. The default. |
| `sketch sketch-clean-body` | Keep hand headings + boxes; return prose to the clean `--font-body` for text-dense slides. |
| `--sketch-ink` | The ink the boxes are drawn in (defaults to `--text-heading`); a theme override seam. |
| `--sketch-font-display` / `--sketch-font-body` | The hand fonts; swap either to re-flavour the whole finish in one line. |
| `--pill-font` | Re-pointed at the hand body face under `sketch` so label chips/badges read hand-drawn; override per theme to restore a clean label font. |
| `--font-label` | The label voice (eyebrows, table headers, stat sub-labels, header/footer, pagination); defaults to `--font-mono`, re-pointed at the hand sans under `sketch`. |
| `--sketch-wave` | The hand-drawn rule — a near-straight pen-waver as a tiling SVG mask, worn by table cell rules, ledger/agenda row rules, and `<hr>`. |

**PDF-safe by design.** Boxes are `border-radius` geometry (asymmetric
per-corner curves read as freehand); the lines a deck draws wear
`--sketch-wave`, a near-straight pen-waver carried as a tiling SVG **mask**
(shape in the mask, colour via `background-color: var(--sketch-ink)` — so it
stays palette-blind). Both are static; the SVG `feTurbulence` +
`feDisplacementMap` **filter** "roughen" pass was prototyped and rejected —
it survives on screen but collapses Marp's print-scale transform, shrinking
the slide in the PDF. A mask is not a filter, so it ships clean. See
`engineering/decisions/2026-06-11-sketch-finish.md`.

**Charts/diagrams.** The finish reskins the heading, the HTML legend, and
card text, but cannot reach inside a chart's SVG geometry — wedges, bars,
and lines keep their own marks. Hand-drawn chart *marks* are a deferred
follow-up.

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
front-matter registers* above.

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
colour-blind-safe redundant channel — so the states stay unambiguous in
greyscale or for colour-vision-deficient viewers (the old fill-level
discs, distinguished only by how full they were, did not).

| Marker | Class | Mark | Semantic |
|---|---|---|---|
| `[x]` | `state pass` | check (green) | succeeded, chosen, complete |
| `[-]` | `state warn` | dash (amber) | partial, caveat, qualified pass |
| `[ ]` | `state todo` *(neutral)* / `state fail` *(verdict-grid)* | open ring (neutral) / ✕ (red) | **todo / pending** in checklist, obligation-matrix, roadmap; **not met** in verdict-grid |
| `[/]` | `state skip` | slash (grey) | out of scope, waived, N/A (row struck through) |

**Why `[ ]` flexes — clarity over uniformity.** In `checklist` (todo),
`obligation-matrix` (exempt), and `roadmap` (planned), `[ ]` is a
**neutral "not yet / on the slate"** — not a failure — so it renders as a
**true hollow ring** (`--text-label` edge ring, empty centre — no inner mark,
so it reads "open", not a "selected" centre-dot bullseye). In `verdict-grid`,
`[ ]` is a criterion **not met**, which *is* a negative,
so it keeps the **red ✕** (`--fail`, `--mark-x`). The decoder is
layout-aware; the stable marks (check / dash / slash) are identical across
all four. One vocabulary, but the one genuinely-ambiguous marker reads
correctly in each context.

**Style variants (`checks-*`).** The disc treatment is one of five
boardroom-ready styles, switchable per slide (`_class: checklist
checks-outline`) or per deck (`class: checks-bold`). The marks and
status colours never change — only the disc presentation:

| Variant | Disc treatment |
|---|---|
| *(default)* / `checks-ringed` | saturated fill + hairline darker ring; knockout mark. Stays crisp on its own status-tinted row. |
| `checks-knockout` | flat saturated fill, knockout mark. Cleanest/classic. |
| `checks-bold` | larger disc + heavier marks, knockout. Reads across a room. |
| `checks-outline` | transparent fill + ring + status-colour mark. Editorial, low-ink. |
| `checks-tonal` | soft tint fill + ring + status-colour mark. Calm; best on plain (non-tinted) backgrounds. |

Each variant flips only scalar CSS knobs (`--state-fill-pct`,
`--state-ring-*`, `--state-mark-pct`, `--state-disc-scale`) at section
scope; the leaf disc mixes the actual colours from `--state-color` +
`--bg`, so variants stay theme-aware. See `base.modifiers.css`.

**Theme tokens:** `--pass`, `--warn`, `--fail` (disc fill + ring + left
bar), `--text-label` (the neutral `[ ]` todo ring) and `--text-muted`
(`[/]`); plus `--pass-bg` / `--warn-bg` / `--fail-bg` (10% color-mix row
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
so palette swap = treatment colour swap.

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
colours render directly on a soft `--bg-alt` plate. Use when the
brand's colours carry meaning (government insignia, university
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

---

## Accessibility — colour-vision-deficiency themes (`a11y-*`)

Colour-vision-deficiency (CVD) accommodation is delivered as four **first-class
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
They share `themes/a11y-base.css` (the texture wiring + greyscale categorical
ramp + the forced light scheme); each theme file adds only its **status trio**
(`pass`/`warn`/`fail`, moved off that deficiency's confusion axis). The texture
`<pattern>` `<defs>` the fills reference are emitted by the engine on every
render (`lib/core/accessibility-textures.js`).

Because colour alone distinguishes only ~1–2 categories under dichromacy, the
themes do **not** rely on recolouring. They pair the CVD-tuned **status colours**
with three redundant, non-colour channels that carry meaning when colour collapses:

- **Status glyphs** — `✓` / `!` / `✗` prefix the status-pill vocabulary.
- **Categorical textures** — a distinct pattern (diagonal, dots, grid, chevron,
  rings, checker, …) per categorical slot on diagram and chart fills, including
  the Mermaid pie.
- **Line-styles** — a per-series `stroke-dasharray` (solid / dashed / dotted / …)
  on multi-series line charts (radar), where a fill texture doesn't apply.

Authors write decks normally — no per-slide markup. `achromatopsia` leans
entirely on glyphs + textures + line-styles (its status trio is
luminance-separated greys) — the same channels that survive black-and-white print.
Design + rationale: `engineering/decisions/2026-06-16-colour-blindness-accessibility.md`
and `…-cvd-redundant-encoding.md`.

---

## Related

- `design/design-system.md §6.5` — the variant tier system (universal,
  semi-universal, layout-specific) and the rules manifests follow.
- `lib/shared/shared.docs.md` — the semi-universal modifiers
  (`compact`, `loose`, `accent`) that compose with most layouts.
- `lib/components/<name>/<name>.docs.md` — per-component contracts
  including layout-specific variants.
