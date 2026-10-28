---
marp: true
theme: indaco
paginate: true
header: "Lattice · full-bleed bar"
---

<!-- These layouts claim the whole slide, so their spectrum bar is an overlay strip laid over the art, not a border
     that would shrink it. Each slide sets a different placement; the photo, panel and text keep their true edges. -->

<!-- _class: image spectrum-edge-left -->

## The image layout reads the asset’s shape.

Two-thirds of trials that reach the first generated report convert to paid; the ones that stall at workspace setup almost never do. Hand the layout any photo — it resolves the composition from the asset's shape.

![bg](sample:photo-wide.svg)

---

<!-- _class: scene spectrum-edge-bottom -->

## The rotor spins inside its fixed housing.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

The poster freezes the hero frame; on screen the rotor turns and a bead traces its ring.

```anima
{
  "source": "built",
  "duration": 3000,
  "hero": 0.5,
  "camera": { "rotate": [-0.5, -0.6, 0] },
  "elements": [
    { "id": "rig", "shape": "group", "motion": [{ "verb": "spin", "axis": "y", "period": 3000 }], "children": [
      { "id": "ring", "shape": "ellipse", "color": "var(--cat-2-mark)", "props": { "diameter": 150, "stroke": 10 }, "transform": { "rotate": [1.5708, 0, 0] } },
      { "id": "rotor", "shape": "cone", "color": "var(--accent)", "props": { "diameter": 74, "length": 96 } },
      { "id": "bead", "shape": "shape", "color": "var(--cat-4-mark)", "props": { "stroke": 26 }, "transform": { "at": [75, 0, 0] }, "motion": [{ "verb": "orbit", "axis": "y", "period": 1500 }] }
    ] }
  ]
}
```

---

<!-- _class: split-panel spectrum-edge-right -->

`statement · split-panel`

## The featured panel makes the claim; this side supports it.

A dark left panel carries the headline, and the bright right column holds up to three supporting items.

- Two zones, one argument
  - The split is hierarchy, not decoration — the panel claims, the column proves.
- Three items is the comfort zone
  - A short title and one supporting line each, like this.
- Prose stays on a budget
  - Sixteen words per item keeps the column scannable.

---

<!-- _class: collage bleed spectrum-edge-left -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)

---

<!-- _class: split-compare dark spectrum-edge-left -->

`comparison · split-compare`

## The dark panel asks; the grid answers.

One question on the left; two option cards and a verdict on the right.

- Option A
  - Three short rows state the case
  - Rows stay parallel across cards
- Option B
  - The grid begs comparison
  - Mismatched rows read as bias

> The verdict card lands last: one recommendation, one revisit date.

---

<!-- _class: content -->

## Pick the side by brand, not by layout

We recommend choosing where the bar sits for the deck as a whole. Full-bleed slides carry it over the art without moving anything.
