---
status: shipped
summary: `mode: sketch` now bakes Mermaid's native `look: 'handDrawn'`, so a sketch deck's diagrams are drawn by the same hand as the slide around them. The categorical palette survives because a rough node's "fill" is a STROKE (two paths, both fill="none") — so the cycle paints with `stroke`, not `fill`. Themes that carry categories by TEXTURE (a11y-*, onyx, concrete) keep classic shapes: a pattern sampled through a 4px stroke reads as speckle, and the pattern is the redundant-encoding channel. New kernel `resolveDiagramLook`, the sibling of `resolveDiagramBand`, shared by both render paths. Non-sketch decks emit no `look` key and are byte-identical.
version: 1
supersedes: none
builds-on: 2026-08-12-sketch-label-voice.md, 2026-06-11-sketch-finish.md, 2026-06-16-cvd-redundant-encoding.md
---

# The sketch finish reaches the diagram

**Date:** 2026-08-13
**Status:** Adopted

---

## The disease

`mode: sketch` gave a deck a hand-drawn hand — hand type, wobbled boxes, drawn
rules — and then stopped dead at the edge of a Mermaid SVG. The boundary was
exactly the SVG edge: everything Lattice drew was hand, everything Mermaid drew
was crisp. A sketch deck showed a hand-drawn slide wrapped around a machine-drawn
flowchart, on all 11 diagram families.

## The decision

Mermaid 11.14 bundles rough.js and ships the matching look natively, so the
engine turns it on: a slide that resolves to sketch bakes `look: 'handDrawn'`.

`resolveDiagramLook` (`lib/core/diagram-look.js`) is the single answer, and it is
deliberately the **sibling of `resolveDiagramBand`** — same inputs, same
per-slide walk, same reason for existing. `look` swaps the whole node renderer
(`g.node > rect` becomes `g.rough-node > g.basic.label-container > path`), so it
is baked at render time and no later CSS rule can apply or undo it. Resolving it
anywhere but beside the band is how the two answers drift, which is the #1326 /
#1340 failure mode in a different channel.

The rule, in precedence order:

1. **Texture wins** — a palette carrying categories by pattern renders classic,
   always. See below; this is the load-bearing clause.
2. **A slide naming a mode token owns its look** — `_class: boardroom` opts one
   slide out of a sketch deck, `_class: sketch` opts one in on a plain deck.
   Token membership, not "did this slide name any `_class:`" — the exact
   distinction #1340 had to fix in the band.
3. **Otherwise inherit the deck** — `mode:` first, then the legacy deck-wide
   `class: sketch` (which is still what most decks in the repo say).

## A rough node's "fill" is a stroke

This is the thing that made three earlier attempts fail, and it is worth stating
plainly because every wrong turn looks like a CSS typo.

rough.js emits exactly **two paths per node, both carrying `fill="none"`**:

| path | attributes | what it is |
|---|---|---|
| 1st | `stroke="#BCD5EC"` (= `--cat-1-fill`), `stroke-width="4"` | the "fill" — a bundle of stroked hachure lines |
| 2nd | `stroke="#4A3D29"` (= `--diagram-stroke`), `stroke-width="1.3"` | the outline |

So:

- setting `fill` on the parent `<g>` does **nothing** — the paths' own
  `fill="none"` attribute means there is nothing to inherit. Computed style shows
  the pattern sitting on the container and never painting;
- setting `fill` on the paths turns each squiggle into a **filled blob**;
- setting **`stroke` on the first path** is the answer, and the full categorical
  cycle then works exactly as it does for classic nodes.

`mermaid.css` therefore carries a rough-node sibling of the `nth-of-type`
categorical cycle, painting `--cat-N-fill` onto `path:first-child` and
`--diagram-stroke` onto `path:last-child`.

## Why texture palettes keep crisp shapes

On `a11y-*`, `onyx` and `concrete`, categories are told apart by **pattern**, not
hue — the M1 redundant-encoding channel
(`2026-06-16-cvd-redundant-encoding.md`, `engineering/textures.md`) that a
color-blind or monochrome reader depends on. A pattern paint-server sampled
through a 4px variable-width stroke reads as **speckle, not a tile** — the same
reason `mermaid.css` keeps sankey ribbons on a flat color rather than the texture
channel. Measured on `a11y-deuteranopia`: four distinct tiles (diagonal,
counter-diagonal, horizontal, vertical) collapse to four grays about 5% apart.

Rule 1 is checked **before** the per-slide pin, so a deck cannot opt back in one
slide at a time. Style does not outrank an accessibility affordance. Those decks
still get the hand type everywhere else; only the diagram shapes stay
machine-drawn.

The predicate reads the **resolved palette** for `--cat-N-texture` rather than
naming themes, because a theme allowlist would rot the first time a palette
adopted the channel. The emulator resolves `@import` before asking, so the
variants (`a11y-deuteranopia`, `onyx-dark`, `concrete-dark`, …) inherit the
answer from their base. A unit test asserts the exact set of *declaring* files,
so a new one surfaces as a failure rather than silently opting a palette out.

## Byte-safety

A slide that resolves to classic emits **no `look` key at all** rather than the
explicit default — Mermaid's own default IS `classic`, so silence keeps every
existing deck's directive byte-identical. Verified: the 117-slide gallery renders
with zero `data-look="handDrawn"` and no slide-DOM change; the only diff against
the previous build is the 11 new rough-node CSS rules, which are inert because
`g.rough-node` never appears in a classic render.

Verified per theme, end to end through the real PDF pipeline (45 nodes each):

| theme | handDrawn | classic |
|---|---|---|
| carta, indaco | 45 | 0 |
| a11y-deuteranopia, onyx, concrete | 0 | 45 |

## Both paths, one answer

The export path resolves the look in the mermaid pre-pass from front matter +
`slideClass`, beside the band. The runtime resolves it from the **live section**
— `section.className` already carries the deck's `mode:` (the deck-class
propagator appends it to every section) and `--cat-1-texture` is a custom
property that slide's cascade resolves. That asymmetry is the same port the band
uses, and it is deliberate: the preview reads the DOM where the export reads
source, and both reach the same answer.

The runtime's configured-look is part of the `mermaid.initialize` skip-guard
alongside the palette. Without that, a run sharing a palette with the previous
one would keep its node renderer — which is exactly a sketch deck with one
`_class: boardroom` slide.

## Not covered

- **Diagram labels stay mono.** Separate, pre-existing gap in the diagram font
  path — `mmdc` is invoked without `--cssFile`, so it never loads the engine's
  fonts and measures labels in a fallback face; handing it a hand font clips
  labels mid-word. Recorded in `2026-08-12-sketch-label-voice.md`. Shapes do not
  depend on it.
- **Legacy-renderer families.** Mermaid honors `look` only in its unified
  renderer (flowchart, state, class, ER). Sequence, gantt, pie, journey,
  timeline, quadrant and mindmap ignore it and stay crisp on a sketch deck until
  Mermaid migrates them. Nothing here can change that, and faking it per family
  would be a fork of Mermaid's renderers.

> **CORRECTED 2026-08-18 (#1674).** `mindmap` does NOT ignore `look` — it renders through
> rough.js, and so does `requirementDiagram`. Measured across all 19 families by rendering
> each twice and counting rough nodes; six honor it, not four. The mistake was repeated
> from here into `engineering/mermaid.md` §5.3e and into #1674's own issue text, so an
> author was told their mind map could not match the finish when it already did.
> `test/integration/mermaid/diagram-look-support.test.js` now derives the list from the
> installed Mermaid so it cannot drift again.

