---
marp: true
theme: indaco
paginate: true
header: "Lattice · Anima"
---

<!-- _class: title silent -->

# Motion that carries meaning

`Imagery · Anima · live scenes`

A `scene` slide freezes an Anima poster into the PDF — and on the HTML/present surfaces, the poster comes alive. You author the motion as an `anima` spec beside the still; the deck shows the still in print and the living scene on screen.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The premise`

## The still is the fallback. The motion is the argument.

---

<!-- _class: scene -->
<!-- _footer: "built · Zdog — a rotor spinning inside its fixed housing" -->

## The rotor turns inside its fixed housing.

A relationship a single still can only imply: on screen the rotor spins and a bead orbits the ring; on paper this hero frame holds.

<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="92" rx="86" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,50 156,112 84,112" fill="var(--accent)"/><circle cx="120" cy="92" r="8" fill="var(--bg)" stroke="var(--text-heading)" stroke-width="4"/><circle cx="206" cy="92" r="11" fill="var(--cat-4-mark)"/></svg>

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

<!-- _class: scene gallery -->
<!-- _footer: "svg · Vivus — the flow draws itself, node by node" -->

## The pipeline assembles in order.

The drawing ORDER is the meaning — node, arrow, node — which a static diagram can only present all-at-once. On screen it strokes itself into being.

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect id="n1" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"/><path id="a1" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"/><rect id="n2" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"/><path id="a2" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"/><rect id="n3" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"/></svg>

```anima
{
  "source": "svg",
  "duration": 3600,
  "hero": 1,
  "asset": "flow",
  "elements": [
    { "id": "n1", "pathRef": "n1", "color": "var(--cat-2-mark)", "motion": [{ "verb": "draw", "span": 1 }] },
    { "id": "a1", "pathRef": "a1", "color": "var(--text-muted)", "motion": [{ "verb": "draw", "span": 1 }] },
    { "id": "n2", "pathRef": "n2", "color": "var(--accent)", "motion": [{ "verb": "draw", "span": 1 }] },
    { "id": "a2", "pathRef": "a2", "color": "var(--text-muted)", "motion": [{ "verb": "draw", "span": 1 }] },
    { "id": "n3", "pathRef": "n3", "color": "var(--cat-6-mark)", "motion": [{ "verb": "draw", "span": 1 }] }
  ]
}
```

---

<!-- _class: scene mirror -->
<!-- _footer: "reduced-motion → the poster; the deck respects the reader" -->

## Every scene reduces to its still.

Under `prefers-reduced-motion`, the vestibular spin doesn't autoplay — a scene whose whole point is the sweep falls back to this poster, now with a **Play the motion** control so a reader who wants it can still opt in. The default respects the reader; the choice stays theirs.

<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="92" rx="86" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,50 156,112 84,112" fill="var(--accent)"/><circle cx="120" cy="92" r="8" fill="var(--bg)" stroke="var(--text-heading)" stroke-width="4"/><circle cx="206" cy="92" r="11" fill="var(--cat-4-mark)"/></svg>

```anima
{
  "source": "built",
  "duration": 3000,
  "hero": 0.5,
  "camera": { "rotate": [-0.5, -0.6, 0] },
  "elements": [
    { "id": "rig", "shape": "group", "motion": [{ "verb": "spin", "axis": "y", "period": 3000 }], "children": [
      { "id": "ring", "shape": "ellipse", "color": "var(--cat-2-mark)", "props": { "diameter": 150, "stroke": 10 }, "transform": { "rotate": [1.5708, 0, 0] } },
      { "id": "rotor", "shape": "cone", "color": "var(--accent)", "props": { "diameter": 74, "length": 96 } }
    ] }
  ]
}
```

---

<!-- _class: closing silent -->

## One markdown. A poster in print, a living scene on screen.

`<!-- _class: scene -->` + a poster SVG + an `anima` spec. The PDF freezes the still; the Playground and present surfaces bring it to life, recolored to whatever theme frames it, and always reducible to the still.
