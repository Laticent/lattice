---
marp: true
theme: indaco
paginate: true
header: "Lattice · Fabricate Motion"
---

<!-- _class: title silent -->

# A drawing, and the order it arrives in

`Fabricate · Motion · craft`

Bring an SVG. Lattice finds its parts, you give each one a beat, and it plays — on screen. On paper the finished drawing holds. This deck is what the Motion faculty produces.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The premise`

## Order is the argument a still cannot make.

---

<!-- _class: scene gallery -->
<!-- _footer: "one beat — every part arrives together" -->

## Together, the pipeline is just a picture.

Three stages and two arrows, all on one beat. Everything fades in at once, which is what a static diagram already does — so the motion adds nothing, and the faculty says so.

<svg viewBox="0 0 460 150" role="img" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><title>Three stages in a pipeline</title><desc>Three rounded boxes joined left to right by two arrows.</desc><rect id="m1-first" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"/><path id="m1-arrow-a" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"/><rect id="m1-second" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"/><path id="m1-arrow-b" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"/><rect id="m1-third" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"/></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-together",
  "duration": 900,
  "hero": 1,
  "elements": [
    { "id": "m1-first", "pathRef": "m1-first", "motion": [{ "verb": "reveal", "at": 0, "span": 1 }] },
    { "id": "m1-arrow-a", "pathRef": "m1-arrow-a", "motion": [{ "verb": "reveal", "at": 0, "span": 1 }] },
    { "id": "m1-second", "pathRef": "m1-second", "motion": [{ "verb": "reveal", "at": 0, "span": 1 }] },
    { "id": "m1-arrow-b", "pathRef": "m1-arrow-b", "motion": [{ "verb": "reveal", "at": 0, "span": 1 }] },
    { "id": "m1-third", "pathRef": "m1-third", "motion": [{ "verb": "reveal", "at": 0, "span": 1 }] }
  ]
}
```

---

<!-- _class: scene gallery -->
<!-- _footer: "five beats — the same drawing, now an argument" -->

## Beat by beat, it becomes a sequence.

The same five parts, one per beat. Now the drawing says *first this, then that* — a claim about order that the still can only imply. The parts and the drawing did not change; the running order did.

<svg viewBox="0 0 460 150" role="img" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><title>The same pipeline, drawn in order</title><desc>The same three boxes and two arrows, each arriving on its own beat.</desc><rect id="m2-first" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"/><path id="m2-arrow-a" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"/><rect id="m2-second" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"/><path id="m2-arrow-b" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"/><rect id="m2-third" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"/></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-beats",
  "duration": 4500,
  "hero": 1,
  "elements": [
    { "id": "m2-first", "pathRef": "m2-first", "motion": [{ "verb": "draw", "at": 0, "span": 0.2 }] },
    { "id": "m2-arrow-a", "pathRef": "m2-arrow-a", "motion": [{ "verb": "draw", "at": 0.2, "span": 0.2 }] },
    { "id": "m2-second", "pathRef": "m2-second", "motion": [{ "verb": "draw", "at": 0.4, "span": 0.2 }] },
    { "id": "m2-arrow-b", "pathRef": "m2-arrow-b", "motion": [{ "verb": "draw", "at": 0.6, "span": 0.2 }] },
    { "id": "m2-third", "pathRef": "m2-third", "motion": [{ "verb": "draw", "at": 0.8, "span": 0.2 }] }
  ]
}
```

---

<!-- _class: scene gallery -->
<!-- _footer: "slides in — a part that arrives from somewhere" -->

## A part can arrive from somewhere.

Slide pairs with a fade, always. A shape that travels home while fully opaque reads as a shape that was always there and merely moved — not as an arrival, which is what a beat means.

<svg viewBox="0 0 320 180" role="img" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><title>A base with two markers arriving</title><desc>A horizontal rule with two round markers that slide in from the sides.</desc><path id="m3-base" d="M30 140 H290" stroke="var(--text-muted)"/><circle id="m3-left" cx="96" cy="90" r="26" stroke="var(--accent)"/><circle id="m3-right" cx="224" cy="90" r="26" stroke="var(--cat-4-mark)"/></svg>

```anima
{
  "source": "svg",
  "asset": "arrivals",
  "duration": 2700,
  "hero": 1,
  "elements": [
    { "id": "m3-base", "pathRef": "m3-base", "motion": [{ "verb": "draw", "at": 0, "span": 0.333333 }] },
    { "id": "m3-left", "pathRef": "m3-left", "motion": [{ "verb": "reveal", "at": 0.333333, "span": 0.333333 }, { "verb": "slide", "at": 0.333333, "span": 0.333333, "from": [-58, 0] }] },
    { "id": "m3-right", "pathRef": "m3-right", "motion": [{ "verb": "reveal", "at": 0.666667, "span": 0.333333 }, { "verb": "slide", "at": 0.666667, "span": 0.333333, "from": [58, 0] }] }
  ]
}
```

---

<!-- _class: scene gallery -->
<!-- _footer: "the poster is the finished drawing — this page in print" -->

## The still is the finished drawing, never a half-drawn one.

Every plan the faculty writes sets `hero: 1`, so the frame the PDF freezes is the last one. A half-drawn diagram is a defect, not a fallback — and a reader who asked for reduced motion sees exactly this page.

<svg viewBox="0 0 320 180" role="img" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><title>A ring and its marker, settled</title><desc>A ring with a marker on its edge, shown in its finished state.</desc><circle id="m4-ring" cx="160" cy="90" r="58" stroke="var(--cat-2-mark)"/><circle id="m4-bead" cx="218" cy="90" r="12" stroke="var(--accent)"/><path id="m4-rule" d="M60 158 H260" stroke="var(--text-muted)"/></svg>

```anima
{
  "source": "svg",
  "asset": "settled",
  "duration": 2700,
  "hero": 1,
  "elements": [
    { "id": "m4-ring", "pathRef": "m4-ring", "motion": [{ "verb": "draw", "at": 0, "span": 0.333333 }] },
    { "id": "m4-bead", "pathRef": "m4-bead", "motion": [{ "verb": "draw", "at": 0.333333, "span": 0.333333 }, { "verb": "highlight", "at": 0.333333, "span": 0.333333 }] },
    { "id": "m4-rule", "pathRef": "m4-rule", "motion": [{ "verb": "draw", "at": 0.666667, "span": 0.333333 }] }
  ]
}
```

---

<!-- _class: closing silent -->

## Craft it once. Place it anywhere.

`Fabricate · Motion`

A saved motion is a drawing plus its running order, in one record, on your Library shelf. Insert writes the slide; the drawing travels inside the deck, so a deck you forward carries its own art.
