---
marp: true
theme: indaco
size: story
paginate: true
header: "Lattice · tone rail on story split pages"
---

<!-- A `size: story` deck auto-splits `cards-grid` and `decision` into a cover, body pages and a closing
     page. A semantic tone draws its rail on every page of the run, as on a landscape slide. Before the
     fix the cover, the closing page and every `decision` page had no rail. -->

<!-- _class: cards-grid tone-warn -->

## A warning rail on every page

- Cover
  - The rail runs down the left edge.
- Body
  - So it does on each page after the cover.
- Closing
  - And on the page that ends the run.
- Reference
  - The tone is a color, not a class.
- Second
  - Same rail, same width.
- Third
  - No page loses it.

---

<!-- _class: decision tone-fail -->

## A failure rail on a decision

- Option A
  - Cost is low and the risk is high.
- Option B
  - Cost is high and the risk is low.
- Option C
  - Cost and risk sit in the middle.

---

<!-- _class: cards-grid tone-pass tone-glow -->

## A pass glow ring

- Edge
  - The glow is a ring on every side.
- Page
  - It reads the same on each page.
- Run
  - The cover matches the body.
- Close
  - So does the closing page.
