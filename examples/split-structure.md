---
size: portrait
theme: indaco
paginate: true
footer: "Auto-split — structure decides"
---

<!-- _class: title -->

# One thing per slide

`Auto-split · structure decides the cut`

A slide holding six things becomes six slides. The markup says how many, so every machine cuts the same deck the same way.

---

<!-- _class: content -->

## What changed

- The trigger is **structure**, not a measured overflow — no render decides the page count
- A page carries **one** structural element; nothing packs to an authoring budget
- Every run opens on a **cover** and closes on the section's **note and key insight**
- Each page **names the next one**, so an atomized run still reads as one thing

> A deck is authored once. What it becomes should not depend on which machine renders it.

---

<!-- _class: list-criteria -->

## What a split page owes the reader

- The one thing it holds, set at full size — not shrunk to share
- A heading that says which run it belongs to
- A pointer to what comes next
- A way back to the whole — the k-of-N rail in the footer band
- An ending that says what the run meant

_list-criteria could not split at all before this change._

---

<!-- _class: timeline-list -->

## How the cut was decided, over time

- Opt-in per deck
  - An author who never heard of the flag got a clipped slide
- Default-on for portrait
  - Right direction, wrong altitude — the directive was the thing to remove
- Measured fit
  - The page count became a property of the renderer
- Structure
  - Knowable from the markup, so the linter and the export agree

---

<!-- _class: journey -->

## Reading a split run — and a chart that stays whole

- Arrive
  - Meet the cover `@reader` `:1`
  - Learn what the run is about `@reader` `:1`
- Move
  - Take one element per page `@reader` `:4`
  - Follow the pointer to the next `@reader` `:4`
- Close
  - Read the note and the insight together `@reader` `:2`

_This slide does not split. A chart is one picture; cutting it apart would say something the author did not draw._

---

<!-- _class: content -->

## Enrollment across the catalog

- **32 of 61** components split — four of them could not before
- **29** are single structural elements already, and ring on overflow
- **0** pack, at any count, on any component
- **Every** run carries a forward pointer; four did before

_Each of the 29 has its reason recorded in `lib/core/split-facts.js`._

---

<!-- _class: closing -->

# More slides, one thing each

`Structure decides, not the renderer`
