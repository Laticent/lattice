---
marp: true
theme: indaco
paginate: true
class: print
header: "Lattice · Print mode"
acronyms:
  CDN: content delivery network
---

<!-- _class: title silent -->

`B&W-safe · ink on paper`

# The boardroom deck that survives the printer.

Print mode renders the whole deck ink-on-white — grayscale plus textures, so nothing depends on hue. Set `class: print`, or export with `--print`.

<!-- Speaker: this same deck renders in full colour without the print class; the print band is a render-time choice, not a rewrite. -->

---

`Why a print band`

## Hue is the one channel a gray printer throws away.

- Five tints that differ only in color collapse to the **same gray** on a mono printer.
- So the print band carries meaning on the channels that survive:
  - **stepped lightness**, a **defined border**, and a **hatch or dot texture**.

---

<!-- _class: stats -->

`Impact · pilot`

# The figures read the same in gray.

- 73%
  - faster close
- 4.2×
  - signal recall
- $1.2M
  - prevented losses
- −18d
  - avg cycle time

---

<!-- _class: cards-grid -->

`What survives grayscale`

# Distinction without hue.

- Borders
  - every fill gets a defined ink rule, so adjacent cards never merge
- Lightness
  - a stepped gray ramp separates categories up to about five
- Texture
  - hatch / dot / cross pattern fills carry chart & diagram series past five
- Shape & glyph
  - status keeps its ✓ · ! · ✗ mark; sentiment keeps its face

---

<!-- _class: piechart -->

`Where the budget goes`

## Chart series carry a texture, not a color.

The wedges differ by pattern, so the split survives a gray printer.

- Cloud `46%`
  - AWS reserved instances on a 3-year commit.
- On-prem `30%`
  - Two datacenters, depreciating through FY27.
- Edge / CDN `24%`
  - Cloudflare and Fastly, split for redundancy.

---

<!-- _class: closing -->

`Print ready`

# One deck. Screen in color, paper in ink.

Author once; choose the surface at export. Use `class: print` for the paper handout, the default palette for the projector.
