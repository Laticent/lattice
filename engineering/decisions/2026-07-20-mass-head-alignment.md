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

## Adversarial trio (2026-07-20)

Ran the full trio on the shipping diff (HARD RULE #25): red team + Munger
inversion + a second independent checker. The checker cleared correctness a
second time. The **red team found the one real defect**, now fixed; Munger
surfaced disclosure/process gaps, addressed below.

### Red-team F1 — center/right did not put the cluster on ONE axis (FIXED)

`text-align: center/right` resolves against *each element's own box*. But two
kinds of framing box coexist and have **different widths**: the masthead cluster
lives in the `masthead-lede` grid column (inset from the frame's right edge by the
bay column + gap), and the readable-measure-capped prose boxes — the heading
(`max-width` ~64ch), the key-insight/below-note `<p>` (~64ch) — are pinned inside
their caps. So `head-center`/`head-right` centered/right-aligned each piece within
*its own* box, and the pieces landed on visibly different axes (measured ~200px
apart with a bay; the shipped demo baked it in). `head-left` was unaffected (every
box shares the left origin).

**Root cause:** `text-align` aligns *text within a box*; it cannot move a
capped/inset **box**. The fix aligns the boxes, not just their text:

1. **Flex the capped framing containers** — `masthead-lede`, the key-insight
   `blockquote`, `.below-note`, and the chart/diagram caption become
   `display:flex; flex-direction:column; align-items: var(--headline-justify, …)`.
   Now the capped label/heading/body **boxes** center/right-align on their full
   parent (panel or frame), so a short line lands on the frame axis — not inside
   its own measure cap. `text-align` still handles multi-line wrapping.
2. **Collapse the empty bay** — `section.form:is(.head-center,.head-right)
   .cell-masthead:has(> .masthead-bay:empty)` drops the reserved bay column + gap,
   so a bay-less masthead centers/right-aligns the cluster on the **full frame**,
   matching the stage-level framing.

Verified on the real PDF (both center and right): eyebrow, heading, key-insight
label, and key-insight body all land on one axis. **Byte-identical under `auto`**
re-confirmed AE=0 across the gallery baselines (flex column with
`align-items:flex-start` == the prior block-left flow for these single-column
stacks).

**Correcting the earlier fold note:** the "As built" text above said `stats` /
`list-steps.timeline` headings follow via `align-self` "through the stage's
`align-items:center`." Under the Form those headings actually lift into
`masthead-lede`; with that cell now flexed, their `align-self` (and the cell's
`align-items`) is what carries them — and `text-align` covers the non-Form path.
The declarations are correct; the mechanism is the flexed lede, not the stage.

### Remaining scope edges (documented, not fixed — HARD RULE #18 off-path)

- **Masthead WITH a bay** (a `meta:`/`logo:`/`status:` tile): the cluster centers/
  right-aligns in the space *beside* the bay, not the full frame — the title must
  not run under the meta. So with a bay, center/right can sit inset from the
  stage-level framing. `head-left` is always exact; a bay-less masthead is exact.
- **`split-panel` / `split-compare`**: the two-column layouts have no
  `masthead-lede`, so `headline:` sets the token but no paint site reads it — a
  silent no-op on their panel headings.
- **Excluded layouts** (`quote` / `citation-card` / `math` / `redline` /
  `inventory`): their masthead heading follows the seam, but their body (pull-quote,
  equation, …) keeps its own alignment — so `head-center`/`right` can reintroduce a
  heading-vs-body split for these few layouts.

**Fixed after review (2026-07-20):** the `rule: short` / `rule: accent` short
heading-rule `::after` now follows the seam too — it was left-anchored while the
heading centered/right-aligned (caught live on the docs preview: a right headline
over a left accent rule). The pseudo is absolute so it can't read
`--headline-justify`; it's positioned per alignment instead
(`head-center` → centered, `head-right` → right, `head-left`/auto → left). The
heading rule is one of the named framing pieces, so this was in scope, not an edge.

### Munger inversion — disclosures & process

- **`auto` preserves the per-component inconsistency BY DESIGN.** The brief asked
  for `auto` = "respect the component," and byte-identical `auto` is a hard
  requirement, so the default output is deliberately unchanged — consistency is
  opt-in. A curated *consistent default* (or `headline:` shipped in the deck
  template) is the real follow-up to the root cause; filed, not silently skipped.
- **Two alignment controls** — `#527` `align-*` (body block) and `headline:`
  (framing cluster) — share value words. They are two concepts on two surfaces
  (Fork 2 kept them orthogonal on purpose), not a §2.5 one-concept-two-names
  violation, but "align" is now ambiguous. Disambiguation added to `base.docs.md`
  and the Studio labels the pickers by surface.
- **The seam is opt-in by convention and ungated.** There is no machine definition
  of "all framing text," so a *new* component can silently forget to read the seam
  (the trio found several missed sites by hand). Mitigation shipped: a rot-guard
  test (`resolve-headline.test.js`) pins every currently-covered site — dropping a
  seam read fails the build. It cannot catch a brand-new unretrofitted component;
  that boundary is documented here and in `base.docs.md`.

## Scoped to auto + left — the shipping decision (2026-07-20)

A **second adversarial trio** (run on the post-first-trio fixes) plus a live
review pass changed the shipping shape. The pattern across both trios was
unambiguous:

- **`auto` + `left` is rock-solid** — byte-identical, clean, a pure `text-align` /
  `align-*` seam read, and it *is* the brief's actual complaint ("components
  hard-center; let me left-align"). No trio found a single defect on this path.
- **`center` / `right` was a recurring edge-case source** — because `text-align`
  cannot move a max-width-capped or bay-inset **box**, center/right needed a pile
  of box-level machinery (flex-ified framing containers, a `:has(:empty)` bay
  collapse, per-alignment pseudo positioning). Each fix spawned another edge:
  - the flex rework broke `auto` byte-identity on `glossary` (its
    `justify-content:space-between` range pill collapsed when the heading shrank to
    content width — second-trio checker, HIGH);
  - with a **non-empty masthead bay**, the masthead cluster aligns *beside* the bay
    while the stage framing (key insight, below-note, caption) and the accent rule
    align on the *full frame* — the cluster splits, and this is **structural**
    (the lede is inset by the bay; the stage is not), so it has no clean fix
    (second-trio red team, HIGH);
  - bulleted key-insight dash markers detach under center/right;
  - the Munger inversion flagged the `:has(:empty)` collapse as a silent
    render-path landmine (a future persistent bay child disables it globally) and
    the flex-on-prose as a permanent trap for future content.

**Decision (human, A/A):** ship the `auto` + `left` core now; make `center` /
`right` a **separate, properly-designed follow-up** that decides the bay behavior
up front rather than patching it reactively. Also deferred: a **consistent-defaults
pass** (making each component's *own* default framing internally consistent so
`auto` stops reproducing pre-existing splits like `stats`' centered-heading /
left-eyebrow — surfaced live on the docs preview).

**Removed from the shipping diff** (all center/right-only machinery):
`head-center` / `head-right` tokens and section rules; the `:has(> .masthead-bay:empty)`
collapse; the accent-rule per-alignment `::after` repositioning; and the
flex-ification of the framing containers (`masthead-lede`, key-insight blockquote,
`.below-note`, diagram/caption) — `left` needs none of it, since every framing box
is already left-pinned in plain block flow.

**What ships:** `headline: auto | left`. `auto` = byte-identical (respect the
component); `left` = one inherited seam (`--headline-align` for text pieces,
`--headline-justify` for the already-flex pieces: `hr`, the anchor frames, the
chart caption, `stats` / `list-steps.timeline` headings) that pins the whole
framing cluster left — even on a layout that centers by default. `resolve-headline.js`
`HEADLINE_NAMES` is `['auto', 'left']`; the rot-guard, lint vocab, and Studio
catalog track it. `center` / `right` are reserved but not live (the resolver maps
them to no token; the linter flags them as `unknown-headline`).

---

# RE-ARCHITECTURE (2026-07-20) — components are alignment-agnostic; the author owns alignment

**This section supersedes the alignment MODEL above.** The prior model's premise —
`auto` = "respect the component's *baked* alignment" — is wrong against a prime
principle the human named explicitly:

> "Components should be agnostic to design decisions an author makes. We can give
> them a **preset**, but the author makes the decision. A component doesn't own
> placement of the masthead, footer, etc. — it shouldn't own alignment. Authors
> author, and tune via configuration."

A component owns its **structure** (what a masthead *is*, where the bay/footer
sit, how tiles lay out). It must **not** own a **design decision** the author
makes — and alignment is one. Today alignment is baked, inconsistently, at
scattered CSS paint sites (`stats` hard-centers its `h2` while its eyebrow rides
the left masthead band → the two disagree under `auto`). That is the defect.

## The principle, as a system

Alignment is **one axis**, resolved by a cascade the **author sits on top of**:

```
author config (headline:)  ▸  component PRESET (manifest)  ▸  house default (left)
```

- Every framing piece reads one inherited seam (`--headline-align` /
  `--headline-justify`) — the covered set already does; the scattered baked
  `text-align`s are **retired** in favor of it.
- A component contributes a **preset** — a *recommended default*, expressed as
  **data in its manifest**, not baked CSS. The build turns it into the seam's
  default for that component, so the component's whole framing (eyebrow, heading,
  rule, subtitle, note, caption) follows **one** value → internally consistent
  **by construction**.
- The **author's `headline:` config always wins** — deck-wide or per slide.

`auto` no longer means "respect whatever the component baked"; it means "no author
override — the manifest preset shows through," and the preset is a single, clean,
documented value.

## Manifest-driven, not CSS-driven (decided)

The preset is a **declared design decision**, so it lives in the **contract (the
manifest)**, not in `*.styles.css`. Precedent: `build-css.js` already generates
CSS custom properties from manifest data (the Frame `slicing` block →
`section.form[data-family="…"] { --masthead-cols: … }`). The alignment preset is
the same move.

- **Schema** — a new manifest field, `"headline"` (values `left` | `center` |
  `right`). Omitted ⇒ the house default `left`, so only the components that
  *center* (or right-align) must declare it; the **effective** value is surfaced
  for *every* component in `dist/docs/components.json` regardless, so it is fully
  documented and discoverable.
- **Generator** — `build-css.js` emits, per component with a non-default preset,
  `section.<name> { --headline-align: <preset>; --headline-justify: <mapped> }`
  (`left→flex-start`, `center→center`, `right→flex-end`). One generated block =
  one source of truth; the scattered hand-written `text-align:center`s
  (`stats.styles.css`, the anchor frames, chart caption, …) are **deleted** and
  replaced by this.
- **Docs / Studio / AI** — the effective preset flows to `components.json`, so the
  docs, `AGENTS.md`, and the Studio all see it. The Studio's `auto` state reads
  "preset: center — from the component" (provenance), so the author sees the
  default they'd be overriding.
- **Gate** — `check-ownership` (or the schema) requires every component's preset
  to be a known value and the generated CSS to be current, closing the
  silent-coverage rot two trios flagged (a new component can't forget to opt in —
  its effective preset is always defined and shown).

## The register (`headline:`) — the author's override, all four values

`headline: auto | left | center | right`, deck-wide + per-slide `_class: head-*`.
`auto` = no token (the manifest preset shows). `left`/`center`/`right` define the
seam on the section, overriding the preset. **`center` / `right` are back in
scope** — the principle *requires* them: a component preset can be `center`, and
the author must be able to pick any direction, so the seam must support all of
them. (Deferring them, as the prior section did, is incompatible with the
principle.)

## The masthead-bay problem — solved for real, not documented away

The blocker that made me defer `center`/`right`: the masthead framing lives in
`.masthead-lede`, a grid column **structurally inset by the reserved bay** (meta /
logo / status), while the stage framing (key insight, below-note, caption) spans
the **full frame**. So `center`/`right` put the two halves on different axes when
a bay is present. Under this principle that is not an acceptable "edge" — "the
author centered it" must mean *centered on the slide*.

**Fix:** the masthead framing aligns on the **full frame**, exactly like the
stage. The bay stops *insetting* the framing — it becomes **corner chrome** (the
lede spans the full masthead width; the bay overlays the top-right and the title
wraps/clears it), so the eyebrow, heading, and rule share the stage's centerline.
The prior `:has(> .masthead-bay:empty)` collapse hack (whitespace-fragile, a
render-path landmine) is dropped entirely; full-frame alignment is unconditional.
(Detail to prototype: overlay vs. an explicit two-row masthead when a centered
title would otherwise collide with the bay.)

## Preset table (proposed — finalized by a per-component audit in build)

House default **`left`** (the masthead band's natural origin). Declare `center`
where the component's *body* is centered so its framing agrees with it:

| Preset | Components |
|---|---|
| `center` | anchors `title` / `closing` / `divider.light`; centered-body evidence `stats` / `kpi`; the chart family (caption/header); `big-number`; `quote` |
| `left` (default) | everything else — `content`, cards, lists, comparison, inventory, legal, diagram, code, … |

The audit during implementation confirms each; the point is the value is **one per
component, declared, and documented**, never split across paint sites.

## Byte-identity — a deliberate, signed-off break

The prior invariant ("no deck moves a pixel") **cannot** hold and **shouldn't**:
making a split component consistent *necessarily* moves the piece that was
disagreeing (e.g. `stats`' eyebrow snaps from left to center to match its
heading). That is the fix, not a regression. So:

- `auto`/preset renders **change** for exactly the components whose baked
  alignment was internally inconsistent; consistent components are unchanged.
- This is an **export-bytes change → export sign-off** (Quality Bar), in dark +
  light, before merge.
- Golden/pixel baselines are **re-blessed** as part of the change, with the diff
  reviewed as the record of what moved and why.

## Blast radius & sequencing

Real blast radius (schema + generator + every centered component + the register +
the bay). Maker-checker on the generator + schema; the adversarial trio on the bay
solution (the genuinely novel part). Likely a **fresh branch/PR** — this is a
re-architecture, not an increment on the auto+left PR (#1125). Options for #1125:
(a) land it as the `auto`+`left` foundation and build the re-architecture on top;
(b) supersede it. Recommend (a) — the seam + register + Studio + lint from #1125
are the substrate this builds on; the re-architecture adds the manifest preset
layer, revives center/right on the fixed bay, and retires the baked `text-align`s.

## Open specifics to confirm before coding

1. **Manifest field shape** — `"headline": "center"` (single value, house default
   `left` when omitted) vs a richer `"alignment": { headline, … }` object for
   future axes. Recommend the **simple single field** now; widen only if a second
   alignment axis appears.
2. **Preset table** — the proposed assignments above (esp. whether `stats`/`kpi`/
   charts read as *center* or *left* layouts — I lean center, matching their
   centered bodies).
3. **#1125** — land as the `auto`+`left` foundation (recommended) or hold and fold
   everything into one bigger PR.

---

# TRIO VERDICT — the manifest re-architecture is REJECTED; bounded path confirmed (2026-07-20)

The RE-ARCHITECTURE section above was stress-tested by the full adversarial trio
(red team + Munger inversion + independent feasibility checker) **before any code
was cut** — and all three converged on the same conclusion: **the
manifest-single-value mechanism is a step backward from what #1125 already ships.**
The *principle* (authors own alignment; components offer a preset) is sound and is
**already satisfied** by the shipped seam. Recorded here so the rejection is part
of the record, not silently dropped.

## Why it was rejected (three independent lenses, convergent)

1. **Less expressive than the shipped fallback mechanism.** Alignment here is
   scoped **per-variant** and **per-piece**; #1125's per-selector
   `var(--headline-align, <fallback>)` expresses both for free. A single
   `section.<name>` manifest value **cannot**:
   - `divider` is one manifest, two alignments (dark `left` / `.light` `center`,
     `divider.styles.css:23,34`) — a section-level set would inherit and **silently
     regress `divider.light`**. The proposal's own preset table listed the
     *variant* `divider.light`, a granularity the schema can't encode.
   - `diagram` intentionally splits body `left` / caption `center`
     (`diagram.styles.css:59,91`) — "consistent by construction" is contradicted by
     a shipping component whose split is a design choice.
2. **The cascade would ship backwards.** `section.<name>` (preset) and
   `section.head-left` (register) are both specificity `(0,1,1)` → source order
   decides. The cited `slicing` precedent emits **last** (`build-css.js:552-556`;
   confirmed in `dist/lattice.css`: `head-left` @20220 vs slicing @21263) → the
   **preset would beat the author's override.** "Author always wins" was not
   guaranteed.
3. **The crux (the bay) is unsolved and sequenced last.** Full-frame centering vs.
   clearing a `meta:`/`logo:` bay are mutually exclusive; portrait/strip reflow
   collapses the masthead to a single column with no "corner." Marquee "solved for
   real" was documented-away.

Plus the Munger meta-point: six rounds, each larger; the `auto`+`left` scope-down
was the process *working* (two trios + a human converged); a schema + generator +
53-component migration + a byte break to fix ~3 inconsistent components is
over-building. And coverage was overstated — `kpi`/`quote`/`big-number` don't read
the seam yet.

## Confirmed path (human-aligned)

1. **Merge #1125 (`auto` + `left`) as the foundation** — it already embodies the
   principle (author overrides via the register; components offer a preset via the
   seam fallback), and it handles per-variant / per-piece correctly.
2. **Bounded consistent-defaults pass** (separate follow-up, `**Breaking:**`):
   correct the internally-split components' *fallback defaults* in their own CSS —
   `stats` (eyebrow → match its centered heading), `kpi`, `divider.light`. Per
   selector, so variants (`divider.light`) and intentional per-piece splits
   (`diagram`) are preserved. This is the real fix for the `stats`-under-`auto`
   screenshot.
3. **"Official / documented"** → **derive** the effective preset into
   `dist/docs/components.json` (docs / Studio / `AGENTS.md`) *from* the CSS — a
   read-only computed field, **not** a hand-authored, lossy manifest scalar.
4. **`center` / `right`** stay deferred; if pursued, **prototype the masthead-bay
   redesign in isolation and trio *that* first** — it is the load-bearing risk.
5. **Byte movement** from the consistent-defaults pass ships as a `**Breaking:**`
   `CHANGELOG` entry (ideally opt-in / major-version), never a silent re-render of
   shipped decks (HARD RULE #10).

**No manifest `headline` field, no CSS generator, no 53-component migration.** The
seam + register (#1125) is the mechanism; the follow-up is a bounded CSS pass plus
a derived docs field.
