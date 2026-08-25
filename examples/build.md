---
marp: true
theme: indaco
paginate: true
footer: "SlideWright · narrative build"
---

<!-- _class: title silent -->

# Assemble the slide as you go.

`Feature · narrative build`

A dense slide lands all at once. Walked live, the story is better told one beat at a time — a bullet, a table row, a line of code. `_build` makes that a one-line directive, derived from the slide's own structure, and it degrades to the whole slide in print.

---

<!-- _class: divider -->

## The slide is the same. The reveal is the argument.

You don't split the content across slides — you sequence it in place. One grammar, a subset of `_focus`, addresses any surface: `item`, `row`, `col`, `line`. Document order is the order it builds.

---

<!-- _class: content -->
<!-- _build -->

## `_build` — one step per point, in order.

- First you frame the problem.
- Then you show the evidence.
- Then you draw the conclusion.
- And only then the ask.

---

<!-- _class: content -->
<!-- _build: 1, 2-3, 4 -->

## `_build: 1, 2-3, 4` — group beats into steps.

- The setup stands alone.
- These two land together —
- — because they're one idea in two halves.
- The payoff arrives last.

---

<!-- _class: compare-table state-cells -->
<!-- _build: rows -->

## `_build: rows` — reveal the comparison row by row.

| Criterion    | Option A | Option B | Option C |
| ------------ | -------- | -------- | -------- |
| Speed        | [x]      | [ ]      | [x]      |
| Auditability | [ ]      | [x]      | [x]      |
| Cost         | Low      | High     | Low      |

---

<!-- _class: code -->
<!-- _build: lines -->

## `_build: lines` — walk the code a line at a time.

```js
function reveal(step) {
  const units = section.querySelectorAll('[data-build-step]');
  for (const u of units) u.classList.toggle('lat-built', +u.dataset.buildStep <= step);
}
```

---

<!-- _class: closing silent -->

# Derived, restrained, print-faithful.

`Beamer overlays, not PowerPoint.`

The engine only tags the steppable units; the reveal is pure CSS. With no player driving it — and in every PDF — the slide simply shows whole. The live walk-through is the enhancement, never the artifact.
