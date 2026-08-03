---
marp: true
theme: indaco
paginate: true
header: "Lattice · The default slide layout"
meta: "Default layout · #1292"
---

<!-- _class: title silent -->

`The catch-all is a layout`

# The default slide layout

A slide that names no component used to render as raw markdown on a Lattice canvas. It now resolves to `content` — the catch-all prose layout — so writing nothing and writing `_class: content` are the same thing.

---

`No class at all`

## This slide declares nothing

No `_class` directive appears above this heading. It renders as `content` because that is what a slide with no component resolves to, and everything below is the layout doing its job rather than the browser's defaults.

| Control | Owner | Status |
| --- | --- | --- |
| Access review | Security | Complete |
| Key rotation | Platform | Not started |

> A Key Insight reads as a peer of the body prose — never louder, and never smaller.

*A trailing annotation, promoted to a below-note because it follows a table.*

---

<!-- _class: content -->

`The same slide, named`

## This one says `_class: content`

Identical markdown to the slide before it, with the directive written out. The two render byte-for-byte the same — same type, same measure, same promoted note, same distribution down the slide.

| Control | Owner | Status |
| --- | --- | --- |
| Access review | Security | Complete |
| Key rotation | Platform | Not started |

> A Key Insight reads as a peer of the body prose — never louder, and never smaller.

*A trailing annotation, promoted to a below-note because it follows a table.*

---

`Type`

## The distillation is no longer smaller than what it distills

Body prose used to read a tier louder, which left a Key Insight a quarter smaller than the paragraph it summarized.

- A top-level point reads at the body tier
  - A nested point steps down one, so support reads as support
- The measure is a count of characters
  - Not a fraction of the slide, which means something different at every type size

> This panel and the prose above it are the same size. That is the contract.

---

`Flow`

## A trailing block reaches the bottom

The stack used to pack to the top of a full-height stage, stranding a Key Insight or a below-note mid-slide with a fifth of the stage empty beneath it. The stage distributes that slack now — but only when the stack actually ends in a trailing block, so an ordinary prose slide is left alone.

| Region | Q3 | Q4 |
| --- | --- | --- |
| North America | $4.2M | $5.1M |
| EMEA | $3.8M | $3.9M |

*Nothing stretches to achieve it. A table that grew would distribute the extra height into its rows, unevenly — so a table's vertical fill stays the author's call, via `table-fill`.*

---

<!-- _class: closing -->

`Also fixed`

## The heading you could not see

An `# H1` took its ink from the dark-panel token, which is near-white in all thirteen light palettes. `title` is the only component that puts a heading on a dark panel, and it names that ink itself — so the default served one consumer that did not need it, and made every other author-written heading invisible.
