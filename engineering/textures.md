# Categorical texture — the canonical model

Texture is the **non-color channel** that lets a deck tell categories apart when
hue can't carry it alone: a monochrome theme (onyx), a near-monochrome brand
(concrete), a color-vision-deficient palette (the a11y-* themes), or black-and-white
print. Each category slot gets a distinct repeating **pattern** instead of relying on
its fill color. This is the M1 redundant-encoding mechanism from
`engineering/decisions/2026-06-16-cvd-redundant-encoding.md`.

This page is the **living contract**. The dated decision docs record *why* each piece
was built; this page records *what it is now* and *how to use it*. When they disagree,
this page + the source win.

## One vocabulary — say "texture"

| Term | Means | In code |
|---|---|---|
| **texture** | the channel — fill a shape with a repeating pattern tile, not a flat color | `--cat-N-texture`, `lib/core/accessibility-textures.js` |
| **tile** | one 8×8 pattern (a `<pattern>` element) | one entry in a family array |
| **family** | a named collection of tiles with a shared visual language | `GEOMETRIES` (generic), `CONCRETE_GEOMETRIES` (concrete) |
| **set** | a family instantiated with a theme's color ramp, emitted with an id prefix | `latt-onyx-tex-*`, etc. |

"Motif" is **not** a texture term — it belongs to the *finish* subsystem (watermark
marks). Don't reintroduce it here. There is no separate "texture engine" and "motif
engine": every tile is one SVG `<pattern>`.

## What ships today — two families, four sets

The supply side (`lib/core/accessibility-textures.js`, exported as
`texturePatternDefs()`) emits **four sets** built from **two tile families**. The
tiles themselves are the source of truth — read the `GEOMETRIES` /
`CONCRETE_GEOMETRIES` arrays (each entry is commented) rather than trusting a copy here.

| Set (id prefix) | Family | Slots | Ramp | Scheme |
|---|---|---|---|---|
| `latt-a11y-tex` | generic | 12 | a11y light grays, ink `#1a1a1a` | static |
| `latt-a11y-chart-tex` | generic | **8** | deeper chart grays, ink `#f5f5f5` | static |
| `latt-onyx-tex` | generic | 12 | onyx light↔dark ramp, ink **`#8a8a8a`**↔`#f5f5f5` | scheme-flip |
| `latt-concrete-tex` | concrete | 12 | concrete near-mono ramp | scheme-flip |

Three things in that table trip people up — they are deliberate, not accidental:

- **`latt-a11y-chart-tex` emits 8, not 12.** Slot count = the ramp's fill-array length
  (`GEOMETRIES.slice(0, fills.length)`); the chart ramp (`CHART_FILLS`) has 8. Consumers
  only cycle `6n`, so tiles 7–8 are currently unused headroom.
- **onyx shares the *generic* family with a11y** and diverges only in its **light ink**
  (`CAT_INK_ONYX_LIGHT` = `#8a8a8a`, a mid-gray, so the texture whispers under black
  labels) plus its dark ramp. It is not a third geometry set.
- **concrete is the one bespoke family** — cast-concrete / formwork tiles (board-form,
  fluted ribs, herringbone, aggregate speckle) drawn to read as *themed* to the brand.
  A deliberate product choice, not drift.

## Which sets a page ships (#1863)

`texturePatternDefs(only)` emits **only the sets `only` names**, in the table's
order. `only` is normally the return of `texturePrefixesReferencedIn(cssText)` —
the same kernel both render paths call, so they cannot drift (HARD RULE #1). It
scans for `url(#<prefix>-N)` in all three spellings a reference can take
(`url(#x)`, `url("#x")`, `url('#x')`), because CSSOM re-serializes the bare form
with quotes.

**Omit `only`, or pass a non-array, and every set is emitted.** That is the
conservative answer and it is what a caller that cannot read the document's CSS
must take. The asymmetry is the whole safety argument: an unreferenced
`<pattern>` paints nothing, so over-emitting is pure waste — while a reference
with no matching `<pattern>` is an unresolvable paint server, which SVG renders
as **default black**. Every fallback in this layer therefore errs toward
emitting more.

Before this, every page shipped all 92 patterns — 28,490 B — whatever its theme.
A deck on `indaco` now ships 20.

**The two call sites reach the same answer by different routes:**

| Site | Where its CSS comes from | Fallback trigger |
|---|---|---|
| `lattice-emulator.js` | the assembled deck `<style>` (theme chain + layout sheet, post-`sanitizeStyleText`) **plus the slide markup**, since a deck may write its own inline SVG | never — it holds the whole document |
| `lib/runtime/index.js` | the `<style>` elements' `.textContent` in the live document, plus `[fill*="#latt-"]`-style attributes on the slides | a `<link rel=stylesheet>` (text not in the DOM), or a missing `latt-a11y-tex` **sentinel** |

That sentinel is worth understanding before you touch the runtime half.
`lib/base/base.print-textures.css` re-points all 12 print slots at
`latt-a11y-tex-*` and ships inside the engine sheet, so **any** document carrying
Lattice's CSS contains that id — on every theme. Not finding it does not mean
"this deck needs no textures", it means the stylesheet did not arrive as
readable `<style>` text. The first cut of the runtime half read it the other way
and emitted 0 of 92 patterns on such a document; a real-Chromium probe caught it,
reasoning about the code did not.

The same fact is why `section.print` needs no special case: the print references
are in the layout sheet for every deck, so a hue-carried palette still ships the
a11y sets it will need if a slide takes `.print`.

**The runtime's injection is deck-DEPENDENT and therefore re-fires.** It rides
`runAllContentTransforms()`, so a `theme:` edit in a live preview re-derives the
defs instead of leaving the new theme's `--cat-N-texture` refs dangling. Only the
docs-site builders (`docs/src/playground/deck-preview.js`) still call
`texturePatternDefs()` bare: they build the preview document at module scope with
no document to read.

**There is deliberately no cheap change-detector in front of that re-fire, and
the reason is worth keeping.** The first cut gated it on a `<style>`-length
signature. That proxy was unsound three ways, and an independent check found all
three — none of them by testing, all of them by asking what the proxy could not
see:

1. a reference arriving through slide **markup** is a different input to the same
   scan, and moves no stylesheet length at all;
2. the set prefixes are **not length-distinct** — `latt-a11y-tex` and
   `latt-onyx-tex` are both 13 characters — so retargeting `--cat-N-texture` from
   one to the other, the single most natural edit, is invisible **by
   construction**;
3. an early return on an unchanged signature never notices that a live edit
   **destroyed the element**, and on a hue-carried theme nothing else puts it back.

Each ends in a `url(#…)` with no `<pattern>`, which SVG paints black. So the gate
IS the answer now: scan, compare to `data-latt-tex-sets` on the standing element,
re-inject on a difference or an absence. Measured in Chromium against a 1.7 MB
inlined engine sheet, that is ~1.2 ms for the scan and 0.03 ms to gather the text
— under 1% of the 150 ms debounce the pass already waits out. A proxy that costs
a black fill is not worth the milliseconds it saves. The three scenarios are
pinned in `test/integration/parity/runtime-frontmatter-refire.test.js`.

## Two builders — and why there must be two

`texturePatternDefs()` uses two helpers. This is the irreducible complexity of the
layer; keep both:

- **`patternSet` (static, literal hex).** Emits each tile's fill + ink as **literal
  presentation attributes** — no `var()`, no `<style>`. The defs are injected once at
  **page level**, outside any `<section>`, where a `var(--token)` proved fragile on real
  iOS Safari (the `:root`→`:where(section)` relocation put tokens out of reach, and
  `var()` in a presentation attribute isn't honored on older WebKit) — both rendered the
  pie **all black**. Literal hex has zero resolution dependency. Used by the a11y sets.
- **`schemeAwarePatternSet` (light-dark flip).** For themes whose dark mode keeps
  categorical chips dark (onyx, concrete), the fill + ink must flip with the deck
  `color-scheme`. That needs a `light-dark()` CSS rule in a `<style>` block (presentation
  attributes can't hold CSS functions) — **plus** a literal light-mode fallback attribute
  so a renderer without `light-dark()` degrades to a light chip, never SVG's default
  black. Chromium flip verified; iOS `light-dark()` UNVERIFIED but degrades safely.
  **Scope:** polarity tracks the *deck-wide* scheme, because the defs are page-level and
  one `<pattern>` paints identically wherever it is referenced. This set is what
  `:root` selects, and it stays the right answer for `color-mode: system` /
  `inherited`, whose polarity is only known at view time.
- **Pinned sets (`…-tex-light-N` / `…-tex-dark-N`).** One polarity baked per pattern,
  literal hex, no `light-dark()`. A slide that *pins* a scheme (`_class: dark` /
  `light`, `color-mode: light`) sets `color-scheme` on the SECTION, which the
  page-level patterns above cannot see — so the theme points `--cat-N-texture` at
  these under the pinning selector instead.
  **They apply where ink is baked PER SLIDE, which is now everywhere** — both render
  paths resolve the palette from the slide they are rendering (#1332 steps 3–4), so a
  pin is unconditionally correct. The pins carry two requirements and no more: a
  literal leading `section` compound (or packTheme rewrites the rule into a slide
  DESCENDANT and it silently never matches), and `:not(.print)`, because `--print`
  bakes one B&W band deck-wide and a per-slide chip under it puts dark print ink on a
  dark chip (~2.7:1). Until the pins existed, a per-slide dark left light chips under
  light ink and every diagram node label vanished on all six textured palettes
  (#1323). Gated by `test/unit/palette/texture-polarity.test.js`, which follows the
  token to the pattern and checks the ink against the fill *baked into it*.

  **`data-lattice-slide-bake` is retired.** Until #1332 the two paths disagreed about
  granularity — the emulator baked per slide, `lib/runtime/index.js` baked once from
  the FIRST section — so the pins were right on one path and wrong on the other, and
  the emulator stamped that attribute to say which was which. Pinned live on a runtime
  path, a `_class: dark` slide got a dark chip under slide-1's ink: 17.14:1 → 1.55:1 in
  a real `marp-cli` render. Step 3 ended the disagreement and step 4 deleted the
  marker — an attribute announcing a granularity both paths share announces nothing.
  The gate now asserts its ABSENCE in both directions, because a half-removal is the
  dangerous state: a theme rule still requiring the attribute is a permanently dead
  selector, which is #1323 again.
  **a11y is the exception:** those palettes are mode-invariant (fixed hex, chips
  deliberately light in every scheme), so they re-assert their one literal set under
  the same selectors and pin `--cat-on-fill` instead of gaining a dark set.

## How a theme adopts texture

Adoption is the universal token channel from
`engineering/decisions/2026-07-16-universal-texture-channel.md` — **declare 12 tokens,
nothing else**:

```css
:root {
  --cat-1-texture: url(#latt-onyx-tex-1);
  /* … through --cat-12-texture */
}
```

The canonical rules (`lib/integrations/mermaid/mermaid.css`, the pie block, the chart
family) already paint `var(--cat-N-texture, var(--cat-N-fill))`, so a declared token
textures every categorical diagram at once and an undeclared one falls back to flat
color — byte-identical for non-texture themes. The print band declares the same tokens
under `section.print`. No per-selector wiring; a theme that hand-rolls texture geometry
instead of declaring tokens is a review smell.

## Deriving a set for a theme that has none (#1562)

The four sets above are hand-authored, and that is why `--cat-N-texture` is not in
`REQUIRED_TOKENS`: a generated theme could only point at colors baked for a
*different* palette. **`lib/core/texture-ramp.js` closes the supply half** —
`textureSetFrom({ lightFills, darkFills })` derives the fills and both overlay inks
from a theme's own `--cat-N-fill` ramp, with the ink deltas measured off the four
shipped sets rather than invented, and the ink carrying the theme's own hue at low
chroma. All 32 shipped themes derive a set inside the band the hand-tuned sets
occupy, and the derivation reproduces onyx's and concrete's hand-picked inks.

**It emits no patterns.** Wiring it into `texturePatternDefs()` is a separate step
that must re-bless the golden, measure whether export bytes actually move, emit the
polarity pins, and decide whether to emit only the referenced theme's set (32 sets
is roughly eight times today's defs markup on every page). Only then can
`--cat-N-texture` join `REQUIRED_TOKENS`. See
`engineering/decisions/2026-08-11-per-theme-texture-ramp.md`.

## Adding a tile or a family

- **A tile** → append `{ mode: 'stroke' | 'fill', svg: '<…8×8…>' }` to the family array.
  Keep *adjacent* slots maximally different (orientation / dot-size / block form) so
  neighboring categories never look alike. Shapes carry **no** fill/stroke of their own
  — the builder applies the ink. Adding a slot past the ramp length also needs a ramp
  entry (slot count = ramp fill length).
- **A family** → add a new geometry array + wire a set in `texturePatternDefs()` with its
  ramp and the right builder (`static` for a single-scheme CVD theme, `schemeAware` for a
  scheme-flipping one). Then a theme adopts it by pointing its 12 `--cat-N-texture` tokens
  at the new prefix.

## Invariants (don't break these)

- **Output is byte-locked.** `test/unit/core/accessibility-textures.test.js` compares
  the FULL emission — `texturePatternDefs()` with no argument — against
  `texture-defs.golden.svg`. Any output change fails until the golden is re-blessed
  *with justification*. A narrowed emission is a strict subset of the golden plus its
  own `data-latt-tex-sets` value, so the lock still covers every byte of pattern
  geometry. Because the output is stable, exported
  PDF/PPTX bytes don't change from a supply-side refactor (no export sign-off needed), and
  `dist/lattice.css` (which carries only the `--cat-N-texture` token wiring, not the defs)
  is unaffected. The module source *is* bundled into `dist/lattice-emulator.js` /
  `dist/lattice-runtime.js`, so a rename of its identifiers does change those bundles —
  rebuild and commit them (`build:check` enforces it).
- **The a11y literal sets stay literal** — no `var()`, no `<style>` (the iOS all-black-pie
  guard). Only the scheme-aware sets carry a `<style>`.
- **A set is APPENDED to `TEXTURE_SETS`, never inserted.** That array is both the
  emission order the golden pins and the closed list `texturePrefixesReferencedIn()`
  matches against. Adding a set means adding a row there AND wiring the theme that
  references it — a theme pointing `--cat-N-texture` at an id no row builds is the
  black-fill failure, and `test/unit/core/accessibility-textures.test.js` asserts every
  shipped palette emits a superset of the ids it references.

## What this is NOT

- **Not a magnitude channel.** Every tile here is a *nominal* pattern — different *kinds*
  for different categories. Encoding *amount* (sparse→dense hatching) is a separate,
  unbuilt mechanism; don't overload these tiles with ordinal meaning.
- **Not the chart-family color treatment.** `tint-*` / `mark-*` color treatments live in
  `engineering/treatments.md`; the `--chart-cat` native-SVG wedge/funnel texturing keeps
  its own wiring (a future unification candidate).

See also: `engineering/decisions/2026-07-16-universal-texture-channel.md` (adoption
channel), `2026-07-17-texture-vocabulary-consolidation.md` (why this page exists),
`2026-06-16-cvd-redundant-encoding.md` (origin), `engineering/treatments.md` (color
treatments).
