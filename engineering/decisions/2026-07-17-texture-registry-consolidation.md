---
status: proposed
summary: >
  Categorical texture shipped as four hand-wired pattern sets (a11y, a11y-chart,
  onyx, concrete) built from two geometry vocabularies and scattered ramp
  constants, described with two words ("texture" in code, "motif" in comments) and
  no single contract a maintainer or LLM can read. The mechanism is deterministic
  but ILLEGIBLE. Consolidate to ONE declarative registry (families × ramps × mode),
  ONE word ("texture"), ONE documented adoption contract, and ONE gate — with
  `texturePatternDefs()` output byte-for-byte unchanged.
companion:
  - ./2026-07-16-universal-texture-channel.md
  - ./2026-07-16-onyx-categorical-texture.md
  - ./2026-06-16-cvd-redundant-encoding.md
---

# Texture is one registry, one word, one contract — not four hand-wired sets

**Date:** 2026-07-17 · **Status:** proposed · **Owner:** Sharmarke

## Problem — the mechanism is deterministic but illegible

`#1028` made texture a universal *token* channel (`--cat-N-texture`): themes adopt
it by declaring 12 tokens, and the canonical rules consume `var(--cat-N-texture,
var(--cat-N-fill))`. That fixed the *wiring*. It did **not** touch the *supply
side* — the `<pattern>` defs in `lib/core/accessibility-textures.js` — which is
where the confusion actually lives.

Today that file emits **four** pattern sets from **two** geometry vocabularies via
**two** builder functions, with the ramps as loose module constants:

| Emitted set | Geometry | Ramp | Builder | Scheme |
|---|---|---|---|---|
| `latt-a11y-tex-1..12` | `GEOMETRIES` (generic) | `CAT_FILLS` / `CAT_INK` | `patternSet` | static literal |
| `latt-a11y-chart-tex-1..8` | `GEOMETRIES` (generic) | `CHART_FILLS` / `CHART_INK` | `patternSet` | static literal |
| `latt-onyx-tex-1..12` | `GEOMETRIES` (generic) | `CAT_FILLS`↔`CAT_FILLS_DARK` | `schemeAwarePatternSet` | `light-dark()` flip |
| `latt-concrete-tex-1..12` | `CONCRETE_GEOMETRIES` (bespoke) | `CONCRETE_FILLS_*` | `schemeAwarePatternSet` | `light-dark()` flip |

Three problems, none of them "the output is wrong" (it's fully deterministic —
fixed arrays, fixed slot→tile map, `:nth-of-type` by DOM order):

1. **Two words for one thing.** Code says `texture`/`tex`/`GEOMETRIES`; comments
   say "motif." There is no mechanical difference — a "motif" is just the bespoke
   *concrete* geometry family. The split is pure vocabulary drift.
2. **No single contract.** The vocabulary, the slot mapping, "how a theme adopts
   texture," and "when you'd add a tile" are spread across a JS file + CSS
   `nth-child` + four theme files. No one page holds the model — so a maintainer
   or an LLM author cannot reason about it without reverse-engineering arrays.
3. **The concrete fork is ad-hoc.** `CONCRETE_GEOMETRIES` is a *deliberate* brand
   feature (bespoke cast-concrete marks), but it is expressed as a one-off extra
   arg to a builder, not as a sanctioned "family." A future theme wanting its own
   tiles has no pattern to copy and nothing keeping it honest.

## Decision — registry, one word, one contract, one gate

Treat the *supply side* the way `#1028` treated the *wiring*: make the structure
declarative and the contract readable + enforced. **No pixels change.**

### 1. One declarative registry

Collapse the four hand-wired calls + scattered constants into a single data
structure. Two pieces:

```js
// The geometry vocabularies — a NAMED map, not two loose arrays.
const TEXTURE_FAMILIES = {
  generic:  [ /* 12 tiles: {mode, svg} */ ],   // was GEOMETRIES
  concrete: [ /* 12 tiles: {mode, svg} */ ],   // was CONCRETE_GEOMETRIES
};

// The emitted sets — one row per set, every axis explicit.
const TEXTURE_SETS = [
  { prefix: 'latt-a11y-tex',       family: 'generic',  ramp: CAT_RAMP,      mode: 'static' },
  { prefix: 'latt-a11y-chart-tex', family: 'generic',  ramp: CHART_RAMP,    mode: 'static' },
  { prefix: 'latt-onyx-tex',       family: 'generic',  ramp: ONYX_RAMP,     mode: 'scheme' },
  { prefix: 'latt-concrete-tex',   family: 'concrete', ramp: CONCRETE_RAMP, mode: 'scheme' },
];
```

`texturePatternDefs()` becomes `TEXTURE_SETS.map(emit).join('')`. `emit` dispatches
on `mode` (`static` → the literal-hex builder; `scheme` → the `light-dark()`
builder) — the two builders survive as internal helpers, but nothing outside the
registry names a geometry array or a ramp. Adding a set = one row; adding a family
= one map entry. The whole supply side is legible in one screen.

### 2. One word — "texture"

`texture` is the sole term. A named geometry collection is a **family**
(`generic`, `concrete`); one 8×8 pattern is a **tile**; a family instantiated with
a ramp for a theme is a **set** (`latt-onyx-tex`). "Motif" is retired from code,
comments, and docs (dated decision records are exempt — history is immutable).

### 3. One documented contract — `engineering/textures.md`

A new canonical doc (linked from the CLAUDE.md index) that states, in one place:
the two families and every tile; the slot→tile mapping; **how a theme adopts
texture** (declare `--cat-N-texture: url(#latt-<set>-N)` — the `#1028` path); and
**how to add a tile or a family** (append to the registry; keep adjacent tiles
maximally distinct; mirror the theme's ramp). This is the page a maintainer or LLM
reads instead of the arrays.

### 4. One gate — `checkTextureRegistry`

In `tools/check-ownership.js` (via `build:check`), fail on:
- **Orphan/stale emission** — any `<pattern id="latt-…-tex-N">` emitted outside the
  registry module, or a registry `prefix` that no consumer references.
- **Nomenclature ratchet** — the word "motif" reappearing in code/docs (budget 0
  going forward; dated `engineering/decisions/` exempt).
- **Off-registry geometry** — a theme CSS file hand-rolling `<pattern>`/texture
  geometry instead of declaring `--cat-N-texture` tokens.

So the contract can't rot: a future ad-hoc fork trips the gate.

## Non-goals (explicitly out of scope)

- **No new tiles, families, ramps, or pixels.** This is a structure + naming +
  docs + gate change. `texturePatternDefs()` output is asserted **byte-identical**.
- **Not the density channel.** Ordinal/magnitude texture (sparse→dense) is a
  separate future mechanism (`#1028` notes); this doc is categorical-by-type only.
- **Not chart-family unification.** `--chart-cat` wedge/funnel wiring stays as-is.

## Verification plan

- **Byte-identical:** snapshot `texturePatternDefs()` before and after; assert
  string-equal (a unit test locks it going forward). `dist/**` unchanged.
- **Gate self-test:** the new gate fails on a seeded off-registry `<pattern>` and
  on a seeded "motif" reference; passes clean on the consolidated tree.
- **Maker–checker:** the registry refactor touches the shared kernel
  (`lib/core`, every render calls `texturePatternDefs()`), so an independent
  checker bug-hunts the diff before commit (HARD RULE #25 middle rung).

## What it buys

- **Legible model:** "two families, four sets, themes adopt via one token" is
  readable in one registry + one doc — the LLM/maintainer risk this addresses.
- **Concrete stays a feature, not a smell:** the bespoke family becomes a named,
  documented, gated first-class citizen instead of an extra function arg.
- **Can't rot:** the gate keeps nomenclature and supply-side single-sourced.
