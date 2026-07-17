---
status: shipped
summary: >
  Categorical TEXTURE was wired per-theme in FOUR places (a11y-base, onyx,
  concrete, the print band), each re-deriving the same selector→slot mapping and
  pointing at a different pattern set — duplication, drift risk, and a specificity
  bug (a11y/onyx mindmaps had to out-specify mermaid.css by hand; a11y's lost).
  Made texture a UNIVERSAL token channel like categorical color: `--cat-N-texture`
  (optional, default unset), consumed by the canonical mermaid.css / chart rules as
  `var(--cat-N-texture, var(--cat-N-fill))`. Themes/print now ADOPT texture by
  declaring 12 tokens; all per-selector wiring deleted. Non-texture output is
  byte-identical (fallback); the a11y mindmap bug is fixed structurally.
companion:
  - ./2026-07-16-onyx-categorical-texture.md
  - ./2026-07-16-a11y-mindmap-texture.md
  - ./2026-06-16-cvd-redundant-encoding.md
---

# Texture is a universal token channel, not per-theme wiring

**Date:** 2026-07-16 · **Status:** shipped · **Owner:** Sharmarke

## Problem

Categorical **texture** (a non-color channel — hatch / dots / motifs per slot, so a
theme that can't separate categories by hue still can) had accreted as **per-theme
wiring** in four places, each a full copy of the selector→slot mapping pointing at a
different pattern set:

| Site | Set |
|---|---|
| `themes/a11y-base.css` (CVD) | literal `latt-a11y-tex-*` |
| `themes/onyx.css` (monochrome) | scheme-aware `latt-onyx-tex-*` |
| `themes/concrete.css` (near-mono) | scheme-aware `latt-concrete-tex-*` |
| `base.print-textures.css` (B&W print) | literal `latt-a11y-tex-*` |

~150 lines of duplicated `.section-N` / `.pieCircle` rules that must stay in sync,
plus a specificity trap: Mermaid mindmap fill lands on `.mindmap-node[class*=
"section-N"] path` which `mermaid.css` paints `!important` at (0,2,2), so the wiring
had to out-specify it with `.node.mindmap-node …` (0,3,2) — onyx/concrete did;
**a11y didn't, so a11y mindmap texturing was silently dead**
(`2026-07-16-a11y-mindmap-texture.md`).

Meanwhile `mermaid.css` **already** paints every categorical fill from
`var(--cat-N-fill)`, and `lattice.css` **already** owns the categorical token
contract. The texture wiring was re-deriving what the canonical rules already do.

## Decision — one token channel, adopted by the themes that need it

Treat texture exactly like categorical color: a **token the theme declares**, a
**canonical rule that consumes it**.

1. **Contract (`base.tokens.css` → `lattice.css`):** `--cat-N-texture`, 12 slots,
   OPTIONAL, default unset.
2. **Canonical consumers (`mermaid.css`):** every `fill: var(--cat-N-fill)` becomes
   `fill: var(--cat-N-texture, var(--cat-N-fill))` (84 rules across mindmap, kanban,
   timeline, treemap, C4, actors, gitgraph, …), plus a new universal pie rule
   `.pieCircle:nth-of-type(12n+k) { fill: var(--cat-k-texture, var(--cat-k-fill)) }`.
   Unset token → fallback to color → **byte-identical** for every non-texture theme.
3. **Adoption = 12 token declarations.** a11y-base / onyx / concrete each drop their
   wiring and set `--cat-N-texture: url(#latt-<set>-N)`. The print band sets them
   under `section.print`. That's the whole per-theme surface now.

### What it buys

- **~150 lines of duplicated wiring → 12 tokens per adopter.**
- **The a11y mindmap bug vanishes structurally** — the canonical mermaid.css rule
  *is* the wiring, so there is no specificity battle and the `.node.mindmap-node`
  hacks are gone from every theme.
- **Texture now covers EVERY categorical diagram** (kanban, timeline, treemap, C4,
  actors, …), not just the mindmap+pie the old per-theme wiring bothered to list.
- **Print-band asymmetry gone** — print re-points the same tokens.
- Adding texture to a future theme = declare 12 tokens.

## Verification

- **Non-texture themes byte-identical:** indaco mindmap renders unchanged; the
  universal pie rule is **pixel-identical** (`compare -metric AE = 0`) to baseline.
  `dist/themes/*.min.css` for non-adopting themes are byte-unchanged (mermaid rules
  live in shared `lattice.css`, not per-theme).
- **Adopters textured via the universal path:** onyx (mindmap + pie, both modes),
  concrete, and a11y-achromatopsia (mindmap now textured — the dead-wiring bug
  fixed) all render texture with only their 12 tokens declared.
- Pattern DEFS (`accessibility-textures.js`) are **untouched**, so the iOS-safe
  literal sets stay byte-identical and the scheme-aware sets are unchanged.

## Notes / limits

- **Pie fallback is `--cat-N-fill`** (not `-mark`): empirically the mmdc pie paints
  from the fill ramp; the universal rule matches it exactly (AE=0).
- The scheme-aware sets' known limits carry over unchanged (deck-wide scheme only;
  iOS `light-dark()` unverified but degrades to light chips, not black —
  `2026-07-16-onyx-categorical-texture.md`).
- Chart-family texturing (`--chart-cat` wedges / funnel / radar) is a SEPARATE
  channel and keeps its own wiring (a11y/print) — a future unification candidate.
- Discipline, not gated: the canonical rules and the 12-token adoption pattern are
  the contract; a theme that hand-rolls texture wiring instead of declaring tokens
  is a review smell.
