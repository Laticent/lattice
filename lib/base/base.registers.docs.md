# base — front-matter registers

The **deck-level registers**: keys you set once in a deck's front matter that
propagate to every slide, and that a per-slide `_class:` can override. They are
`theme:`'s siblings — `theme:` picks the palette, these pick the rendering hand,
the backdrop, the divider, the marker shape, the accent, the heading rule, the
kicker, the framing alignment, the card elevation and the slide's own corner.

**Why this file exists.** Nine of these ten lived under `### sketch` in
`base.docs.md` — a per-slide *variant* — because `mode: sketch` is how you turn
sketch on deck-wide, and each new register arrived as "a sibling of the one
above it". A reader looking for `headline:` had no reason to open a section
about handwriting, and the heading structure gave them no way to find it. The
tenth (`corners:`) sat one level up, correctly filed and equally hard to find.
Moved here 2026-08-30. Nine of the ten bodies are byte-identical to what was in
`base.docs.md`, with only the heading LEVEL changed; the tenth, `eyebrow:`, has a
one-line edit, because it pointed at *Eyebrow labels* "above" and that section
stayed behind. Stated exactly rather than as "verbatim", so a future auditor who
byte-compares all ten knows which mismatch is intended.

For the per-slide variants these compose with — `dark`, `mirror`, `numbered`,
`silent`, `sketch` itself, the scales, tone tokens, state markers, treatments —
see `base.docs.md` § Universal variants. For what a register IS in the wider
model, see `design/concepts.md`.

| Register | What it selects | Default |
|---|---|---|
| [`mode:`](#the-mode-front-matter-register-rendering-mode) | The deck's rendering hand — clean, sketch, sketch-clean | `boardroom` |
| [`finish:`](#the-finish-front-matter-register-backdrop) | The palette-blind backdrop layer painted behind content | `none` |
| [`split:`](#the-split-front-matter-divider) | How the deck is divided into slides | `---` rules |
| [`stamp:` / `tone:`](#the-stamp--tone-front-matter-registers-marker-shape) | The marker shape and its tone | *(none)* |
| [`spectrum:` / `spectrum-edge:`](#the-spectrum--spectrum-edge-registers-the-spectrum-accent-finish) | The spectrum accent finish and which edge carries it | *(none)* |
| [`rule:`](#the-rule-front-matter-register-heading-underline) | The heading underline | *(none)* |
| [`eyebrow:`](#the-eyebrow-front-matter-register-kicker-decoration) | The kicker decoration | *(none)* |
| [`headline:`](#the-headline-front-matter-register-framing-text-alignment) | Framing-text alignment | *(none)* |
| [`lift:`](#the-lift-front-matter-register-card-elevation) | Card elevation | *(none)* |
| [`cards:`](#the-cards-front-matter-register-where-a-card-row-puts-its-spare-height) | Where a card row puts the height it does not need | `center` |
| [`corners:`](#the-slides-corner--corners) | Whether the slide's own surface is square or rounded | `square` |

## The `mode:` front-matter register (rendering mode)

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

## The `finish:` front-matter register (backdrop)

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
N%, var(--fin-canvas))` → `var(--fin-canvas)`), never to `transparent`. This is load-bearing for
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
**engine-reserved class**: the Studio raster export (`studio/export/deck-export.js`)
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

## The `split:` front-matter divider

`split:` is the **deck-wide slide divider selector** — another Lattice
front-matter extension (`lib/core/resolve-split.js`), binary by design:

| `split:` value | Slides divide on | Notes |
|---|---|---|
| `headings` | the first `#` (lead) + every `##`, **and** `---` | The **default** (omit the key). Eyebrow-aware + hybrid (below). |
| `rule` | a top-level `---` only | Opt back into the Marp-classic separators-only behavior. |

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

## The `stamp:` / `tone:` front-matter registers (marker shape)

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

## The `spectrum:` / `spectrum-edge:` registers (the spectrum accent finish)

The SPECTRUM is the accent gradient. **By default it paints the brand BAR only** — the section
edge, the `section.dark` top line, and the divider left rail. The in-content structural accents
(table-header rails, the `list-steps` timeline spine, code-panel strips, an author's `---` rule,
split-card underlines) render a **quiet accent-tinted hairline** by default, so a no-config deck stays
elegant and low-noise. `spectrum-trim: on` flows the spectrum onto that structure too. The keys
are siblings of the registers above (`lib/core/resolve-spectrum.js`), propagated to every section
and overridable per slide; a typo is caught as `unknown-spectrum` / `unknown-spectrum-edge` /
`unknown-spectrum-trim`.

**`spectrum:` — the STYLE (the gradient identity).** Redefines the `--spectrum` token at the
section level. It always drives the brand bar; with `spectrum-trim: on` it drives the structural
accents too. White-label lives here: pick a client's single color with `solid` and set the
theme's `--accent` to their brand.

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

**`spectrum-card:` — an INDEPENDENT spectrum rail on CARD surfaces (opt-in).** Off by default.
Paints a rail on every card (the `cards-grid` / `cards-stack` `.card`, and the `stats` /
`pricing` / `verdict-grid` tiles). Unlike the section bar, the card rail tunes on its OWN two
axes — a STYLE and a PLACEMENT — because every spectrum variant is on-brand: `auto` follows the
deck bar, or PIN `solid` / `duo` / `mono` / `rainbow` regardless of what the bar shows. Per-slide:
`_class: spectrum-card-duo` pins one slide, `_class: spectrum-card-off` opts one out. A typo is
caught as `unknown-spectrum-card` / `unknown-spectrum-card-edge`.

| `spectrum-card:` value | Token | Effect |
|---|---|---|
| `off` | *(none)* | No card rail. **The default** (omit the key). |
| `auto` | `spectrum-card` | A rail that follows the deck's spectrum STYLE. |
| `solid` | `spectrum-card-solid` | Pin the rail to the theme's distinctive solid accent. |
| `duo` | `spectrum-card-duo` | Pin the rail to the accent → endpoint two-tone. |
| `mono` | `spectrum-card-mono` | Pin the rail to a quiet accent tint ramp. |
| `rainbow` | `spectrum-card-rainbow` | Pin the rail to the full theme ribbon. |

**`spectrum-card-edge:` — WHERE the card rail sits.** `left` (default) / `top` / `right` /
`bottom`. Independent of the STYLE axis; overridable per slide (`_class: spectrum-card-edge-top`).

| `spectrum-card-edge:` value | Token | Effect |
|---|---|---|
| `left` | *(none)* | A rail on the card's left edge. **The default** (omit the key). |
| `top` | `spectrum-card-edge-top` | A rail across the card's top edge. |
| `right` | `spectrum-card-edge-right` | A rail on the card's right edge. |
| `bottom` | `spectrum-card-edge-bottom` | A rail across the card's bottom edge. |

Kept opt-in on purpose: a rail on *every* card by default would be the ransom-note look — turn
it on where it earns its place.

**`spectrum-trim:` — how much the STRUCTURAL accents carry the spectrum.** Three tiers of
increasing presence on the in-content accents (table-header rails, the `list-steps` timeline
spine, code-panel strips, the `hr` rule, split-card underlines). Off by default — those accents
stay a quiet accent-tinted hairline, so the spectrum stays on the brand bar alone (elegant,
low-noise). Per-slide `_class: spectrum-trim` / `spectrum-trim-restrained` opts one slide in at a
tier, `spectrum-trim-off` out.

| `spectrum-trim:` value | Token | Effect |
|---|---|---|
| `off` | *(none)* | A quiet accent-tint hairline (`--spectrum-quiet`). **The default** (omit the key). |
| `restrained` | `spectrum-trim-restrained` | A single-hue accent ramp (`--sp-fill-mono-h`) — present but quiet, held constant regardless of the bar (a two-tier look that never clashes). |
| `on` | `spectrum-trim` | The deck's **full** spectrum flows onto the structure (follows the `spectrum:` STYLE). |

The keys compose: `spectrum: duo` + `spectrum-edge: left` is a two-tone rail on the left; add
`spectrum-trim: on` to flow that duo onto the table rails and rules too, and `spectrum-card: auto`
to extend it into a rail on each card — or `spectrum-card: rainbow` to override the cards to the
full ribbon while the bar stays duo. `spectrum:` also composes with `accent` /
`tone: edge` (per-slide bar recolors), which win over the deck register where they apply. On
a dark bookend a dark client accent reads faint — pick a theme accent that reads on dark, or
`spectrum: off` there. *(History: `spectrum:` started as a narrow bar-only white-label toggle,
then `solid`/`duo`/`mono` were consolidated to drive every accent
(`2026-07-15-accent-finish-consolidation.md`); the default was then pulled back to the brand bar
alone, with `spectrum-trim:` as the structure opt-in
(`2026-07-16-spectrum-structure-default.md`).)*

## The `rule:` front-matter register (heading underline)

`rule:` is the **heading-underline** accent finish — the line beneath a slide's heading (the
`form` masthead hairline; the split-panel kicker rule). Sibling register
(`lib/core/resolve-rule.js`), propagated to every section, overridable per slide; a typo is
caught as `unknown-rule`. Palette-blind; defaults to today's render.

| `rule:` value | Token | Effect |
|---|---|---|
| `auto` | *(none)* | Today's render — a full hairline where the masthead already draws one, nothing on a plain slide. **The default**. |
| `full` | `rule-full` | An explicit full-width hairline. |
| `short` | `rule-short` | A short rule under the heading. |
| `accent` | `rule-accent` | A short rule painted in `--accent` — a signature without shouting. |
| `none` | `rule-none` | No heading underline. |

`rule:` sets the heading rule's **style**; **its alignment follows the `headline:` register in
effect.** The two are orthogonal: a `short`/`accent` rule sits under the heading wherever the
headline aligns (left / center) — pick the *look* with `rule:`, the *side* with `headline:`.
(`full` is a full-width divider, so alignment is moot; `none` has nothing to align.) The
`short`/`accent` rule is a **real `<hr class="masthead-rule">` element** — the last child of the
masthead-lede flex column — so it aligns with the eyebrow + heading via the cluster's one
`align-items`, tracking the heading with or without a masthead bay. (It used to be an absolutely
positioned pseudo that had to be hand-placed; the element makes alignment a plain flex property.)

`rule:` governs the `form` masthead hairline — the canonical heading underline. The
split-panel kicker rule honors `none` / `accent` (drop or recolor it); `short` / `full` are
masthead-scoped. On a slide with no heading underline, `rule:` is a graceful no-op.

## The `eyebrow:` front-matter register (kicker decoration)

`eyebrow:` decorates the mono-caps **eyebrow** kicker (the code-only line above a heading —
see *Eyebrow labels* in [`base.docs.md`](base.docs.md)). Sibling register (`lib/core/resolve-eyebrow.js`), propagated to
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

## The `headline:` front-matter register (framing-text alignment)

`headline:` sets the **horizontal alignment of a slide's framing text** — the eyebrow,
heading, heading rule, subtitle, below-note, key insight, and caption — as one cluster.
Alignment used to be baked into each layout (a title centered, a content masthead left, a
chart header its own way), so the pieces could disagree within a slide. Now one register owns
the axis: set it deck-wide or per slide, and every framing piece moves together. Sibling
register (`lib/core/resolve-headline.js`), propagated to every section, overridable per slide;
a typo is caught as `unknown-headline`.

| `headline:` value | Token | Effect |
|---|---|---|
| `auto` | *(none)* | **The default** (omit the key). Each component keeps its own baked alignment — left content masthead, centered title/closing/divider-light, centered chart caption. Byte-identical to today's render. |
| `left` | `head-left` | Pin the whole framing cluster to the left margin — even on a layout that centers by default (title, closing, stats, charts). |
| `center` | `head-center` | Center the whole framing cluster — **even on a layout that lefts by default** (the content masthead, kpi, most Form layouts). Aligns the framing *boxes*, not just their text, so a capped heading and its eyebrow/rule land on one axis; with a masthead bay (`meta:`/`logo:`) the cluster centers *beside* the bay, never under it. |
| `right` | `head-right` | Right-align the whole framing cluster — the rare escape hatch. Same box machinery as `center` (one `--headline-justify` axis on the flex lede), just the far edge. |

Only the **framing** text follows — the slide **body** keeps its own alignment. Two distinct
controls, on two surfaces: **`headline:`** moves the framing cluster (this register);
**`align-left`/`align-center`/`align-right`** (the universal `#527` modifiers) move the **body
block**. They are independent, so a left headline can sit over a differently-aligned body.

Under the hood the register drives one inherited seam, `--headline-align` (+ `--headline-justify`
for the flex-boxed pieces); a component's default is the `var(--headline-align, <default>)`
fallback, so `auto` is byte-identical to today's render. Alignment is `text-align` / `align-*`
(never `margin`), so it measures cleanly.

**Coverage.** A framing surface follows `headline:` only if its CSS reads the seam — a new
component must opt in (a rot-guard test pins the covered set). Two layouts don't route their
heading through the seam yet: `split-panel` / `split-compare` (no `masthead-lede`).

**Width is not a component's to set — alignment is the only lever.** The framing assets
(eyebrow, heading, subtitle, heading rule) **fill the masthead band**: the `.masthead-lede`
grid track is the constraint, and it already reserves the right bay, so a `meta:` or `logo:`
line narrows the track and the framing follows. A component must **not** add its own
`max-width` to framing text — that is a bespoke composition decision about chrome that frames
someone else's content, and the deck owns it through this register. Four components used to
(chart-family's heading + subtitle, `content`'s heading, `decision`'s heading); across the
gallery corpus they held 42 framing boxes below their own band and cost 30 of them a line, and
because `cqi` resolves against the section they could not see the bay at all. They are gone —
don't reintroduce the pattern. Fit is **autosplit + atomization**'s job (which may step type
down to make a slide fit), never a width cap's.

The **sovereign bookends are the exception**: on `title` / `closing` / `divider` the heading and
subtitle *are* the slide's content rather than a frame around it, so a composed measure there
is the component's own call.

### The two bookend measures

Those three components share **two tokens**, and they are the only width caps on framing text
left in the engine. They are named, documented, and yours to override:

| Token | Default | ≈ | Applies to |
|---|---|---|---|
| `--measure-bookend-heading` | `16em` | 33 characters | `title` h1, `closing` h2, `divider` h2 |
| `--measure-bookend-lede` | `26em` | 56 characters | `closing` subtitle + list rows, `divider.light` subtitle |

**They bind on landscape, with one exception.** Portrait frames are narrower than either token,
so both go inert there; on square the heading measure does too. The square lede clears `closing`'s
frame by ~10px — but `divider.light` drops divider's left inset, so its frame is ~54px wider and
the lede measure binds there by about 1em. Change the bookend proportion for a whole deck from
front-matter:

```yaml
---
marp: true
style: |
  :root { --measure-bookend-heading: 22em; }   /* a wider title block */
---
```

**Deck-level is the only supported scope.** There is no `_style:` spot directive — `style` is a
global-only front-matter key, so a per-slide override would need its own selector, and the only
hook for one is a class token `lint:deck --strict` rejects as unknown. If a single bookend needs
a different proportion, that is a signal the *deck's* measure is wrong; change it once in
front-matter.

They are written in `em`, not `cqi`, and that is load-bearing rather than incidental. A measure
is a count of *characters*, so it belongs to the type; `cqi` is a fraction of the *slide*. The
two agree only while the type size holds still, and it doesn't — the scale is curated per
orientation, so the `cqi` caps these replaced allowed ~22 characters per line on landscape and
~12 on portrait. `em` costs nothing in resolution-independence, because `--fs-*` is itself `cqi`.
Full reasoning: `engineering/typography.md` §8 and
`engineering/decisions/2026-08-02-sovereign-bookend-measures.md`.

A measure is also **not** line balance. The cap decides how wide the block is; `text-wrap:
balance` decides where the breaks fall inside it. Every bookend heading carries both — widening
a cap to cure an orphaned last word only moves the orphan, and buys a longer line for nothing.

## The `lift:` front-matter register (card elevation)

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

## The `cards:` front-matter register (where a card row puts its spare height)

A row of cards (`cards-grid`, `verdict-grid`) is a wrapped flex container handed the full
height of the stage. **Stretching** its lines to share that height makes a card holding one
line of text as tall as the row, carrying the difference as empty space inside itself — so
the cards are sized to their text and the band is centered by default, and `cards:` hands
the author the rest. Sibling of the registers above (`lib/core/resolve-cards.js`),
propagated to every section, overridable per slide.

| `cards:` value | Token | Effect |
|---|---|---|
| `center` | *(none)* | Cards shrink to their text; the band sits at the stage's optical middle. **The default** (omit the key). |
| `stretch` | `cards-stretch` | Cards fill their row; a sparse card carries the empty space inside it. This is what every deck did before the register. |
| `top` | `cards-top` | Cards shrink; the band sits under the headline rule and the spare height collects at the bottom. |
| `spread` | `cards-spread` | Cards shrink; the spare height is shared out between the rows, widening the gaps between them. |

Per slide, `<!-- _class: cards-stretch -->` fills one slide's row in a centered deck, and
`<!-- _class: cards-center -->` puts one slide back to the default in a deck that set
something else (include the layout too, e.g. `_class: cards-grid cards-stretch`).

**Pick by how full the cards are, and check the gutter.** `center` and `top` both keep the
gap between rows equal to the gap between columns, so the grid still reads as a grid;
`spread` deliberately widens the row gap, which suits two rows of one-line cards and looks
wrong when the rows are already close. Two cases where `stretch` still earns its keep: a
grid whose cards are genuinely full (nothing to reclaim, and stretching keeps the band
flush to the stage), and a slide that ends in a **key-insight blockquote**, where shrinking
the cards pulls them away from the panel below.

**How it works, and why a per-family default survives.** Each non-default value sets
`--cards-align`, and a card row reads `align-content: var(--cards-align, …)` with **its
own** default in the fallback — so `cards: center` stamps nothing and every rule resolves
to its own value. That matters at tall and strip, where `cards-grid` is a single column of
full-width cards rather than a grid and paces them down the frame: omitting `cards:` keeps
that pacing, while `_class: cards-center` centers the column. The split-page
rules override `align-content` outright at higher specificity, so a run's pages still look
alike whatever the deck asked for. Wired today on `cards-grid` and `verdict-grid`; other
card components still stretch until they opt in. See
`engineering/decisions/2026-09-01-card-stack-vertical-alignment.md` §5.

## The slide's corner — `corners:`

Whether the slide's own surface is square or rounded. A sibling register of the ones
above (`lib/core/resolve-corners.js`), propagated to every section, overridable per
slide.

| `corners:` value | Token | Effect |
|---|---|---|
| `square` | *(none)* | Hard corners. **The default** (omit the key). |
| `rounded` | `corners-rounded` | The slide rounds, at the theme's radius. |

Per slide, `<!-- _class: corners-rounded -->` rounds one slide in a square deck and
`<!-- _class: corners-square -->` squares one slide off in a rounded deck (include the
layout too, e.g. `_class: cards-grid corners-square`).

**One token, and it is the engine's.** `--slide-radius` is `0` unless the register turns
it on; `section.corners-rounded` (`base.modifiers.css`) is the single place that gives it
a length — `calc(1.5 * var(--_sec-1cqi))`, about 19px at hd. It is a **different tier**
from `--radius-sm/md/lg`, which round things *inside* a slide (cards, images, code
panels) and are wrong for this job.

There is deliberately **no theme-facing radius token**. An earlier cut shipped one, on the
engine-owns-names / theme-owns-values reading of
`engineering/decisions/2026-08-09-color-theme-ownership.md` — but that charter is about
*color*. A corner has no per-palette answer worth varying, no theme in the tree wanted
one, and a theme that ever does is CSS: redeclare `--slide-radius` under
`section.corners-rounded`.

Two implementation notes worth knowing before you touch either:

- **It clips with `clip-path`, not `border-radius`.** The brand bar is the section's own
  `border-top` painted with `border-image-source: var(--spectrum)`, and a border image
  does **not** honor `border-radius` — the bar keeps square corners and pokes past the
  rounded surface. `clip-path: inset(0 round R)` clips the whole element, border image
  included, so one property covers the top bar and all four `spectrum-edge` rails.
- **The rounded value is anchored to `--_sec-1cqi`.** It is consumed by the section's own
  clip, and a section cannot query its own container — a bare `cqi` there escapes to the
  host viewport, so the corner would scale with the browser window instead of the slide.

The Studio's live preview follows the rendered slide rather than guessing: it reads the
radius back off the frame (`docs/src/lib/deck-corner.ts`) as a *fraction* of the slide's
width, so the corner holds its proportion at every split position and screen size. Before
this register it clipped at a fixed 12px of its own, which is what made a preview disagree
with its own export (#1649). The gallery tiles, navigator thumbnails and Fabricate
specimens deliberately keep their own card corner — a tile is a frame around a slide, not
the slide — and `DeckPreview` touches no host that has not asked via `onCorner`.

**What sits behind the slide in a preview is the APP, not a stray gray.** The frame's own
`html, body` is `transparent` (`docs/src/lib/single-slide-render.ts`); it used to paint a
fixed `#e7e7ea` / `#0c0c0c` belonging to neither the deck nor the app, which a rounded
corner would have exposed at all four corners by construction. Be precise about what
replaced it, because "nothing" would be wrong: `iframe.live` still carries
`background: var(--bg)` (`docs/src/styles/landing.css`) as the pre-paint white-flash guard,
so the opaque layer behind the slide is the **app's** `--bg`. Under a `paletteOverride` —
which is the Studio previewing a deck whose theme differs from the app's — that is a
foreign palette one layer down. It is invisible while the host box and the slide clip to
the same shape, and it is why they are kept in step rather than left to coincide.

**The corner berths move with it.** The overflow / illegible / fix-me author-warning flags
sit in the slide's corners, inside the arc a rounded deck cuts, so they inset by a fraction
of `--slide-radius` — an alarm surface must not go quiet because a deck chose a shape. The
token is typed `0px` rather than `0` precisely so that inset resolves to a length on a
square deck: a unitless zero inside `calc()` is a `<number>`, which makes the whole
declaration invalid and drops the marker into flow. Gated by an absolute-distance
assertion in `test/integration/parity/content-clipped-pill.test.js`.

**In an EXPORT the corner is a capability of the FORMAT, and a format that cannot hold it
renders square.** A rounded corner is a hole — the slide stops painting and whatever is
behind shows through — so it only reads as a corner where the artifact can carry
"nothing". Where it cannot, the hole fills with something we do not control, and you get
four pale notches rather than a rounded slide. So the engine squares those formats rather
than rounding then flattening:

| Export | Corner | Why |
|---|---|---|
| `.png`, `.zip` PNG / WebP (slides **and** thumbnails) | **rounded** | an alpha channel carries a real hole |
| `.html`, `--player` / `--fluid` — **on screen** | **rounded** | a live document; the host paints behind it |
| the same documents, **printed** | square | a printer's page is paper too, so `@media print` squares them |
| `.zip` JPEG | square | the format has no alpha channel |
| `.pdf` (vector and `--raster`) | square | a page is paper |
| `.pptx` | square | the image sits on the **recipient's** slide background, so the corner would take the color of their PowerPoint template |

This holds identically on the CLI and in the Studio's Share sheet. **Want a rounded
artifact? Export PNG or WebP.**

Two consequences worth knowing. A deck with no rounded **slides** is unaffected in every
format — square is still the default and still stamps no token. Note that is about slides,
not about the front-matter key: the transparent capture is gated on a slide actually
carrying the corner, so a deck that says nothing in its front matter but opts one slide in
with `_class: corners-rounded` *does* get the alpha channel on that slide, and correctly
so. And in Lattice's own `--player` viewer the backdrop is the deck's own `--bg`, so a
rounded corner there is *invisible* rather than wrong: the slide and the surface behind it
are the same color.

Record, with the per-format measurements on both exporters:
`engineering/decisions/2026-08-17-corner-export-capability.md`.

| Token / class | Effect |
|---|---|
| `sketch` | Full handwriting (headings **and** body) + drawn boxes. The default. |
| `sketch sketch-clean-body` | Keep hand headings + boxes; return prose to the clean `--font-body` for text-dense slides. |
| `--sketch-ink` | The ink the boxes are drawn in (defaults to `--text-heading`); a theme override seam. |
| `--sketch-font-display` / `--sketch-font-body` | The hand fonts; swap either to re-flavor the whole finish in one line. |
| `--pill-font` | Re-pointed at the hand body face under `sketch` so label chips/badges read hand-drawn; override per theme to restore a clean label font. |
| `--font-label` | The label voice (eyebrows, table headers, stat sub-labels, header/footer, pagination); defaults to `--font-mono`, re-pointed at the hand sans under `sketch`. |
| `--rough-ink-stroke` | **Enrollment.** A structure with a non-empty value gets its lines drawn in rough.js, in this color. Set it (and `--rough-ink-width`) to opt a new structure in. |
| `--rough-ink-width` | Stroke weight for that structure's ink, in px. The frame is drawn a little heavier than the rules it encloses. |
| `--rough-ink-cols` | Set to `1` to also ink a table's COLUMN boundaries. Off by default, and nothing ships it on — no table component rules columns, and inking them unasked turns a comparison table into a spreadsheet. |
| `--sketch-wave` | The old tiled pen-waver, now the **no-script fallback only**. Every rule it draws is switched off under `:root.rough-inked`. Don't add callers. |

**PDF-safe by design.** Boxes are still `border-radius` geometry; lines are
rough.js `<path>` data, painted into one SVG overlay per slide after layout
settles. What was prototyped and rejected in June was an SVG **filter**
(`feTurbulence` + `feDisplacementMap`) — it survives on screen but collapses
Marp's print-scale transform, shrinking the slide in the PDF. **A plain
`<path>` is not a filter**, which is why rough.js was available all along:
Mermaid's `look: 'handDrawn'` has been shipping the same primitive through
this pipeline since 2026-08-13. Strokes are seeded from each structure's key,
so two renders of a deck are byte-identical.

The ink is painted by script, so a document that never runs the runtime — a
raw `.html` sidecar opened with JS off — falls back to the old
`--sketch-wave` rules rather than showing none. PDF, PNG, PPTX and `--player`
exports all carry the ink. See
`engineering/decisions/2026-08-18-rough-ink.md` and
`engineering/decisions/2026-06-11-sketch-finish.md`.

**Charts/diagrams.** The finish reskins the heading, the HTML legend, and
card text, but cannot reach inside a chart's SVG geometry — wedges, bars,
and lines keep their own marks. Hand-drawn chart *marks* are a deferred
follow-up.
