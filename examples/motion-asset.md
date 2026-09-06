---
marp: true
theme: indaco
paginate: true
header: "Lattice · Fabricate Motion"
---

<!-- _class: title silent -->

# A drawing, and the order it arrives in

`Fabricate · Motion · craft`

Describe a drawing or bring one, and Lattice finds its parts. You give each one a beat, and it plays — on screen. On paper the finished drawing holds. **Every slide below is the Motion faculty's own output**, unedited.

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

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="m1x8edyz" role="img"><title>Together, the pipeline is just a picture.</title><desc>Three rounded boxes joined left to right by two arrows.</desc><rect id="m1x8edyz-first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"></rect><path id="m1x8edyz-first-arrow" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"></path><rect id="m1x8edyz-second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"></rect><path id="m1x8edyz-second-arrow" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"></path><rect id="m1x8edyz-third-stage" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"></rect></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-together",
  "duration": 900,
  "hero": 1,
  "elements": [
    {
      "id": "m1x8edyz-first-stage",
      "pathRef": "m1x8edyz-first-stage",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "m1x8edyz-first-arrow",
      "pathRef": "m1x8edyz-first-arrow",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "m1x8edyz-second-stage",
      "pathRef": "m1x8edyz-second-stage",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "m1x8edyz-second-arrow",
      "pathRef": "m1x8edyz-second-arrow",
      "motion": [
        {
          "verb": "reveal",
          "at": 0,
          "span": 1
        }
      ]
    },
    {
      "id": "m1x8edyz-third-stage",
      "pathRef": "m1x8edyz-third-stage",
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

<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="m1x8edyz" role="img"><title>Beat by beat, it becomes a sequence.</title><desc>The same three boxes and two arrows, each drawing itself on its own beat.</desc><rect id="m1x8edyz-first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"></rect><path id="m1x8edyz-first-arrow" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"></path><rect id="m1x8edyz-second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"></rect><path id="m1x8edyz-second-arrow" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"></path><rect id="m1x8edyz-third-stage" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"></rect></svg>

```anima
{
  "source": "svg",
  "asset": "pipeline-beats",
  "duration": 4500,
  "hero": 1,
  "elements": [
    {
      "id": "m1x8edyz-first-stage",
      "pathRef": "m1x8edyz-first-stage",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m1x8edyz-first-arrow",
      "pathRef": "m1x8edyz-first-arrow",
      "motion": [
        {
          "verb": "draw",
          "at": 0.2,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m1x8edyz-second-stage",
      "pathRef": "m1x8edyz-second-stage",
      "motion": [
        {
          "verb": "draw",
          "at": 0.4,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m1x8edyz-second-arrow",
      "pathRef": "m1x8edyz-second-arrow",
      "motion": [
        {
          "verb": "draw",
          "at": 0.6,
          "span": 0.2
        }
      ]
    },
    {
      "id": "m1x8edyz-third-stage",
      "pathRef": "m1x8edyz-third-stage",
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

<svg viewBox="0 0 320 180" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="m14iwzna" role="img"><title>A part can arrive from somewhere.</title><desc>A horizontal rule with two round markers that slide in from the sides.</desc><path id="m14iwzna-baseline" d="M30 140 H290" stroke="var(--text-muted)"></path><circle id="m14iwzna-left-marker" cx="96" cy="90" r="26" stroke="var(--accent)"></circle><circle id="m14iwzna-right-marker" cx="224" cy="90" r="26" stroke="var(--cat-4-mark)"></circle></svg>

```anima
{
  "source": "svg",
  "asset": "arrivals",
  "duration": 1650,
  "hero": 1,
  "elements": [
    {
      "id": "m14iwzna-baseline",
      "pathRef": "m14iwzna-baseline",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.333333
        }
      ]
    },
    {
      "id": "m14iwzna-left-marker",
      "pathRef": "m14iwzna-left-marker",
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
            -57.599999999999994,
            0
          ]
        }
      ]
    },
    {
      "id": "m14iwzna-right-marker",
      "pathRef": "m14iwzna-right-marker",
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
            -57.599999999999994,
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

<svg viewBox="0 0 320 180" fill="none" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" data-lattice-motion="mzp4a98" role="img"><title>The still is the finished drawing, never a half-drawn one.</title><desc>A ring with a marker on its edge, over a rule, shown in its finished state.</desc><circle id="mzp4a98-ring" cx="160" cy="90" r="58" stroke="var(--cat-2-mark)"></circle><circle id="mzp4a98-bead" cx="218" cy="90" r="12" stroke="var(--accent)"></circle><path id="mzp4a98-rule" d="M60 158 H260" stroke="var(--text-muted)"></path></svg>

```anima
{
  "source": "svg",
  "asset": "settled",
  "duration": 1650,
  "hero": 1,
  "elements": [
    {
      "id": "mzp4a98-ring",
      "pathRef": "mzp4a98-ring",
      "motion": [
        {
          "verb": "draw",
          "at": 0,
          "span": 0.333333
        }
      ]
    },
    {
      "id": "mzp4a98-bead",
      "pathRef": "mzp4a98-bead",
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
      "id": "mzp4a98-rule",
      "pathRef": "mzp4a98-rule",
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
