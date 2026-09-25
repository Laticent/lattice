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

A slide too full for the scale steps down. It is never clipped.

---

<!-- _class: list-steps insight-so-what -->
<!-- _footer: "Steps down · 5 steps is past list-steps' scale-xl budget of 4" -->

`Steps down · list-steps`

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

> Five steps do not fit at 1.3x, so this slide renders at the next size down.

---

<!-- _class: list-steps insight-so-what -->
<!-- _footer: "Holds the full scale · 4 steps is within the scale-xl budget" -->

`Holds the full scale · list-steps`

## Four steps fit at the deck's full size.

1. Plan
   - Reads the ticket and plans the change.
2. Build
   - Writes code and tests, opens a pull request.
3. Fix
   - Fixes whatever breaks the build.
4. Hand off
   - Waits for approval, leaves notes.

> The same strip with one step fewer keeps the full 1.3x.

---

<!-- _class: compare-prose vertical insight-so-what -->
<!-- _footer: "Steps down · two paragraphs need about 1.69x their height at 1.3x" -->

`Steps down · compare-prose`

## AI raises your floor, but only you can raise your ceiling.

- The floor
  - Anyone can now produce working-looking code in minutes. That part got cheap, for everyone.
- The ceiling
  - Knowing what to build, spotting what is wrong, deciding when it is good enough. That part is still yours.

> Wrapped prose grows on both axes, so this pair steps further down than a list does.

---

<!-- _class: cycle insight-key -->
<!-- _footer: "Steps down · a five-stage ring with a key insight" -->

`Steps down · cycle`

## Every session feeds the next one.

- Plan
  - The agent reads the brief and the open issues.
- Build
  - It changes the code and runs the checks.
- Review
  - A person reads the diff and the evidence.
- Record
  - The decision note says why, for next time.
- Resume
  - The next session starts from the note.

> The ring keeps its shape; the labels step down until the stages fit.

---

<!-- _class: code -->
<!-- _footer: "Steps down · 11 lines under an eyebrow; the scale-xl pane holds 10" -->

`Steps down · code`

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
<!-- _footer: "Holds the full scale · 10 lines is the scale-xl budget under an eyebrow" -->

`Holds the full scale · code`

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

<!-- _class: closing qr -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Steps down · closing qr`

## Leave a scannable takeaway behind.

The QR tile is sized in em, so it grows with the scale and this slide steps down to hold it.

- https://laticent.io/components/closing
- Scan to open `caption`

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## The scale is a request. The frame is a promise.

`lint:deck flags it · the export's SCALE line names it`
