<!-- _class: title silent -->

# imagery

`3 components`

Imagery — visuals that carry their own meaning.


---

<!-- _class: image -->
<!-- _footer: "image · imagery survey" -->

## The image layout reads the asset’s shape.

Two-thirds of trials that reach the first generated report convert to paid; the ones that stall at workspace setup almost never do. Hand the layout any photo — it resolves the composition from the asset's shape.

![bg](image/sample-photo-wide.svg)

---

<!-- _class: scene gallery -->
<!-- _footer: "scene · imagery survey" -->

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

<!-- _class: video companion -->
<!-- _footer: "video · imagery survey" -->

## The video card plays beside its context.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`
