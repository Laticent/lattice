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
  **Limitation:** polarity tracks the *deck-wide* scheme (the defs are page-level), so a
  per-slide `<!-- _class: dark -->` won't flip the texture — use a deck-wide scheme.

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
  `texturePatternDefs()` against `texture-defs.golden.svg`. Any output change fails until
  the golden is re-blessed *with justification*. Because the output is stable, exported
  PDF/PPTX bytes don't change from a supply-side refactor (no export sign-off needed), and
  `dist/lattice.css` (which carries only the `--cat-N-texture` token wiring, not the defs)
  is unaffected. The module source *is* bundled into `dist/lattice-emulator.js` /
  `dist/lattice-runtime.js`, so a rename of its identifiers does change those bundles —
  rebuild and commit them (`build:check` enforces it).
- **The a11y literal sets stay literal** — no `var()`, no `<style>` (the iOS all-black-pie
  guard). Only the scheme-aware sets carry a `<style>`.

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
