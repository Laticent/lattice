---
marp: true
theme: indaco
paginate: true
header: "Lattice · inline pills"
---

<!-- _class: title silent -->

# A pill is a property of the value.

`Lattice · inline pills`

Shape and color travel with the thing they describe, not with the slide.

---

<!-- _class: list takeaway -->

## What changed.

- `{LABEL}` inside inline code becomes a pill.
- `:tag` `:chip` `:circle` `:chevron-right` name the shape.
- `:c1`–`:c12` name a categorical slot, never a color.
- Plain inline code is untouched, so nothing existing moves.

---

<!-- _class: list-tabular -->
<!-- _footer: "One ledger, four different statuses — no variant on the slide." -->

## One slide can hold four different statuses.

1. Settlement engine
   - Shipped and load-tested `{STABLE}:c2`
2. Ledger migration
   - Cutover paused for review `{PARTIAL}:c4`
3. Reconciliation
   - Design agreed, not started `{QUEUED}:tag:c7`
4. Legacy batch
   - Retired this quarter `{CLOSED}:tag:c12`

---

<!-- _class: list-tabular -->
<!-- _footer: "The same rows, before pills — the register variant tinted every pill the same." -->

## Before, the slide chose the look.

1. Settlement engine
   - Shipped and load-tested `STABLE`
2. Ledger migration
   - Cutover paused for review `PARTIAL`
3. Reconciliation
   - Design agreed, not started `QUEUED`
4. Legacy batch
   - Retired this quarter `CLOSED`

---

<!-- _class: list-tabular -->
<!-- _footer: "Eight shapes. Geometry is ours — nothing is a typed glyph." -->

## Eight shapes cover the vocabulary.

1. Capsule and tag
   - `{DEFAULT}:c1` `{TAG}:tag:c2`
2. Bordered and chip
   - `{BORDERED}:tag-bordered:c4` `{CHIP}:chip:c7`
3. Round and pointed
   - `{3}:circle:c5` `{NEXT}:chevron-right:c6` `{BACK}:chevron-left:c8`
4. Decision marks
   - `{!}:diamond:c3` `{?}:diamond:c11`

---

<!-- _class: list-tabular -->
<!-- _footer: "Two sizes off the default, both scaling from the type." -->

## Size follows the type, not a pixel.

1. Small
   - Quieter than the row it sits in `{SM}:sm:c9`
2. Default
   - The register's own meta size `{MD}:c9`
3. Large
   - For a status that is the point `{LG}:lg:c9`

---

<!-- _class: list-tabular -->
<!-- _footer: "Code stays code — the escape is doing nothing at all." -->

## Ordinary inline code is untouched.

1. A function
   - `getUserId()` renders as it always did
2. A CSS selector
   - `[data-mark]` and `:root` are not pills
3. An object
   - `{ ok, scene }` is code, not a label
4. A quoted marker
   - `[x]` still reads as the marker it names

---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · inline pills" -->

## When NOT to reach for a pill.

- A sentence
  - A pill is one word, two at most. If it needs a clause, it belongs in the row's description where it can wrap.
- A word in a circle or diamond
  - Both are square boxes by construction, so they hold a digit or a mark. `lint:deck` says so rather than refusing the deck.
- A color that means something
  - `:c1`–`:c12` are ordinal slots, not colors. The same slot is sky blue on indaco and deep red on burgundy — pick a slot for contrast, never to say "green means good".

---

<!-- _class: closing silent index -->

## See also.

`Related`

- `list-tabular` — the ledger these examples are set in
- `checklist` — bare `[x]` state markers, a different vocabulary
- `base.docs.md` — the cross-cutting authoring reference
