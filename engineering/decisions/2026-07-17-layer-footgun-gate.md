---
status: shipped
summary: The reserved-but-inert `@layer` declaration reads as active and invites the
  rule-3 trap (wrap one file → it silently loses). Added HARD RULE #26 +
  `checkCascadeLayers` (budget-0 block-scan over lib + built dist, order-pin,
  inert-note sentinel) so a partial/isolated layer can never ship, plus a bundle
  comment and a `cascade.md` refresh (the old 345/14/331 !important figures were
  stale). Adversarial trio (red team + Munger inversion + independent checker) run on
  the design; findings folded.
---

# The cascade-layer footgun gate (HARD RULE #26)

## Problem

`tools/build-css.js` emits a 7-name `@layer` declaration that **reads as
active** but governs nothing — no source file wraps a rule in a layer, so
the cascade is decided by bundle source order + specificity + `!important`.
That inert-but-active-looking declaration is a **footgun**, especially for
an agent reading `dist/lattice.css`:

- It looks like the cascade is layer-governed, so a contributor reasons
  "later layer wins / components beats scaffold" — backwards for a bundle
  where every rule is unlayered.
- The dangerous move it invites: "following the convention" by wrapping a
  component file in `@layer components { … }`. Per cascade **rule 3**
  (unlayered beats layered regardless of specificity) that rule now
  silently loses to every unlayered rule — the exact Phase-3.5b breakage
  (100% of canary pages), which is documented but **ungated**.

Nothing in the bundle warned the reader, and no gate stopped the wrap.
Separately, `engineering/cascade.md` had drifted: its "345 `!important`,
14 in `base.variants.css`, 331 library-override" inventory predated Stage 1
(PR #435), which removed the base.variants competition via selector-doubling.

## Decision

Add a first-class, gated invariant — **HARD RULE #26: engine CSS admits no
partial/isolated `@layer`** — enforced by `checkCascadeLayers` in
`tools/check-ownership.js` (via `build:check`), plus a self-documenting
bundle comment and a `cascade.md` refresh.

Three parts:

1. **Bundle (`build-css.js`).** Emit a stable `LATTICE-LAYERS-INERT`
   sentinel comment (`LAYER_INERT_NOTE`) directly above `LAYER_DECLARATION`,
   so a `dist/lattice.css` reader learns at the point of confusion that the
   layers are inert. Export `LAYER_DECLARATION` for the gate.

2. **Gate (`checkCascadeLayers`).** Same budget-0 + `SANCTIONED_*` +
   stale-detection shape as HARD RULE #20/#3:
   - **Block-scan** over `lib/` source AND the built `dist/lattice.css`
     (backstop for vendored KaTeX + JS-generated blocks the lib walk never
     sees), matching **named `@layer x {`, anonymous `@layer {`, and
     `@import … layer()`** — the three ways a layered rule reaches a
     browser. Comments stripped, case-insensitive. Budget 0;
     `SANCTIONED_LAYER_BLOCKS` empty by design.
   - **Order-pin**: the emitted `LAYER_DECLARATION` must parse to
     `CANONICAL_LAYER_ORDER` (single source of the string is `build-css.js`;
     the gate's list is the pinned assertion target).
   - **Sentinel presence**: `build-css.js` source must emit
     `LATTICE-LAYERS-INERT` (checked in source so minification can't strip
     the guarantee).

3. **Docs.** `cascade.md` rewritten: correct `!important` inventory,
   fold in the R-PATH veto, add the danger-first **Lattice Layer Contract**
   (best practices + our stance on each).

## Why a HARD RULE and target-zero (not "just delete the declaration")

The Munger-inversion lens argued "layer nothing" is a temporary "not yet"
that a HARD RULE would ossify, and that the cheapest fix is to *delete* the
reserved declaration. Reading `2026-06-18-layer-activation-scope.md`
resolved this: full activation is **vetoed** (R-PATH — marp-core's unlayered
scaffold can't be wrapped), not deferred, and the layer-addressable cleanup
already shipped (Stage 1). So:

- "No partial/isolated layering" is a **permanent** truth — a half-layered
  bundle is a rule-3 regression *even after* a hypothetical full activation.
  #26 pins that permanent property, not a way-station, so it doesn't ossify
  the (blocked) activation path: activation adds sanctioned entries in one
  coordinated pass.
- The declaration is kept (not deleted) because `2026-06-18` treats it as a
  deliberate reservation for the un-block condition; deleting it would
  contradict a live decision. The footgun it created is neutralized by the
  sentinel comment + the gate instead.

## Adversarial trio (HARD RULE #25)

Run on the design before implementation:

- **Red team** → GO-WITH-FIXES: a named-only matcher misses anonymous
  `@layer {` and `@import layer()`; the lib-only scan misses vendored /
  generated blocks; a dist-glob comment check spuriously fails on the
  minified bundle. **Folded:** match all three forms, scan built dist,
  strip comments + case-insensitive, assert the sentinel in source.
- **Munger inversion** → CUT: don't ossify a "not yet"; drop the fragile
  order-pin/comment-pin; consider deleting the declaration. **Folded:**
  reframed #26 as the permanent "no half-layering" invariant; kept the
  order-pin as a single-source parse (no duplicate constant) and the
  comment guard as a source-checked stable sentinel; kept the declaration
  per R-PATH.
- **Independent checker** → CHANGES REQUIRED: `cascade.md`'s `!important`
  figures are stale; register in `run()` not `main()`; add a pure
  `layerBlocksIn` helper + test; `#26` is the correct next number, belongs
  in Conventions. **Folded:** all done.

## Consequences

- A partial/isolated layer — the rule-3 footgun — now fails `build:check`
  before it can break a render.
- Activating layers becomes an explicit, reviewed change (edit the gate's
  allowlist + order), never an accident.
- `cascade.md` is the single accurate statement of the layer stance again.

## Related

- `engineering/cascade.md` — the Lattice Layer Contract (canonical)
- `engineering/decisions/2026-06-18-layer-activation-scope.md` — Stage 1
  shipped, Stage 2 vetoed (R-PATH)
- `engineering/decisions/2026-05-18-important-audit-phase-35-prep.md` — the
  original `!important` audit
