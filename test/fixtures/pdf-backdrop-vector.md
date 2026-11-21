---
marp: true
theme: indaco
paginate: true
---

<!-- Fixture for test/integration/export/pdf-backdrop-vector.test.js: one slide per backdrop shape the PDF writer
     draws (a lone glow, a glow under a texture, a dark finish with blooms and a vignette, a clear panel, a spotlight),
     one whose ghost numeral stays in the photo, one at half strength (a group opacity, which must not dim the slide's own frame ring), and one
     whose photo is busy (a noise filter left in it: the smaller of the two photos wins), and one with a flex item
     painted under the canvas plane (z-index -3, no position). -->

<style>
section.finish-meridian.ghost { --fin-mark-text: "Q3"; }
/* Slide 7 only: a group opacity. */
section:nth-of-type(7) { --backdrop-opacity: 0.5; }
</style>

<!-- _class: statement finish-gallery -->

## A lone glow.

The gallery finish paints one radial wash.

---

<!-- _class: statement finish-loom -->

## A glow under a weave.

The loom finish: a corner glow with a diagonal lattice over it.

---

<!-- _class: statement finish-nimbus dark -->

## Blooms on a dark canvas.

Four soft blooms and an edge vignette.

---

<!-- _class: statement finish-atrium backdrop-clear -->

## A clear panel.

The grid and the glow fade out behind the words.

---

<!-- _class: statement finish-halo backdrop-spot-tr -->

## A spotlight.

The halo rings show through one window.

---

<!-- _class: statement finish-meridian ghost -->

## A ghost numeral.

The numeral is text, so it stays in the photo.

---

<!-- _class: statement finish-gallery -->

## Half strength.

A group opacity dims the finish, and not the frame keyline: the slide's own ring stays at full strength.

---

<!-- _class: statement finish-loom -->

## A busy photo.

<svg width="900" height="300" viewBox="0 0 900 300"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2"/></filter><rect width="900" height="300" filter="url(#grain)"/></svg>

---

<!-- _class: statement finish-loom -->

## Under the canvas.

<div style="z-index: -3; width: 200px; height: 80px; background: rgb(255, 0, 0)"></div>
