# Theming

How to author a new palette for Lattice. Covers the CSS variable contract
and the categorical-token taxonomy.

> **Who owns what?** This file is the *how*. For the boundary — what the engine
> owns versus a theme, a deck, and a consumer like the docs site or the Studio —
> see `engineering/decisions/2026-08-09-color-theme-ownership.md`.

> **First time here?** Start with `themes/README.md` — it's the
> one-screen mental model and a five-minute scaffolded path. This file
> is the deep reference you graduate to when the README points you here.
> The lightness contract that governs every fill choice is at the end
> of this file under **The lightness contract**.

## Anatomy of a palette

A palette is one CSS file plus one small manifest. `themes/<name>.manifest.json`
declares the palette's **identity and role** — which picker group it belongs to,
which canvases it has a real face for, which theme it extends — and carries no
token names or values at all; those live in the CSS, and every gate proves the
declaration against it. Field reference: `themes/theme.schema.json`. The rest of
this section is the CSS.

Every palette extends
the lattice engine via `@import 'lattice'` at the top of the file, then
contains:

1. A `@theme <name>` directive (registration; e.g. `@theme indaco`), and — for a
   dark/derived variant — an `@import '<parent>'`. Both are **Marp's copy**: Marp
   has no manifest, so it learns identity and the parent edge from the stylesheet.
   Lattice DISCOVERS neither from the CSS — identity and the chain come from
   `themes/<name>.manifest.json` (`name`, `extends`), resolved by
   `lib/theme/chain.mjs`, and `check:ownership` fails if the CSS and the manifest
   disagree. The `@import` is still what splices the parent into the composed
   stylesheet at render time, so keep it accurate: it is not decoration. See `engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md`.
   The manifest **owns the name** — the
   filename and this directive are projections of `manifest.json`'s `name`, and
   `check:ownership` fails if the three disagree. The directive stays in the CSS
   (rather than being stamped into `dist/` like `@size`) because
   `@workwel/lattice/themes/<name>.css` is a published export documented as a
   Marp theme file, and Marp throws without it. A palette does **not** declare
   `@size` — the page box belongs to the engine's registry
   (`lib/engine/sizes.js`), and the build stamps those directives into `dist/`.
   See `engineering/decisions/2026-08-16-size-registry-ownership.md` and
   `2026-08-16-theme-identity-ownership.md`.
2. An `@import 'lattice'` line (pulls in layouts, structural tokens, and
   the universal semantic palette + diagram overrides).
3. A `:root` block defining color tokens used by `lattice.css` (surfaces,
   ink, accents, semantic signals).
4. A `:root` block defining `--scheme-dark-*` tokens used by the `section.dark`
   variant for cover/divider/closing slides on a dark canvas.
5. A `:root` block defining `--hljs-*` tokens for code-block syntax colors.
6. A `:root` block defining `--c-*` tokens — the categorical palette
   (12-slot paired light/dark cycle, paired ink, structural stroke/line,
   plus optional overrides of the universal semantic palette).

Palettes are token-only. The per-diagram CSS overrides (`section .section-N
rect { fill: var(--cat-3-fill) }` and the rest) live in `lattice.css`'s
**DIAGRAM OVERRIDES** section at the bottom of the file — palette-blind,
loaded by every render path, applied to the inline SVG via the host page
cascade. Authoring a new palette is purely a token-declaration job; no
per-palette CSS rules are needed.

See `engineering/decisions/2026-05-12-diagram-tokens.md` for the architectural
rationale (why no `themeCSS` init parameter, why role-named tokens, why
contrast is asserted in `test/unit/contrast.test.js`).

## The variable contract

Every palette must define every variable below. A missing variable falls
through to the cascade root (typically unstyled), which makes gaps easy
to spot during palette development.

### Surfaces and ink (slide layouts)

| Token | Role |
|---|---|
| `--bg` | Slide canvas |
| `--bg-alt` | Card fill, alternate row, secondary surface |
| `--surface-inverse` | Dark panel canvas (title, divider, closing) |
| `--border` | Hairline rule on light surfaces |
| `--text-display` | Text on dark surfaces |
| `--text-heading` | Primary text on light surfaces |
| `--text-body` | Body prose |
| `--text-secondary` | Secondary **content** text — subtitle, caption, eyebrow, table header, sub-label, attribution. AA (≥4.5:1) on both canvases. |
| `--text-label` | Accent-hued labels / kickers. AA on both canvases. |
| `--text-muted` | **De-emphasized TEXT** — chrome (pagination/header/footer), captions, table headers, code comments, quote glyphs. AA (≥4.5:1) on both canvases, like every other `text-*` token. Still quieter than `--text-secondary`; it is de-emphasis with a floor, not an exemption. |
| `--muted-mark` | **De-emphasized DECORATION** — rules, hairlines, empty-cell & skipped-state marks, struck "dropped" options, low-alpha cell washes, chart grid lines. The 3:1 WCAG 1.4.11 graphical floor; **never for text**. |
| `--accent` | Saturated brand color used for emphasis text and borders |
| `--accent-soft` | Pale brand-tinted panel fill |
| `--on-accent` | Ink for text/icons placed ON an `--accent` fill (`-secondary` / `-ghost` / `-watermark` tiers derive from it) |
| `--on-accent-soft` | Ink/border (emphasis) for the `--accent-soft` fill |
| `--accent-soft-body` | Body prose on the `--accent-soft` fill (derives from `--text-body`) |
| `--code-text` | Code text on dark code surface |

### Accent containers

Accent comes in two **containers**, and the rule is the same as everywhere
else: a fill never carries text in a fixed color — it carries text in its
*paired* ink, so both adapt when a palette flips its accent light or dark.

| Container | Fill | Ink / border | Use |
|---|---|---|---|
| **Bold** | `--accent` | `--on-accent` (**all text**, including eyebrows and labels), `--on-accent-secondary` (muted chrome only — running header/footer), `--on-accent-ghost` (chrome / divider), `--on-accent-watermark` (backdrop glyph) | Loud, attention-pulling — verdict bar, corner tags, timeline nodes, the split-panel rail |
| **Soft** | `--accent-soft` | `--on-accent-soft` (emphasis + border); `--accent-soft-body` (body prose, = canvas `--text-body`) | Quiet, recommended-option surfaces — verdict-grid winner, compare-prose transition & matrix outcome cells |

The **bold** ink is the single curated value `--on-accent`: each theme tunes it
for AAA contrast against *its* `--accent` in both modes, and the three muted
tiers derive from it by opacity (so overriding `--on-accent` alone re-tunes the
whole rail).

> **No derived tier carries text on the bold container.** The derivation spends the
> very margin the curation buys, and on several palettes `--on-accent` clears AA by
> little enough that there is nowhere to descend to: measured across all 14, the 70%
> `--on-accent-secondary` is **sub-AA on seven** (mustard 3.34:1 … carta 4.40:1). Text
> — eyebrows and captions included — names `--on-accent`, and hierarchy comes from
> size and weight. See
> [`engineering/decisions/2026-08-11-on-dark-ink-tiers.md`](../engineering/decisions/2026-08-11-on-dark-ink-tiers.md). The **soft** ink `--on-accent-soft` is `--accent` itself — it reads
AAA on the pale tint and is exactly what soft cards already used; naming it gives
consumers a first-class pair and one override seam, with no new curated color.

> **Never paint text on `var(--accent)` with `--on-dark*` or a bare `#fff`.**
> That assumes the accent is always dark; it collapses to light-on-light on
> every pale-accent palette (all dark modes; concrete/atelier/ardesia outright).
> The `accent-container ink contract` test
> (`test/unit/components/accent-contract.test.js`) enforces this across the
> engine and the docs site.

Custom-logo authors point `logo:` in front matter at an image file.
A build-stage rewriter injects `<img class="deck-logo">` as the
first child of each section; CSS desaturates the img to a faint
grayscale watermark via `filter`, inverting the brightness on
dark-canvas layouts so the mark stays legible without a theme-specific
asset. See [lib/base/base.docs.md § Custom logo](../lib/base/base.docs.md)
for the authoring contract.

### Semantic signals

| Token | Use |
|---|---|
| `--pass` | Success indicator (badges, checkmarks) |
| `--fail` | Failure indicator |
| `--warn` | Warning indicator |
| `--pass-bg`, `--fail-bg`, `--warn-bg` | Tinted backgrounds for badges. An ALPHA tint (`color-mix(… N%, transparent)`), so the ground follows whatever surface it lands on — a component that needs a ground independent of its tile mixes its own opaque one instead (see `--kpi-{pass,warn}-pill-bg`) |

### Dark variant (slide reskin)

| Token | Role |
|---|---|
| `--scheme-dark-bg`, `--scheme-dark-bg-alt`, `--scheme-dark-border` | Surfaces |
| `--scheme-dark-text-heading`, `--scheme-dark-text-body`, `--scheme-dark-text-display` | Ink |
| `--scheme-dark-text-secondary` | Dark side of the secondary content tier |
| `--scheme-dark-text-label`, `--scheme-dark-text-muted` | Label / chrome |

These tokens are inputs to the surface tokens via `light-dark()` — see
the [Dark mode](#dark-mode) section below. They also remain available
directly for any layout (e.g. `section.title`) that wants the dark canvas
regardless of the deck's color-scheme.

## Dark mode

The dark canvas is driven by the native CSS `color-scheme` cascade plus
`light-dark()` resolution on the surface tokens. No engine plugins, no
class-list surgery, no per-renderer logic — the same mechanism works in
marp-cli, the lattice emulator, and the VS Code Marp preview.

### Authoring paths

There are four ways to get a dark canvas:

| Goal | Front-matter / source |
|---|---|
| Whole deck dark (or light) | `color-mode: dark` (or `color-mode: light`) — the first-class key; pins the canvas on every surface (`section.dark { color-scheme: dark }` on every slide). |
| Follow the viewer's OS preference | `color-mode: system` — `section.color-system { color-scheme: light dark }`, so `light-dark()` resolves per `prefers-color-scheme`. |
| Adopt the host (site toggle / reader's OS) | `color-mode: inherited` — `section.color-inherited { color-scheme: inherit }` takes the host's mode. |
| Whole deck dark, simplest theme swap | `theme: cuoio-dark` (or `indaco-dark`) — a 3-line wrapper pinning `:root{color-scheme:dark}`. |
| Single slide on an otherwise-light deck | `<!-- _class: dark -->` on that slide — flips just that section. |

The legacy deck-wide `class: dark`/`class: light`/`class: print` (and a raw
`style: ":root{color-scheme:dark}"`) still work on a deck that sets nothing else, but
`color-mode:` is the documented, typo-checked way — and the only one offering `system` /
`inherited`. **Where a deck carries both, the key wins and the alias is dropped** rather
than merged, so a half-finished migration cannot render one canvas and bake its diagrams
for another. The deck linter flags the leftover (`deck-wide-component`).

Default is light. With no directive, `:where(:root) { color-scheme: light }`
applies at zero specificity, so any author override wins the cascade
automatically (no `!important` needed).

### How it resolves

Each palette declares surface tokens like
`--bg: light-dark(<light>, <dark>)`. The browser resolves the function
at every use site based on the computed `color-scheme` of the element:

- At `:root` scope, the deck-wide author override (`style:` directive or
  variant theme) sets the scheme; every section inherits.
- At section scope, `section.dark { color-scheme: dark }` overrides
  inheritance for that one element and its descendants.
- Inside Mermaid SVGs, `light-dark()` doesn't propagate cleanly because
  Mermaid renders the SVG in an isolated context. The lattice emulator's
  palette parser collapses `light-dark()` to the side that matches the
  palette's declared color-scheme before passing colors to Mermaid's
  themeVariables, so dark variants render dark diagrams and light decks
  render light diagrams. Author-flipped decks via `style:` still need the
  matching theme variant if they care about diagram color (the variant
  is the only signal the palette parser sees).

### highlight.js syntax

| Token | Highlight class |
|---|---|
| `--hljs-comment` | `.hljs-comment, .hljs-quote` |
| `--hljs-keyword` | `.hljs-keyword, .hljs-selector-tag, .hljs-addition` |
| `--hljs-number` | `.hljs-number, .hljs-literal, .hljs-built_in` |
| `--hljs-string` | `.hljs-string, .hljs-doctag, .hljs-regexp` |
| `--hljs-title` | `.hljs-title, .hljs-section, .hljs-function` |
| `--hljs-variable` | `.hljs-variable, .hljs-attr, .hljs-tag` |
| `--hljs-punctuation` | `.hljs-punctuation, .hljs-operator` |

### Categorical tokens (`--c-*`)

Role-named, palette-blind tokens consumed by `lattice.css`'s DIAGRAM
OVERRIDES section and by the renderer bridges (`lattice-runtime.js`,
`lattice-emulator.js`). Slide layouts also consume them directly for
nth-child cycles (decision list, roadmap horizons, actor pills, kpi
trajectory).

**Categorical cycle** (12 paired slots, each a flipping `light-dark()` tier of ONE hue).

- `--cat-1-fill`..`--cat-12-fill` — the leaf/area fill,
  `light-dark(<pale chromatic>, <jewel tone>)`. The canonical
  categorical surface: timeline periods, kanban columns, mindmap
  levels, journey sections, c4 layers, pie slices, treemap leaves,
  gitgraph label pills. Slot 1 doubles as the primary fill for any
  single-band diagram (flowchart node, sequence actor).
- `--cat-1-mark`..`--cat-12-mark` — the stroke / border,
  `light-dark(<deep edge>, <pale tint>)` — the OPPOSITE tier of the same
  hue. Saturated marks: decision-list deep accents, piechart wedges,
  gitgraph branch dots, sankey nodes, kpi trajectory borders, xy-chart
  plot palette, Mermaid cScale feeds.

Fill and mark are opposite tiers that **swap when the canvas flips** (pale
fill ↔ jewel fill; deep mark ↔ pale mark). Each slot honors the **layered
contrast contract** (#1022,
`engineering/decisions/2026-07-15-categorical-token-contract.md`):

1. **① edge/border** — `--cat-N-mark` vs `--bg` ≥ 3:1 (WCAG 1.4.11 graphical).
2. **② leaf fill** — `--cat-N-fill` vs `--bg` *intentionally low*; the ① border delineates it.
3. **③ label ink** — `--cat-on-fill` vs `--cat-N-fill` ≥ 4.5:1 (WCAG AA).
4. **④ on-canvas ink** — `--cat-N-ink` vs `--bg` **and** `--bg-alt` ≥ 4.5:1 (WCAG AA),
   on all three canvases: light, dark, and the print band.
5. **anti-collapse** — fill ≠ mark (equal fill/mark was the collapse bug).

`checkCatContrast` in `tools/check-ownership.js` gates **four of these** — ① (mark
vs `--bg`), ③ (ink vs fill), ④ (on-canvas ink vs both slide surfaces), and the
anti-collapse floor. Layers ①, ③ and anti-collapse are the *hue* contract and run
over every hue-based theme, both modes, with a11y-* exempt (they separate by
luminance + texture, not hue). Layer ④ is about legibility rather than hue, so **no
palette is exempt** — it runs over all 32, a11y included. Layer ② (fill vs `--bg`)
is a *design intention* the ① border makes safe, not a machine-checked number.
The shipped values are regenerated per
theme by a deterministic recipe from each theme's own hues — not copied from a
proposal deck. To start a new theme, copy a shipped fill/mark block (indaco / cuoio)
and re-hue it (the `new:theme` scaffold does this for you).

**Paired ink** (flips with the fill tier):

- `--cat-on-fill` — the label ink on every `--cat-N-fill`. Because the fill
  goes pale→jewel across modes, this **must flip**: `var(--text-heading)`
  (dark ink on the pale light fill, light ink on the jewel dark fill). A
  fixed dark hex fails `checkCatContrast` in dark mode.
- `--cat-on-mark` — the ink on every `--cat-N-mark`. Also flips:
  `light-dark(#FFFFFF, <dark>)` (white on the deep light mark, dark on the
  pale dark mark). Warm-palette themes can use a cream off-white for the
  light-mode value. A palette that pins its categorical tier **mode-invariant**
  (the a11y family) must pin this ink to a fixed hex too — an inherited
  `light-dark()` pair flips under a per-slide `_class: dark` while the pinned
  chips stay put, which is how the gitgraph branch labels reached 1.55:1.

**On-canvas ink** (derived, not authored):

- `--cat-N-ink` — the category's hue **as text on the slide**, one per slot.
  Reach for this — never the raw `--cat-N-mark` — whenever a categorical hue has
  to carry **small text** on `--bg` / `--bg-alt`; the mark carries only the 3:1
  non-text guarantee its stroke role is scoped to. Read it **with its fallback** —
  `var(--cat-N-ink, var(--cat-N-mark))` — at every consumer. That spelling is the
  contract, not a decoration: `lib/base/base.tokens.css` declares **no** `:root`
  default for this tier. The original reason was an ordering hazard — the emulator's
  export bundle concatenated the theme *before* the base (`lattice-emulator.js`,
  `paletteCSS + layoutCSS`), so a base default won on equal specificity and silently
  reverted every curated ink to its mark on the PDF path; measured in Chromium, the
  curated `#006D70` became the mark `#008386`. **#1527 flipped that concat**, so the
  hazard is gone and a `:root` default could now be declared safely. It still is not:
  `var()`'s own fallback expresses the rule exactly — it applies only when the token
  is genuinely absent, which is
  what keeps a **third-party** palette on twelve distinct categorical marks rather
  than collapsing to one accent. The fallback is the floor, not the plan: it lands
  on a mark curated to the 3:1 *graphical* floor. Sampling 200 essential sets per ramp
  strategy, 23-34 of 200 then carry at least one sub-AA categorical label under the four
  hue-spread ramps and **176 of 200** under `brand-mono` (worst 2.99:1); with the tier,
  0 of 200 on every strategy. So the
  Studio's `deriveTheme` emits this tier itself, from the shared solve in
  `lib/theme/cat-ink.js` — the same recipe `tools/derive-cat-ink.js` writes into the
  hand-authored palettes (#1457). The tier still reads *the ink is the mark, unless the mark fails*
  — most slots are generated byte-identical to their mark. A
  palette declares all twelve at `:root`, like every other categorical slot — but
  does not hand-pick them: `node tools/derive-cat-ink.js` generates the block from
  that palette's own mark cycle, holding hue and chroma and solving only lightness
  until the ink clears AA on both surfaces. Most slots come out **identical to their
  mark**, because the mark already cleared; only the ones that fail move, by the
  least distance that works. `derive-cat-ink --check` runs in the build, so a
  hand-edit or a re-hued mark cannot leave the two out of step.

**Texture adoption (optional).** A monochrome (onyx) or CVD-safe theme that
can't separate categories by hue declares 12 `--cat-N-texture:
url(#latt-<set>-N)` tokens, and every categorical diagram fills with a
repeating pattern instead of flat color. Undeclared = flat color,
byte-identical. See `engineering/textures.md`.

**Structural**

- `--diagram-stroke` — universal fill border. Saturated, reads on every
  `--cat-N-fill` tint including white.
- `--diagram-line` — edges and arrows. Near-black on light canvas; uses
  `light-dark()` so it flips on dark canvases (where edges run on the
  dark surface, not inside a band fill).
- `--diagram-accent-warm` — secondary warm brand accent (radar's second
  curve, where a single warm hue against the cool band reads better
  than a second pale tint).

**Quadrant chart** is now a native chart-family component, not a mermaid
diagram — it draws from the chart-family's own `--catN-*` spectrum (tunable
per theme via `--chart-catN`) and no longer uses theme-defined
`--c-quadrant-*` slot tokens. See `lib/components/chart/quadrant/`.

### Chart-family palette (`--chart-catN`, `--chart-state-*`)

The chart bucket (pie, quadrant, radar, gantt, kanban, progress,
state-chart, timeline-list, word-cloud) draws from its **own** two
spectrums, defined in
`lib/components/chart/_chart-family/chart-family.css` and decoupled from
the engine-wide `--cN` accents:

- **Categorical** — `--catN-*` (N = 1–8), the well-spaced hue set pie
  wedges / radar curves / kanban lanes cycle through.
- **Semantic** — `--state-{pass,warn,fail,info,mute}-*`, the status
  colors gantt bars / progress fills / status pills use to encode meaning.

Both ship a canvas-aware Apple-hue **default**, so an untuned theme gets a
working chart palette for free. A theme **curates** charts to its own
character by setting the override hooks at `:root`, each a
`light-dark(lightCanvasVivid, darkCanvasVivid)` pair:

| Hook | Overrides |
|---|---|
| `--chart-cat1` … `--chart-cat8` | the 8 categorical hues |
| `--chart-state-pass` / `-warn` / `-fail` / `-info` / `-mute` | the 5 semantic hues |

The `var()` indirection means a theme always wins, and it need only set the
slots it wants to flavor.

**The per-theme curation rationale — the shared "port categoricals, reuse
status" recipe, and how each curated theme expresses it on its own
hue-or-value axis (cuoio by warm hue, onyx by *value* not hue, indaco by cool
hue + a curated crimson `fail`) — lives in
`lib/components/chart/_chart-family/chart-family.style.md`.** This section is
the mechanical contract; the style doc carries the "different yet similar"
design principles.

**Curate assessment-first.** Score candidate `--chart-cat*` / `--chart-state-*`
values *before* committing to them — resolve the full token chain (incl. each
chart's gradient deep stop) and check, on **both** canvases: text-on-fill WCAG
(AA on labels), marks vs canvas (≥3:1, WCAG 1.4.11), and adjacent-slot OKLab
distinctness (≥0.15). It catches what the eye misses — a light-gray category
that vanishes on white, or five status colors that collapse to one value at
the bar's deep stop. The audit's score is text-contrast only; it does not
prove categories are distinguishable, so a passing audit score is a starting
point, not the answer.

### Universal semantic palette (`--diagram-active*`, `--diagram-done*`, `--diagram-critical*`, `--diagram-today`, `--diagram-note`)

Status-signaling colors shared across every theme. **Defined in
`lattice.css` as universal defaults; themes override only if curated
values differ.**

| Token | Role | Default |
|---|---|---|
| `--diagram-active` | Pale peach — in-progress, warn fills | `#F5E6D8` |
| `--diagram-active-mark` | Warm brown — paired stroke for diagram-active | `#92400E` |
| `--diagram-done` | Pale slate — done, muted, grid lines | `#E0E4EA` |
| `--diagram-done-mark` | Saturated slate — paired stroke for diagram-done | `#475569` |
| `--diagram-critical` | Saturated red — critical / blocked / error | `#C20000` |
| `--diagram-critical-mark` | Deep red — paired stroke for diagram-critical | `#8B0000` |
| `--diagram-today` | Saturated yellow — today markers, highlights, note borders | `#F6C700` |
| `--diagram-note` | Pale yellow — aside / footnote surface | `#FFFBE6` |

Gantt task lifecycle uses warm + cool + alarm + mark. Sequence-diagram
notes use note + mark. Mermaid's parse-error box resolves to the gated
**error-chip pair** — `--bg` text on the `--fail` alarm red — NOT
`--diagram-critical` (decoupled in #1181; the old coupling made the error
ink track the categorical-mark tier, which failed on the achromatic diagram
ramps where `--diagram-critical` is a mid-gray). `--diagram-critical` now
serves only the gantt critical bar + the diagram severity ramp — one color
that consolidates the legacy diagram *severity* tokens (pre-consolidation those
were spelled `--diagram-state-critical` AND `--diagram-error-bg`, both saturated
red; `--diagram-critical` replaces both **names**). The mermaid parse-error box
is no longer part of that consolidation — it draws from `--fail`, per above.

cuoio is the one shipped theme that overrides the universal palette —
its leather aesthetic wants a warm pale gold-wash + saddle leather
pair instead of the indaco-derived peach + brown defaults.

## Color-vision-deficiency (a11y) palettes

Four shipped palettes re-tune the **categorical** hues (`--c-*` / `--cat-*`) so
adjacent series stay distinguishable under the common color-vision deficiencies,
selectable the same way as any theme (`theme: a11y-deuteranopia`) and offered in the
docs-site palette picker:

| Palette | Targets |
|---|---|
| `a11y-deuteranopia` | red-green (most common; weak/absent M-cones) |
| `a11y-protanopia` | red-green (weak/absent L-cones) |
| `a11y-tritanopia` | blue-yellow (weak/absent S-cones) |
| `a11y-achromatopsia` | full color-blindness — separates series by **luminance** |

They only re-map the categorical ramp; the surface/ink/semantic contract (and its WCAG
AA guarantee) is unchanged, so any deck renders in an a11y palette without edits. Color
is never the *sole* channel regardless — charts/diagrams pair hue with shape/label
(redundant encoding). Derivation and the audit method live in
`engineering/decisions/2026-06-16-colour-blindness-accessibility.md` and
`2026-06-16-cvd-redundant-encoding.md`.

## The card-on-band rule (scope: kanban only)

> **A `--bg-alt` inner card on a `--cat-N-fill` parent surface.**
> Applies only when the inner item physically sits on top of a
> band-tinted parent surface.

Kanban is the one Mermaid diagram type that has this structure:

- Lane = `<g class="cluster section-N"><rect/></g>` painted with
  `--cat-N-fill`. A large tinted rectangle.
- Ticket = `<g class="node">` inside `.items`, painted with `--bg-alt`.
  A small near-white card on top of the lane.

The contrast between `--bg-alt` (#F2F5FA in indaco) and a pale c-light
tint (e.g. #DCE9F5) gives the reading "card lifted off the lane."

**Timeline and journey are NOT card-on-band**, even though their syntax
suggests a parent-child relationship between period/section and
event/task. The period header is a small `--cat-N-fill` rect at the *top*
of a column; tasks and events stack *below* it on the slide canvas
(`--bg` white). There is no band underneath each card. `--bg-alt` on
`--bg` is virtually invisible, so the rule collapses. These diagrams
follow the **tile-per-element** pattern — events inherit their period's
`--cat-N-fill` fill via the `.section-N` rule, with `--diagram-stroke` providing
the card outline against the white canvas.

| Diagram | Structure | Pattern |
|---|---|---|
| **kanban** | lane (cat-N-fill rect) → ticket on top | card-on-band ✓ |
| **timeline** | period header (cat-N-fill) → events stack below on canvas | tile-per-element (each event = its period's cat-N-fill) |
| **journey** | section header (cat-N-fill) → tasks stack below on canvas | tile-per-element (each task = its section's cat-N-fill) |
| **treemap / mindmap / gitgraph / quadrant** | no outer grouping | tile-per-element (each tile = its own cat-N-fill) |

Audit and design rationale: `engineering/decisions/2026-05-12-diagram-elevation.md`.

## The categorical contrast contract

The default `indaco` palette gives the categorical cycle two **flipping** tiers of
each hue, plus a small universal semantic palette for status signals:

- **Fill tier.** `--cat-1-fill`..`--cat-12-fill` — `light-dark(<pale chromatic>,
  <jewel tone>)`: the leaf/area behind a category, sequence actor backgrounds, pie
  slices. Pale on the light canvas, a jewel tone on the dark canvas.
- **Mark tier.** `--cat-1-mark`..`--cat-12-mark` — `light-dark(<deep edge>, <pale
  tint>)`: the stroke/border, the *opposite* tier of the same hue. Deep on light,
  pale on dark. Decision-list accents, piechart wedges, sankey nodes, gitgraph
  branch dots, xy-chart plot palette, Mermaid's cScale feed.

The tiers **swap** when the canvas flips, so the paired inks flip too:
`--cat-on-fill` = `var(--text-heading)`, `--cat-on-mark` = `light-dark(#FFFFFF,
<dark>)`. A new palette must respect the **three-layer contrast contract** —
`--cat-N-mark` vs `--bg` ≥ 3:1, `--cat-N-fill` vs `--bg` intentionally low,
`--cat-on-fill` vs `--cat-N-fill` ≥ 4.5:1, and fill ≠ mark — measured in both modes
by `checkCatContrast`. Copy a shipped block (indaco / cuoio) and re-hue it rather
than hand-deriving the tiers.

A **fourth** layer rides on top: `--cat-N-ink`, the hue as small text on the slide.
It is generated per palette by `tools/derive-cat-ink.js` from that palette's own
marks — hue and chroma held, lightness solved — and gated against `--bg`, `--bg-alt`
and the print band. Re-hue a mark, re-run the generator, commit the block. The
solve itself lives in `lib/theme/cat-ink.js`, shared with the Studio's generator so
a derived theme carries the tier too; the tool owns the FILE half (which palettes
get a block, how it is spliced in) and runs the solve in strict mode.

Colors that ignore the tier split:

- **Strokes** (`--diagram-stroke`): saturated, picked to read on every
  `--cat-N-fill` tint including white.
- **Lines** (`--diagram-line`): near-black on light canvas, light on dark.
- **Universal semantic palette** (`--diagram-active*` / `--diagram-done*` /
  `--diagram-critical*` / `--diagram-today` / `--diagram-note`): status-signaling colors
  outside the tier system. Alarm is saturated red, mark is saturated
  yellow, note is pale yellow — pinned values, not theme-cycle members.

Every text-bearing token must clear WCAG AA (4.5:1) against the surface
it appears on, in both light and dark mode. `test/unit/contrast.test.js`
asserts this on every shipped palette; new palettes inherit the assertion
automatically. Decorative tokens (borders, hairlines, muted chrome,
spectrum gradient) are WCAG-exempt.

## The per-diagram Mermaid theming surface

Mermaid exposes a `themeVariables` API for theming most diagram types,
but several diagrams hardcode their internal palettes or expose no
configuration at all. `lattice.css`'s DIAGRAM OVERRIDES section ships
per-diagram CSS overrides for the gaps. The rules are palette-blind
(they consume `var(--c-*)`), so a new palette gets them automatically
by defining the token contract — no per-palette CSS rules are needed.

The current overrides cover:

- **Journey** — Mermaid hardcodes X11 named colors for sections. Override
  forces section bars and task tiles to pale fills with dark text.
- **Mindmap** — reads `cScale*` verbatim with no transformation. The
  deep-tone inputs render too saturated. Override forces pale fills per
  level. The root node has both `.section-root` and `.section--1` classes
  with conflicting hardcoded fills; both are overridden.
- **Kanban** — applies its own lighten step. With our deep-tier inputs
  this lands on the pale band, but the column section colors need
  explicit overrides to stay distinct per column.
- **C4** — uses hardcoded C4-Plant colors. The override repaints person,
  system, container, component fills to pale brand tints. Note: C4 emits
  some elements with inline `fill=` attributes that CSS selectors can
  reach but only with `!important` and high specificity.
- **Radar** — no per-curve theme variables. Override forces saturated
  blue + saturated orange curves with semi-transparent fills, plus
  pale-blue concentric grid (the default is gray).
- **Venn** — no per-set theme variables. Override forces three pale
  fills at full opacity, navy borders, and dark text on labels (which
  Mermaid otherwise tints with the set color).
- **Ishikawa** — internal palette baked in. Override forces pale branch
  heads with dark text.
- **Treemap** — applies its own lighten cycle. Override forces six
  per-cycle pale hues so the tree reads as categorical (matching
  quadrant's approach).
- **Flowchart** — node shape paths bypass `.node rect` selectors in some
  cases. Override targets `.node .label-container` to ensure all shape
  types pick up the pale fill.
- **Gitgraph** — branch label boxes (`.branchLabelBkg.label0..7`) need
  pale fills with dark text. The branch dots and lines use `--cat-N-mark`
  for trace visibility. Arrow paths default to black fill (drawing
  wedges between branches); override forces `fill: none`.
- **Gantt** — `taskTextOutsideLeft/Right` ignores `taskTextOutsideColor`
  in some renderer paths. Override forces dark text in the outside-bar
  margin. Documented Mermaid bug.
- **Diagram titles (all types)** — Mermaid renders its own `title`
  directive (or YAML frontmatter `title:`) inside the SVG, doubling up
  with the slide's `## heading`. The palette suppresses the in-SVG title
  for every diagram type with a CSS class on the title element:
  `.titleText` (gantt), `.pieTitleText` (pie), `.radarTitle` (radar),
  `.packetTitle` (packet), and the `[class$="TitleText"]` safety net
  (flowchart, class, ER, requirement, gitgraph). Six types render bare
  `<text>` titles with no class (sequence, journey, C4, quadrant,
  timeline, xy-chart) and remain visible — see engineering/mermaid.md
  §5.4 for the full convention and the diagnostic recipe.

## Avoid in diagram CSS

One Chromium quirk in the Marp preview is worth knowing about even though
we no longer route through Mermaid's themeCSS init parameter:

**Avoid `:not(:has(...))` and `:is(:has(...), :has(...))` in the DIAGRAM
OVERRIDES section.** Silently broken in the marp-vscode preview Chromium
build (it ignores the rule rather than failing loudly). Plain `:has()` is
fine; nested `:has()` inside `:not()` / `:is()` isn't. See
`engineering/gotchas.md`.

## Authoring a new palette

The scaffolder is the fastest path. It copies `themes/indaco.css`,
rewrites the `@theme` directive, stamps `TODO(palette):` markers on
every value you're expected to change, and creates the matching
`<name>-dark.css` wrapper so the dark variant works on day one.

```sh
npm run new:theme verdigris
# → themes/verdigris.css       (starter palette, TODOs at every author-edit point)
# → themes/verdigris-dark.css  (3-line wrapper flipping color-scheme to dark)
```

Then, in order of impact:

1. **Brand axis** (`--brand-<hue>-deep`, `-mid`, `<hue>`). Pick three to
   five shades along a single hue; everything else hangs off them.
   `--surface-inverse`, `--accent`, `--text-label`, and the spectrum gradient
   all derive from these.
2. **Surfaces** (`--bg`, `--bg-alt`, `--border`). Use `light-dark(…)`
   pairs so the dark variant works automatically.
3. **Ink ramp** (`--text-heading`, `-body`, `-secondary`, `-label`,
   `-muted`, `--text-display`) **plus `--muted-mark`**. Every `text-*`
   token must clear WCAG AA (4.5:1) against the surface it appears on —
   `--text-secondary`, `--text-label` **and `--text-muted`** included.
   There is no exception: `--text-muted` used to be documented as
   "chrome-only and WCAG-exempt" while 53 engine-CSS sites painted real text with it
   and it sat below AA on 44 of 72 palette-mode-surface pairs (#1715). The
   decorative half now has its own token, `--muted-mark`, at the 3:1
   graphical floor — so a rule, hairline or empty mark reads `--muted-mark`
   and anything with glyphs in it reads `--text-muted`. Author both as
   `light-dark()` pairs (`--text-muted` → `var(--scheme-dark-text-muted)`,
   `--muted-mark` → `var(--scheme-dark-muted-mark)`) so the dark variant
   resolves automatically. `checkMutedTierFloors` gates both floors; run
   `node tools/contrast-audit.js` to verify. It also gates a CEILING on the two
   quiet TEXT tiers — `--text-muted` and `--text-secondary` must each sit at
   least OKLab 0.030 from `--text-body`. A floor cannot say this: an ink that
   clears 4.5:1 against the canvas clears it just as well sitting on top of the
   body ink, which is what "quieter than body" has to rule out.
4. **Accent** (`--accent`, `--accent-soft`, `--on-accent`). Most-seen
   color after ink. Must clear contrast against `--bg` *and* against
   `--accent-soft`.
5. **Categorical cycle** (`--cat-1-fill` / `--cat-1-mark` through
   `--cat-12-fill` / `--cat-12-mark`, plus the flipping `--cat-on-fill` /
   `--cat-on-mark` inks). Copy a shipped three-layer block (indaco / cuoio) and
   re-hue it — the tiers flip with the canvas, so keep the `light-dark()` pairs.
   The three-layer contrast contract (mark-vs-`--bg` ≥ 3:1, `--cat-on-fill`-vs-fill
   ≥ 4.5:1, fill ≠ mark) is enforced in both modes by `checkCatContrast`.
6. **Structural tokens** (`--diagram-stroke`, `--diagram-line`, `--diagram-accent-warm`).
   Borders, edge lines, and the secondary warm accent.
7. **Universal semantic overrides** (optional — only if your theme has
   curated alternatives to lattice.css defaults for `--diagram-active*`,
   `--diagram-done*`, `--diagram-critical*`, `--diagram-today`, `--diagram-note`). cuoio is the
   one shipped theme that overrides; most new palettes inherit.
8. **Dark-variant tokens** (`--scheme-dark-bg`, `--scheme-dark-text-*`, etc).
   Consumed by every `light-dark()` pair above and by `section.dark`.
9. **Semantic signals** (`--pass`, `--fail`, `--warn`). Usually the same
   green/red/amber across palettes; override if your brand specifies.

You don't write per-diagram CSS overrides. They live in `lattice.css`'s
DIAGRAM OVERRIDES section and reference tokens by `var(--c-*)`, so your
new color values flow through unchanged.

When the values look right:

```sh
# Build the regression gallery decks with your palette and inspect each PDF.
npx lattice test/integration/baseline-decks/gallery.md /tmp/<name>.pdf        -p <name>
npx lattice examples/gallery-jargon.md                 /tmp/<name>-jargon.pdf -p <name>
```

Then register the palette in `.vscode/settings.json` under
`markdown.marp.themes` so the Marp VS Code extension picks it up
for live preview.

### Authoring it by hand

If you prefer not to run the scaffolder:

1. Copy `themes/indaco.css` to `themes/<name>.css`.
2. Update the `@theme <name>` directive at the top of the file to match
   the filename (this is the value authors will type in front matter).
3. Edit the hex values in each `:root` block. Keep the variable names —
   the renderer's variable map references them by name.
4. Copy `themes/indaco-dark.css` to `themes/<name>-dark.css` and change
   the `@theme` directive and `@import` target to match.
5. Register both palettes in `.vscode/settings.json` under
   `markdown.marp.themes` so the Marp VS Code extension picks them up.
6. Build a deck: `node lattice-emulator.js deck.md out.pdf -p <name>`.
7. Re-render `examples/mermaid-gallery.md` with your palette to verify
   every diagram type renders correctly.
8. Run `node --test test/unit/*.test.js` — the contrast assertions will
   catch any pair that slips below AA.

## Verifying a palette

Two checks worth running:

**Contrast** is gated in layers — know which one covers your new palette:

- `test/unit/palette/contrast.test.js` asserts the categorical
  (`--cat-N-fill`/`--cat-on-fill`, `--cat-N-mark`/`--cat-on-mark`) and
  `--text-heading` pairs for **indaco + cuoio** as representative curated
  palettes, in both light and dark.
- Your new palette's **own** categorical tokens are gated across **all** shipped
  themes by `checkCatContrast` (`tools/check-ownership.js`, via
  `npm run build:check`) — the authoritative per-theme categorical check. Many
  themes override `--cat-on-mark` / `--cat-N-mark`, so those are **not** covered
  by the indaco run; this gate is.
- The all-theme **slide-surface** pairs (heading/body/status ink/accent-soft on
  the canvas and card) are asserted by
  `test/unit/palette/theme-surface-aa.test.js`, which drives
  `tools/contrast-audit.js` across all 32 themes.

If a pair fails, lift the text (darker on light, lighter on dark) or lift the
surface; don't lower the bar.

**Mermaid render**: re-render the diagram gallery and visually inspect
each slide. The likely failure modes are:

1. `--cat-N-mark` slot too saturated → mindmap text becomes unreadable.
2. Strokes too pale → flowchart/sequence/class boxes don't read against
   the canvas.
3. A `--c-*` token your palette didn't define — `lattice.css`'s DIAGRAM
   OVERRIDES rules will fall through to Mermaid's defaults. Run
   `test/unit/palette.test.js` to catch missing tokens.
4. Build-time "Palette missing CSS variable" warning — the emulator's
   `parsePaletteVars` must read `layoutCSS + paletteCSS` so universal
   semantic defaults from lattice.css are visible. This is the
   engine's responsibility; report as a bug if it ever surfaces.
