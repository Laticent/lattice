---
status: shipped
summary: >
  Categorical texture shipped as four hand-wired pattern sets described with two
  words ("texture" in code, "motif" in comments) and no living contract — the
  mechanism is deterministic but ILLEGIBLE to a maintainer/LLM. A full registry
  refactor (option A) was proposed; an adversarial trio (red team + Munger inversion
  + independent checker) found it OVER-BUILT — the registry doesn't reduce the
  irreducible complexity (both builders survive), it hides onyx's divergent ink, and
  its gate re-litigated #1028's deliberate "discipline, not gated" call. Shipped the
  sharpened option B instead: scoped nomenclature fix ("texture", retire "motif" on
  texture surfaces only), a canonical living doc (engineering/textures.md), a GOLDEN
  byte-lock test, and two on-path broken-window fixes. No registry, no new gate;
  texturePatternDefs() output byte-identical.
companion:
  - ./2026-07-16-universal-texture-channel.md
  - ./2026-07-16-onyx-categorical-texture.md
  - ./2026-06-16-cvd-redundant-encoding.md
---

# Texture: one word + one living doc, byte-locked — registry and gate rejected

**Date:** 2026-07-17 · **Status:** shipped · **Owner:** Sharmarke

## Problem — the mechanism is deterministic but illegible

`#1028` made texture a universal *token* channel (`--cat-N-texture`). That fixed the
*wiring*. It did not touch the *supply side* — the `<pattern>` defs in
`lib/core/accessibility-textures.js` — where the confusion actually lives: **four**
emitted sets from **two** geometry families via **two** builders, with scattered ramp
constants, described with **two words** ("texture" in code, "motif" in comments), and
**no single page** a maintainer or LLM can read. Nothing is non-deterministic (fixed
arrays, fixed slot→tile map, `:nth-of-type` by DOM order) — the defect is comprehension.

## What we considered — option A (full registry), and why we rejected it

The first proposal collapsed the two geometry arrays + ramp constants + two builders
into one declarative registry (`TEXTURE_FAMILIES` map + `TEXTURE_SETS` rows with a
`mode` dispatcher), plus a `checkTextureRegistry` gate that banned the word "motif" and
off-registry geometry. Because this is shared-kernel, novel work, it went through the
full **adversarial trio** before any code (HARD RULE #25, top rung).

The trio converged against building A:

- **The registry doesn't buy what it claims.** Both builders (`patternSet` literal-hex
  for iOS safety, `schemeAwarePatternSet` `light-dark()` flip) must **survive** — that
  is the irreducible complexity of the layer. A registry only swaps a 5-line
  `texturePatternDefs()` body for a table + dispatcher (net *more* LOC) and, worse,
  **hides onyx's divergent light ink** (`CAT_INK_ONYX_LIGHT`) behind a `ramp` constant —
  the explicit call site currently *shows* it. Legibility regresses at the subtlest point.
  It is premature abstraction for a 4-row list.
- **The gate was the weakest part — all three lenses flagged it.** A budget-0 "motif"
  ban false-fails on legitimate *finish*-subsystem copy (`SlideContext.tsx`,
  `finish-catalog.ts`) on day one; the "off-registry geometry" check scanned CSS, which
  *cannot* emit `<pattern>` defs, and collided with finish data-URIs; it flagged the
  regression test itself; and it **re-litigated #1028's deliberate "discipline, not
  gated" decision** from the prior week, with no evidence the discipline had failed.
- **The doc, not the registry, is what fixes the stated worry.** The user's concern was
  maintainers / illegible model / LLM authors. What answers that is the *naming* and a
  *living contract* explaining why two builders, why onyx ≠ a11y, why 8-vs-12 slots — not
  a data table that relocates constants.

The trio also caught real errors in the option-A doc: its "dist unchanged" non-goal was
false (the module *source* is bundled into `dist/lattice-emulator.js` /
`dist/lattice-runtime.js`, so identifier renames change those bytes), its ramp table
omitted onyx's ink, and it relied on structural tests that never asserted full-string
equality — so byte-identity was not actually locked.

## Decision — option B (sharpened)

1. **Scoped nomenclature.** "texture" is the one word: texture (channel) → family
   (generic/concrete) → tile (one 8×8 pattern) → set (family + ramp). "motif" retired on
   texture surfaces only (two comments in `accessibility-textures.js`); the finish
   subsystem's unrelated "motif" copy is left alone. **No word-ban gate.**
2. **A canonical living doc — `engineering/textures.md`.** The model, the two families /
   four sets, why two builders, why onyx's ink differs, why the chart set is 8, how a
   theme adopts (`--cat-N-texture` tokens), and how to add a tile/family. It describes the
   model and **points at the arrays as source of truth** — it never enumerates tiles (that
   would recreate the two-sources split it cures). Linked from the CLAUDE.md index and
   cross-linked from `treatments.md`.
3. **A golden byte-lock test.** `test/unit/core/accessibility-textures.test.js` now
   asserts `texturePatternDefs()` equals a frozen `texture-defs.golden.svg` — the true
   byte-identity lock the structural tests never provided. Re-bless only with a justified,
   intentional change.
4. **Two on-path broken-window fixes (#18).** A stale comment that claimed onyx used
   `CAT_INK` (it uses `CAT_INK_ONYX_LIGHT`), and the option-A doc's own wrong ramp model.

## Rejected / deferred (recorded, not silent)

- **The `TEXTURE_FAMILIES`/`TEXTURE_SETS` registry** — rejected as premature abstraction.
  Revisit only if a *third* family or a real second scheme-mode arrives.
- **`checkTextureRegistry`** — rejected. `#1028`'s "discipline, not gated" stands; the
  golden test + doc + review cover it. A gate can come later if drift actually recurs.
- **The density (magnitude) texture channel** and **chart-family unification** remain
  separate future mechanisms, unchanged.

## Verification

- **Byte-identical:** the golden test passes (`texturePatternDefs()` = 15 546 bytes,
  unchanged); comment-only edits do not alter output. `dist/lattice.css` is unchanged (it
  carries token wiring, not the defs). The `dist/lattice-emulator.js` /
  `dist/lattice-runtime.js` bundles *do* regenerate — they inline the module's **source
  comments + a sourcemap**, so the comment edits (and shifted line numbers) change those
  bytes even though the emitted defs don't. Rebuilt and committed; `build:check` enforces
  the freshness. (This corrects the option-A doc's wrong "dist unchanged" claim — the
  trio's finding — for comments as well as identifiers.)
- **Maker–checker:** this change is docs + comments + a test (no logic change), below the
  blast-radius bar that needs an independent checker — the trio already reviewed the
  design it descends from.
