---
status: shipped
summary: >
  a11y (CVD) categorical TEXTURES were silently dead on MINDMAPS: the a11y-base
  wiring targets `.section-N` at (0,1,2), which loses to mermaid.css's
  `.mindmap-node[class*="section-N"]` `!important` at (0,2,2), so mindmap nodes
  painted the flat grey `--cat` ramp instead of the per-slot texture — the exact
  distinctness the CVD feature exists to provide. Fixed by adding
  `.node.mindmap-node[class*="section-N"]` rules → (0,3,2), which win
  order-independent (the same specificity boost onyx/concrete use). Surfaced while
  adding onyx/concrete texture (2026-07-16-onyx-categorical-texture.md).
companion:
  - ./2026-07-16-onyx-categorical-texture.md
  - ./2026-06-16-cvd-redundant-encoding.md
---

# a11y mindmap texturing was dead — a specificity loss to mermaid.css

**Date:** 2026-07-16 · **Status:** shipped · **Owner:** Sharmarke

## Problem

The CVD (colour-vision-deficiency) a11y themes give the categorical cycle a
non-colour channel — a distinct texture per slot — so colour-blind viewers can tell
categories apart (`2026-06-16-cvd-redundant-encoding.md`). The wiring in
`themes/a11y-base.css` is `section .section-N rect/path/circle { fill:
url(#latt-a11y-tex-N) !important }`.

On **mindmaps** that never took effect. Mermaid renders a mindmap node as
`<path class="node-bkg …">` inside `g.node.mindmap-node.section-N`, and
`mermaid.css` already paints it `!important` at specificity **(0,2,2)**
(`.mindmap-node[class*="section-N"] path`). The a11y rule is only **(0,1,2)**
(`.section-N path`), so — both `!important`, mermaid.css loses the tie only to
*higher* specificity — mermaid.css won and the node painted the flat grey `--cat`
ramp. Result: an a11y mindmap showed 12 near-identical grey chips with NO texture,
i.e. the accessibility feature was a no-op on the one diagram most likely to carry
many categories. (Pie/charts were unaffected — their selectors already out-specify
or have no competing `!important` host rule.)

Found while wiring onyx/concrete texture, which hit the same wall and solved it by
adding the `.node` class the group also carries → **(0,3,2)**.

## Fix

Add `.node.mindmap-node[class*="section-N"] rect/circle/polygon/path` rules (plus
`section-root`) pointing at the same literal `latt-a11y-tex-N` set, at (0,3,2) —
beating mermaid.css (0,2,2), order-independent. The existing generic
`.cluster.section-N` / `.section-N` rules are **kept** (they still serve non-mindmap
diagram types where they already win); the new rules only add mindmap coverage.
`[class*="section-1"]` vs `section-10`/`section-11` resolves by source order exactly
as it does in mermaid.css and the onyx wiring.

## Verification

Rendered an `a11y-achromatopsia` mindmap to PDF: the 12 categories now paint their
distinct textures (diagonal / vertical / horizontal / dots / …) — previously flat
grey. All four a11y CVD themes share `a11y-base.css`, so all are fixed. No change to
the texture DEFS (`accessibility-textures.js` untouched), so the iOS-safe literal
sets are byte-identical; no other diagram type regresses (additive rules only).

*(No automated gate covers CSS wiring specificity — discipline, like the existing
print-texture parity note. The render is the artifact; the shared onyx/concrete
precedent makes a silent divergence easy to catch in review.)*
