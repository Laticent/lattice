---
marp: true
theme: indaco
paginate: true
header: "Lattice · Fabricate Motion"
---

<!-- _class: title silent -->

# A drawing, and the order it arrives in

`Fabricate · Motion · craft`

Describe a drawing or bring one, and Lattice finds its parts. You give each one a beat, and it plays — on screen. On paper the finished drawing holds. **Every drawing and every plan below came out of the faculty** — the art, its ids and the fence beneath it are what Insert wrote. The frame around them is this deck's: the title, the divider, the closing, and each scene slide's gallery class and footer.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The premise`

## Order is the argument a still cannot make.

---

<!-- _footer: "one beat — every part arrives together" -->
<!-- _class: scene gallery -->

## Together, the pipeline is just a picture.

Three stages and two arrows, all on one beat. Everything arrives at once — which is what a static diagram already does, so the motion adds nothing here, and the faculty says so.

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="md7ihac63" role="img"><title>Together, the pipeline is just a picture.</title><desc>Three rounded boxes joined left to right by two arrows.</desc><rect id="md7ihac63-first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"></rect><path id="md7ihac63-first-arrow" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"></path><rect id="md7ihac63-second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"></rect><path id="md7ihac63-second-arrow" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"></path><rect id="md7ihac63-third-stage" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"></rect></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-together",
  "duration": 900,
  "hero": 1,
  "elements": [
    {
      "id": "md7ihac63-first-stage",
      "pathRef": "md7ihac63-first-stage",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "md7ihac63-first-arrow",
      "pathRef": "md7ihac63-first-arrow",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "md7ihac63-second-stage",
      "pathRef": "md7ihac63-second-stage",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "md7ihac63-second-arrow",
      "pathRef": "md7ihac63-second-arrow",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "md7ihac63-third-stage",
      "pathRef": "md7ihac63-third-stage",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    }
  ]
}
```

---

<!-- _footer: "five beats — the same drawing, now an argument" -->
<!-- _class: scene gallery -->

## Beat by beat, it becomes a sequence.

The same five parts, one per beat, each drawing itself. Now the drawing says *first this, then that* — a claim about order the still can only imply. The parts did not change; the running order did.

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="m3dimpz56" role="img"><title>Beat by beat, it becomes a sequence.</title><desc>The same three boxes and two arrows, each drawing itself on its own beat.</desc><rect id="m3dimpz56-first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"></rect><path id="m3dimpz56-first-arrow" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"></path><rect id="m3dimpz56-second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"></rect><path id="m3dimpz56-second-arrow" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"></path><rect id="m3dimpz56-third-stage" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"></rect></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-beats",
  "duration": 4500,
  "hero": 1,
  "elements": [
    {
      "id": "m3dimpz56-first-stage",
      "pathRef": "m3dimpz56-first-stage",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m3dimpz56-first-arrow",
      "pathRef": "m3dimpz56-first-arrow",
      "motion": [
        {
          "verb": "draw",
          "at": 0.2,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m3dimpz56-second-stage",
      "pathRef": "m3dimpz56-second-stage",
      "motion": [
        {
          "verb": "draw",
          "at": 0.4,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m3dimpz56-second-arrow",
      "pathRef": "m3dimpz56-second-arrow",
      "motion": [
        {
          "verb": "draw",
          "at": 0.6,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m3dimpz56-third-stage",
      "pathRef": "m3dimpz56-third-stage",
      "motion": [
        {
          "verb": "draw",
          "at": 0.8,
          "span": 0.2
        }
      ]
    }
  ]
}
```

---

<!-- _footer: "slides in — a part that arrives from somewhere" -->
<!-- _class: scene gallery -->

## A part can arrive from somewhere.

Slide pairs with a fade, always. A shape that travels home while fully opaque reads as one that was always there and merely moved — not as an arrival, which is what a beat means.

<svg viewBox="0 0 320 180" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="mgu06hc7m" role="img"><title>A part can arrive from somewhere.</title><desc>A horizontal rule with two round markers that slide in from the sides.</desc><path id="mgu06hc7m-baseline" d="M30 140 H290" stroke="var(--text-muted)"></path><circle id="mgu06hc7m-left-marker" cx="96" cy="90" r="26" stroke="var(--accent)"></circle><circle id="mgu06hc7m-right-marker" cx="224" cy="90" r="26" stroke="var(--cat-4-mark)"></circle></svg>

```anima
{
  "source": "svg",
  "asset": "arrivals",
  "duration": 1650,
  "hero": 1,
  "elements": [
    {
      "id": "mgu06hc7m-baseline",
      "pathRef": "mgu06hc7m-baseline",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.333333
        }
      ]
    },
    {
      "id": "mgu06hc7m-left-marker",
      "pathRef": "mgu06hc7m-left-marker",
      "motion": [
        {
          "verb": "reveal",
          "at": 0.333333,
          "span": 0.333333
        },
        {
          "verb": "slide",
          "at": 0.333333,
          "span": 0.333333,
          "from": [
            -57.6,
            0
          ]
        }
      ]
    },
    {
      "id": "mgu06hc7m-right-marker",
      "pathRef": "mgu06hc7m-right-marker",
      "motion": [
        {
          "verb": "reveal",
          "at": 0.666667,
          "span": 0.333333
        },
        {
          "verb": "slide",
          "at": 0.666667,
          "span": 0.333333,
          "from": [
            57.6,
            0
          ]
        }
      ]
    }
  ]
}
```

---

<!-- _footer: "the poster is the finished drawing — this page in print" -->
<!-- _class: scene gallery -->

## The still is the finished drawing, never a half-drawn one.

Every plan the faculty writes sets a hero of 1, so the frame the PDF freezes is the last one. A half-drawn diagram is a defect, not a fallback — and a reader who asked for reduced motion sees exactly this page.

<svg viewBox="0 0 320 180" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="mxyqxfnzu" role="img"><title>The still is the finished drawing, never a half-drawn one.</title><desc>A ring with a marker on its edge, over a rule, shown in its finished state.</desc><circle id="mxyqxfnzu-ring" cx="160" cy="90" r="58" stroke="var(--cat-2-mark)"></circle><circle id="mxyqxfnzu-bead" cx="218" cy="90" r="12" stroke="var(--accent)"></circle><path id="mxyqxfnzu-rule" d="M60 158 H260" stroke="var(--text-muted)"></path></svg>

```anima
{
  "source": "svg",
  "asset": "settled",
  "duration": 1650,
  "hero": 1,
  "elements": [
    {
      "id": "mxyqxfnzu-ring",
      "pathRef": "mxyqxfnzu-ring",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.333333
        }
      ]
    },
    {
      "id": "mxyqxfnzu-bead",
      "pathRef": "mxyqxfnzu-bead",
      "motion": [
        {
          "verb": "draw",
          "at": 0.333333,
          "span": 0.333333
        },
        {
          "verb": "highlight",
          "at": 0.333333,
          "span": 0.333333
        }
      ]
    },
    {
      "id": "mxyqxfnzu-rule",
      "pathRef": "mxyqxfnzu-rule",
      "motion": [
        {
          "verb": "draw",
          "at": 0.666667,
          "span": 0.333333
        }
      ]
    }
  ]
}
```

---

<!-- _class: closing silent -->

## Craft it once. Place it anywhere.

`Fabricate · Motion`

A saved motion is a drawing plus its running order, in one record, on your Library shelf. Insert writes the slide; the drawing travels inside the deck, so a deck you forward carries its own art.
