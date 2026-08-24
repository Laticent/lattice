---
marp: true
theme: indaco
paginate: true
header: "Lattice · the universal coda"
footer: "One cell for the trailing beats"
acronyms:
  ROW: row
---

<!-- _class: title silent -->

# The universal coda

`Key insight · Below-note · One cell`

The two blocks an author can add to almost any slide now have a host — and the
host decides how they dock, so a component never has to.

---

<!-- _class: list -->
<!-- _footer: "list · the step is a register change" -->

## The step above the band is wider than any step inside a block.

- A card list sets sixteen pixels between its own cards.
- The band above it used to get eight — half as much.
- A separator between two kinds of block cannot be smaller than the one between peers.
- The band now carries its own step, identical on every layout.

> Key insight: the panel reads as a different kind of block, not a fourth card.

---

<!-- _class: compare-code -->
<!-- _footer: "compare-code · was swallowed into the right-hand column" -->

`Attachment · selector shape vs. a host`

## Two code columns, and a band that belongs to neither.

`Before · the panel had no host`

```css
section:not(.quote):not(.math)
  > blockquote { … }
section:not(.quote):not(.math)
  > .cell-stage > blockquote { … }
```

`After · the panel has a cell`

```css
section .cell-coda
  > blockquote { … }
```

> Key insight: this blockquote used to print as unstyled body text inside the right-hand column.

---

<!-- _class: code -->
<!-- _footer: "code · panel under a painted surface" -->

## A filled panel needs more air beneath a filled panel than prose does.

```js
// The kernel runs FIRST, on the authored body.
function harvest(section) {
  const beats = trailingBeats(section);   // blockquote, then note
  if (!beats.length) return section;      // nothing to host
  return wrap(beats, 'cell-coda');        // one cell, docked by structure
}
```

> Key insight: running first is what saves the layouts that used to delete the node.

---

<!-- _class: premise -->
<!-- _footer: "premise · a flex ROW, so the band breaks to its own line" -->

## Three structures cover every layout.

- Column `57 layouts`
  - The band is simply the last child, so nothing is declared.
- Row `3 layouts`
  - The band breaks to a full line, never a third column.
- Grid `1 layout`
  - The band spans every track in an implicit final row.

> Key insight: measured, not assumed — so the CSS has three arms and names no component.

---

<!-- _class: cards-grid -->
<!-- _footer: "cards-grid · both beats, one cell" -->

## Both beats share the cell, in reading order.

- Key insight
  - The takeaway. It summarizes the body, so it sits directly beneath it.
- Below-note
  - The footnote. Source, scope or caveat — it goes last.
- One step
  - The cell owns the distance to the body.

> Key insight: one cell, one rhythm — whether a slide ends with an insight, a note, or both.

Source: measured on the real emulator render, in Chromium, across all sixty-one layouts.

---

<!-- _class: quote -->
<!-- _footer: "quote · claims both, and says so" -->

> A layout that uses the trailing element for its own anatomy declares it, and the
> contract stops advertising a block it never rendered.

The opt-out is the point — quote takes this blockquote as the quotation.
