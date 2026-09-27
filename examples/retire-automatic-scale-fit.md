---
marp: true
theme: indaco
paginate: true
venue: hall
header: "Lattice · Venue is a fixed size"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# The room sets the size

`Typography · venue: hall`

Every slide renders at 1.5x. A slide too full for the room clips and is named, and the deck never shrinks itself to fit.

---

<!-- _class: list-steps -->
<!-- _footer: "Fits · 3 steps, the hall budget" -->

`Fits · list-steps`

## Three steps read from the back row.

1. Plan
   - Reads the ticket and writes the plan down.
2. Build
   - Writes the code and the tests.
3. Hand off
   - Opens the pull request with notes.

---

<!-- _class: list-steps -->
<!-- _footer: "Clips · 5 steps, past the hall budget of 3" -->

`Too full · list-steps`

## Five long steps do not fit at 1.5x.

1. Plan
   - Reads the ticket, plans the change, and writes down why before anyone asks for it.
2. Build
   - Writes the code and the tests, then opens a pull request with a clear summary.
3. Fix
   - Fixes whatever breaks the build and explains each fix in a short commit message.
4. Report
   - Notes how sure it is about the change, and names the parts it could not check.
5. Hand off
   - Waits for approval, answers the review comments, and leaves notes for the next session.

<!-- stress-slide -->

<!--
This slide clips on purpose: it is the one the demo is about. Without the stress-slide marker lint:deck warns (capacity-scale); the Studio rings it and offers "Split slide" or "Use Conference", and the export's OVERFLOW line lists this page.
-->

---

<!-- _class: list-steps -->
<!-- _footer: "Fix · Split slide, first half" -->

`Split · list-steps`

## Five long steps do not fit at 1.5x.

1. Plan
   - Reads the ticket, plans the change, and writes down why before anyone asks for it.
2. Build
   - Writes the code and the tests, then opens a pull request with a clear summary.
3. Fix
   - Fixes whatever breaks the build and explains each fix in a short commit message.

---

<!-- _class: list-steps -->
<!-- _footer: "Fix · Split slide, second half" -->

`Split · list-steps`

## Five long steps do not fit at 1.5x.

4. Report
   - Notes how sure it is about the change, and names the parts it could not check.
5. Hand off
   - Waits for approval, answers the review comments, and leaves notes for the next session.

---

<!-- _class: stats -->
<!-- _footer: "Retired · the automatic step-down" -->

`Retired · STEP and LEVEL`

## One size, set by the author, on every surface.

1. 1.5x
   - every slide at hall
2. 0
   - whole-deck measures
3. 3
   - places a clip is named

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Pick the room, then write for it`

## The venue is a promise the deck keeps.

Choose it in deck settings, switch it live in Present, and split what does not fit.
