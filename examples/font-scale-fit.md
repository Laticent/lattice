---
marp: true
theme: indaco
paginate: true
class: scale-xl
header: "Lattice · Projection scale fit"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Bigger type, same frame

`Typography · Projection scale`

One slide too full for 1.3x sets the size for the whole deck. Nothing is clipped, and nothing changes size between slides.

---

<!-- _class: list-steps insight-so-what -->
<!-- _footer: "Sets the size · 5 steps is past list-steps' scale-xl budget of 4" -->

`Sets the size · list-steps`

## Agents can now take a ticket all the way to review.

1. Plan
   - Reads the ticket and plans the change.
2. Build
   - Writes code and tests, opens a pull request.
3. Fix
   - Fixes whatever breaks the build.
4. Report
   - Notes how sure it is, and why.
5. Hand off
   - Waits for approval, leaves notes.

> Five steps fit at 1.15x, not 1.3x, so the deck renders at 1.15x.

---

<!-- _class: list-steps insight-so-what -->
<!-- _footer: "Fits at 1.3x · renders at the deck's 1.15x like its neighbors" -->

`Fits at 1.3x · list-steps`

## Four steps would fit at 1.3x on their own.

1. Plan
   - Reads the ticket and plans the change.
2. Build
   - Writes code and tests, opens a pull request.
3. Fix
   - Fixes whatever breaks the build.
4. Hand off
   - Waits for approval, leaves notes.

> It renders at 1.15x anyway, so the type does not jump as you click from slide 2.

---

<!-- _class: list takeaway -->
<!-- _footer: "The trim list · the export's SCALE line" -->

`Getting 1.3x back`

## The export names the slides that set the size.

- For 1.3x, it lists pages 2, 5 and 8.
- Trim those, and every slide renders at 1.3x.
- Until then, the whole deck stays at 1.15x.

---

<!-- _class: code -->
<!-- _footer: "Sets the size · 11 lines under an eyebrow; the scale-xl pane holds 10" -->

`Sets the size · code`

## The instruction file states the rules once.

```markdown
## Always
- Run the tests before you say anything is done.
- Failing test first, then the fix, then the same test passing.
- "Verified" says where it ran and shows proof from there.

## Ask first, even when a rule points at it
- Shared state: labels, boards, settings others read.
- The CI pipeline or git hooks.
- A number a person set: "about 12" is a decision.
- The meaning of a core doc, including this file.
- Anything irreversible or public.
```

---

<!-- _class: code -->
<!-- _footer: "Fits at 1.3x · 10 lines is the scale-xl budget under an eyebrow" -->

`Fits at 1.3x · code`

## Code keeps scaling; its line budget scales with it.

```markdown
## Always
- Run the tests before you say anything is done.
- Failing test first, then the fix, then the same test passing.

## Ask first, even when a rule points at it
- Shared state: labels, boards, settings others read.
- The CI pipeline or git hooks.
- A number a person set: "about 12" is a decision.
- Anything irreversible or public.
```

---

<!-- _class: list-steps insight-so-what fit-report -->
<!-- _footer: "fit-report · the engine changes nothing, so this slide clips and is flagged" -->
<!-- stress-slide -->

`Report only · fit-report`

## The same five steps, with the engine told to change nothing.

1. Plan
   - Reads the ticket and plans the change.
2. Build
   - Writes code and tests, opens a pull request.
3. Fix
   - Fixes whatever breaks the build.
4. Report
   - Notes how sure it is, and why.
5. Hand off
   - Waits for approval, leaves notes.

> `fit: report` is the switch for when self-healing gets in the way: nothing moves, and every clip is reported.

---

<!-- _class: closing qr -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Sets the size · closing qr`

## Leave a scannable takeaway behind.

The QR tile is sized in em, so it grows with the scale; this slide fits at 1.15x.

- https://laticent.io/components/closing
- Scan to open `caption`

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## The scale is a request. One size is a promise.

`lint:deck flags it · the export's SCALE line names it`
