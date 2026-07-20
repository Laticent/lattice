---
status: shipped
summary: >
  Masthead / framing-text alignment (eyebrow, heading, heading-rule, subtitle,
  below-note, key-insight, caption) is baked per-component and disagrees with
  itself — charts and anchor frames center it, the Form band left-aligns it, and
  within a single slide the pieces don't share one axis (the 2026-07-04 subtitle
  patch is a symptom, not a fix). Proposal: stop baking alignment into layouts;
  promote it to a new author register on the accent-finish family — deck-wide
  front matter + per-slide `_class` override — driving ONE `--headline-align`
  custom property that every framing piece reads. Default `auto` = the
  component's own baked default (zero-config unchanged); `left` / `center` /
  `right` pin the whole cluster as one system. Same shipped register contract as
  rule:/eyebrow:/spectrum: (one shared resolver, three render paths, lint vocab,
  Studio catalog, default = today's render).
---

# Mass-head alignment — hoist it out of the components, onto an author register

> **Design model, written before any CSS/transform work** (CLAUDE.md
> "design-before-code"). It names the axis, the pieces, the candidate moves, and
> recommends one; the genuine direction forks are bundled into a single
> confirmation round before implementation begins.

## The problem (verbatim from the brief)

> "Some layout components center their mass-head content, some left-align it. But
> this centering and left-alignment is inconsistent when it comes to eyebrow,
> heading rule, below-note, key insight, etc. This is jarring and aesthetically
> displeasing. This alignment choice should not be baked into the component but
> dictated by the user via configuration — deck-wide or at the slide level.
> Components can have their own default, and we should respect it; in that
> instance it is `auto`."

## What "mass head" is, and where the inconsistency actually lives

"Mass head" = the **framing-text cluster** — the chrome text that frames a
slide's body, as opposed to the body content itself:

| Piece | Where it lives today | Default alignment today |
|---|---|---|
| **eyebrow** (mono-caps kicker) | lifted into `.cell-masthead` under the Form; else pre-heading `<p>` | **left** in the Form band; **center** on charts/anchors |
| **heading** (h1/h2) | masthead band, or section flow | **left** (Form) / **center** (title, closing, divider, chart header) |
| **heading rule** (the hairline — now the `rule:` register) | masthead `border-bottom`; `hr` | band rule is **full-width left**; the free `hr` is **`align-self:center`** |
| **subtitle / dek** | in-flow `<p>` under the title | was **centered + inset** on charts until the 2026-07-04 patch dragged it left |
| **below-note** (hairline note after a block) | `.below-note` div, body tail | **left** (block flow) |
| **key insight** (trailing blockquote panel) | `> blockquote` chrome | **left** (full-width panel) |
| **caption** (chart caption) | `.chart-caption` | **center** |

The pain is two-layered:

1. **Across components** the same piece is aligned differently — a chart eyebrow
   centers, a Form eyebrow lefts; the anchor frames (`title`, `closing`,
   `divider.light`, `big-number`) hard-center everything; the chart family
   hard-centers its `.chart-header`.
2. **Within one slide** the pieces disagree. The clearest fingerprint is
   `2026-07-04-form-subtitle-alignment.md`: under the Form, a chart's eyebrow +
   title lift **left** into the masthead while the subtitle stayed **centered and
   inset** — "a left-aligned title with a centered, inset dek reads as a mistake."
   That decision *hand-patched the subtitle left, family by family.* It fixed one
   symptom of a structural gap: **there is no single control for the axis, so
   every piece makes its own uncoordinated choice.**

And crucially — **the author cannot change any of it.** The `#527` universal
alignment modifiers (`align-left/center/right`, `stage.css:214-238`) move the
**stage body block**, never the header cluster. So a designer who wants a
left-aligned title slide, or a centered Form header, has no lever at all.

## The pattern this obviously wants to be

The repo already ships this exact shape **eight times** — the accent-finish
register family (`finish:`, `mode:`, `spectrum:`, `stamp:`, `lift:`, `rule:`,
`eyebrow:`, …), documented in `2026-07-15-accent-finish-consolidation.md`. Every
one is:

- a pure, fs-free `lib/core/resolve-<x>.js` mapping a front-matter value to a
  `<x>-<value>` class on **every** `<section>`, read identically by all three
  render paths (emulator / `plugins.js` / `runtime`);
- **deck-wide** via front matter, **per-slide** via `<!-- _class: <x>-<value> -->`,
  **typo-caught** as `unknown-<x>` by the linter;
- **palette-blind** CSS keyed off `section.<x>-<value>`;
- **default = today's render** — the zero-config value moves no pixel.

The brief's requirements map one-to-one:

- "dictated by the user … deck-wide or at the slide level" → the register's
  front-matter + `_class` duality.
- "components can have their own default … in that instance it is `auto`" → the
  `auto` default value that emits **no token**, so the component's baked default
  stands untouched.

So this is not a novel mechanism — it is the ninth member of a family, applied to
the one axis (alignment) that was left baked-in.

## The model — a single alignment axis every framing piece reads

**New register `headline:` (working name — see Fork 3), human word "Headline
alignment."** One horizontal axis, four values:

| Value | Token | Effect |
|---|---|---|
| `auto` | *(none)* | **Default.** Respect the component's baked alignment — Form band stays left, `title`/`closing`/`divider`/chart header stay centered. Zero-config unchanged. |
| `left` | `head-left` | Pin the whole framing cluster to the left margin. |
| `center` | `head-center` | Center the whole framing cluster. |
| `right` | `head-right` | Right-align the cluster (the rare escape; included for symmetry with `#527`). |

**The enabling refactor — one custom property, read everywhere.** The reason the
pieces disagree today is that each hard-codes `text-align` / `align-items` at its
own paint site. The fix mirrors the `spectrum:` consolidation (which routed every
accent through the shared `--spectrum` token): route every framing piece through
one inherited seam, **`--headline-align`**.

- Each framing piece's paint site stops hard-coding its axis and instead reads
  `--headline-align` (via `text-align: var(--headline-align)` for prose pieces, or
  an `align-items`/`align-self` map for flex pieces).
- **Component defaults set the property, not the alignment.** A `title` slide sets
  `--headline-align: center` as its *default*; the Form band leaves it `left`
  (the inherited root default). This is the `auto` behavior — the component still
  decides, but through the seam.
- **The register overrides the seam.** `section.head-center { --headline-align:
  center }` at register specificity wins over the component default, so
  `headline: left` on a title deck actually lefts the title. Because the property
  is inherited, one declaration on the section cascades to every framing
  descendant — the pieces can no longer drift apart.

This is the load-bearing move: **alignment becomes data (a token) instead of
baked structure**, exactly as color already is (`var(--token)`, the visual
contract). After it, "which way does the eyebrow point?" has one answer per
slide, and the author owns it.

## Genuine forks (the confirmation round)

### Fork 1 — Scope of the cluster

Which pieces obey `--headline-align`?

- **(A) Top band only** — eyebrow, heading, heading-rule, subtitle. Tight,
  low-blast-radius; but leaves below-note / key-insight / caption still making
  their own call (the brief names below-note and key-insight explicitly).
- **(B) The whole framing set** *(recommended)* — also below-note, key-insight,
  caption. Matches the brief's list and kills the within-slide disagreement
  outright. Slightly larger surface; a centered key-insight panel is unusual, so
  `auto` for those pieces should keep today's left default and only follow an
  *explicit* `center`/`right`.

### Fork 2 — A new register, or extend the `#527` `align-*` modifiers?

`#527` already ships `align-left/center/right` acting on the **body/stage**.

- **(A) New, orthogonal `headline:` register** *(recommended)* — aligns ONLY the
  framing cluster; the body keeps its own `align-*`. Lets a designer pair a
  left-aligned title with a centered body (a real boardroom layout), and keeps
  each control's blast radius small and legible. Cost: two alignment concepts to
  learn (but they name two genuinely different surfaces).
- **(B) One unified alignment** — make `align-center` re-center header *and* body
  together. One concept, but you lose independent control, and it silently
  changes every existing deck that used `align-center` for the body alone.

### Fork 3 — Name

`headline:` (recommended — a fresh human word for "the framing text at the head")
vs `header:` vs `masthead:` (collides with the internal Cell name) vs `align-head:`
(collides conceptually with `#527` `align-*`). §2.5 ("one concept, one name")
favors a distinct word that doesn't overload `masthead`/`align`.

## Invariants (by inversion — "assume it shipped wrong; what did it?")

| The failure that would kill it | The invariant it forces |
|---|---|
| An existing deck moved a pixel on upgrade | **`auto` = today's render.** The default emits no token; component defaults are re-expressed through the seam byte-identically (golden/pixel-checked). |
| The pieces still drift (eyebrow left, subtitle center) | **One inherited property, read by every piece.** No paint site keeps a hard-coded axis. A rot-guard test asserts each framing selector reads `--headline-align`. |
| Centered prose ragged badly | Prose pieces center the **block** (`align-self` / `width` + `text-align:center` only where the piece is a single centered line, as the anchors already do) — never justify long body copy. |
| `right` corrupted the Fit-Spine height math | **No `margin`** (HARD RULE #20); alignment is `text-align` / `align-items` / `align-self`, which measure cleanly. |
| The register drifted across the three render paths | **One shared resolver** (`resolve-headline.js`) + a rot-guard test + lint vocabulary, like every sibling register (#1). |
| A centered key-insight panel looked broken | Fork 1(B): below-note / key-insight follow only an **explicit** center/right; `auto` keeps them left. |

## Blast radius & wiring (if confirmed)

The standard nine-register footprint, plus the seam retrofit:

- **New:** `lib/core/resolve-headline.js` (+ unit test).
- **Render paths:** append the class in `lib/integrations/markdown-it/plugins.js`
  and `lib/runtime/index.js` (both, per #1).
- **Lint:** `headline:` vocab + `unknown-headline` in `lib/authoring/lint-core.js`.
- **CSS seam:** define `--headline-align` default at `:root`/section; retrofit the
  paint sites to read it — `lib/forms/cell/masthead/masthead.css`,
  `lib/components/chart/_chart-family/chart-family.css`, the anchor styles
  (`title`/`closing`/`divider`), `lib/base/base.elements.css` (`hr`),
  `lib/base/base.modifiers.css` (key-insight, below-note), and the register
  classes in `lib/base/base.accent-finish.css`.
- **Studio:** `headline-catalog.ts` (+ rot-guard) and the deck + per-slide pickers
  (provenance-aware "Inherit — <deck>"), reusing `CatalogSelect` (#15).
- **Docs/changelog/demo:** `base.docs.md`, `design-system.md` register table,
  `CHANGELOG.md` `## Unreleased`, this doc, and `examples/<slug>.md` (+ PDF, #9).
- **Sign-off:** alignment changes exported bytes, so a representative demo renders
  **dark + light through both export engines** for human approval (Quality Bar).

Maker-checker on the seam retrofit (cross-cutting CSS, real blast radius, #24/MC).

## Recommendation

Adopt a **new `headline:` register** (Fork 2A) covering **the whole framing set**
(Fork 1B), default `auto` = today's render, driving one inherited
`--headline-align` seam. It is the cheapest path that meets the bar: it reuses the
eight-times-proven register contract, turns alignment into a token the way color
already is, and gives the author the deck-wide + per-slide control the brief asks
for — without disturbing a single zero-config deck.

## Confirmed (2026-07-20) — and shipped

The confirmation round resolved all three forks as recommended:

- **Fork 1 — the whole framing set.** `--headline-align` governs the eyebrow,
  heading, heading rule (the free `hr`), subtitle, below-note, key insight, and
  chart/diagram caption. below-note and key insight follow only an *explicit*
  center/right; their `auto` fallback stays left (a centered panel is unusual).
- **Fork 2 — a new, orthogonal register.** `headline:` aligns only the framing
  cluster; the body keeps its own `#527` `align-*`. A centered headline can sit
  over a left body.
- **Fork 3 — `headline:`.** Human word "Headline alignment"; per-slide tokens
  `head-left` / `head-center` / `head-right`.

### As built

The **seam-with-per-site-fallback** pattern (over the `:where()` default-list
sketched above): the register DEFINES `--headline-align` / `--headline-justify`
only when set, and every paint site reads `var(--headline-align, <its-current
default>)`. So `auto` leaves the properties undefined and each site falls back to
exactly what it renders today — zero-config is provably byte-identical (no
`:where()` specificity juggling, no centralized default map that could rot). Two
channels because both text pieces (`text-align: left|center|right`) and
flex-boxed pieces (`align-items`/`align-self: flex-start|center|flex-end`) read the
one author choice.

Paint sites retrofitted: `masthead-lede` (eyebrow + title, via inherited
`text-align`), the anchor frames (`title`, `closing`, `divider` + `divider.light`
— note `divider` defaults LEFT and `divider.light` CENTER, both preserved by
their fallbacks), the free `hr` (`base.elements.css`), key insight + below-note
(`base.modifiers.css` / `compare-prose.styles.css`), the chart caption
(`chart-family.css`), and the diagram dek + caption (`diagram.styles.css`).

### Verified

- **Zero-config byte-identical.** `npm run preview` reports **0 px** diff across
  the gallery baselines; the full unit suite (3936) + docs Studio tests pass.
- **The cluster follows, the body does not.** Computed-style probe on
  `examples/headline-alignment.md`: on `head-center` / `head-right` the
  masthead-lede and key insight take the register value while the stage body `<p>`
  stays `start` (left) — alignment does not leak to content.
- **Sovereign frames are now overridable.** A `title head-left` / `closing
  head-left` probe reports `align-items: flex-start` + heading `text-align: left`
  — the exact "some center, baked in" complaint, now the author's call.
- Demo `examples/headline-alignment.md` (+ committed PDF) rendered and inspected
  framed; maker-checker on the cross-cutting CSS seam; dual-engine export
  sign-off before merge (alignment changes exported bytes).

### Maker-checker fold (2026-07-20)

An independent checker cleared all five correctness axes (render-path parity,
zero-config byte-identical fallbacks, no body leak, no `head-` prefix collision,
lint vocab) and found three **coverage gaps** — framing headings that centered by
default but weren't routed to the seam, so `headline: left`/`right` wouldn't move
them. All three folded in before merge (on-path — same feature, same
consistency promise):

- **`divider.light` eyebrow** (`base.modifiers.css:80`) — the worst: a *partial*
  retrofit. Its heading + dek already followed the seam, but the eyebrow kept a
  hard `text-align: center`, so `headline: left` would have left-aligned the
  heading while the eyebrow stayed centered — the exact within-slide disagreement
  the feature exists to kill. Now reads the seam.
- **`stats` heading + subtitle** (`stats.styles.css`) and **`list-steps.timeline`
  heading** (`list-steps.styles.css`) — both center via the stage's
  `align-items: center`, which is *coupled* to the centered body (the stat strip /
  timeline). Routed the **framing** heading/subtitle through their own
  `align-self: var(--headline-justify, center)` (+ text-align), so they follow the
  register while the centered body composition stays put — preserving the
  body-independence principle.

### Known scope edge

The short heading-rule signatures (`rule: short` / `rule: accent`) draw a
left-anchored `::after` on the masthead band and do **not** yet follow
`--headline-align` (they stay at the band's left padding edge). The common full
hairline (`rule: auto`/`full`) is full-width and alignment-neutral, so this only
surfaces on the narrow `headline: center` + `rule: short` combination; tracked as
a follow-up rather than pulled into this diff (HARD RULE #18 off-path).
