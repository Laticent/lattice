---
marp: true
theme: indaco
paginate: true
header: "Lattice · q-and-a alignment pass"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: "Title slide · title" -->

# The Q&A slide, on one baseline

`Component pass · q-and-a`

Six looks, four measured misalignments, and a spine that stopped dangling

---

<!-- _class: q-and-a -->
<!-- _footer: "Default ledger — the numeral now sits on the question's baseline" -->

`Anticipated questions`

## What the board will press on.

- Why commit the full amount now rather than staging it across two fiscal years?
  - The discount lapses in Q3.
- What happens if the pilot misses its adoption target?
  - We hold the second tranche.
- Who owns the outcome?
  - One executive, reporting monthly.

— The index was an absolute mark at `top: 0`, which lands its box on the question's box, not its baseline. It is a flex item now, so the two share a baseline exactly.

---

<!-- _class: q-and-a spine -->
<!-- _footer: "spine — the rail begins and ends on a node" -->

## The spine no longer overshoots its nodes.

- Why does a rail need a fix at all?
  - It spanned the canvas; the nodes sat centered in it.
- How far did it dangle?
  - 62px above the first node, 122px below the last.
- What draws it now?
  - Each pair draws its own segment, centre to centre.

— A per-pair segment cannot dangle: its length is the pair's own height plus the one gap below it, and both are known where it is drawn.

---

<!-- _class: q-and-a rail -->
<!-- _footer: "rail — number, question and answer on one baseline" -->

## The exhibit row reads as one line again.

- What was misaligned?
  - The answer sat 7.9px high.
- Why did that happen?
  - The row aligned boxes, not baselines.
- And the numeral?
  - It reads 01 now, like every other look.

— Three type sizes aligned by box top will never share a line. `align-items: baseline` is the only setting that does what an exhibit table promises.

---

<!-- _class: q-and-a tab -->
<!-- _footer: "tab — the pairs group again" -->

## A pair now looks like a pair.

- How much air sat inside a pair?
  - Thirty-one pixels.
- And between two pairs?
  - Thirty-four — so nothing grouped.

— Proximity is the only thing telling a reader where one pair ends. A ratio of 1.1 was not doing it; the tightened pair and opened gap read 2.6, at no cost in capacity.

---

<!-- _class: q-and-a grid -->
<!-- _footer: "grid — four questions, one starting line" -->

## The quadrant tops align at any length.

- Why did the old reserve fail?
  - A three-line question blew straight through it.
- What did it cost when it worked?
  - Forty-two pixels of dead air per cell.
- Where is the numeral?
  - Over its own question, not in a gutter.
- What aligns now?
  - Every question top, at every length.

— The two-line reserve bought answer alignment in the easy case and lost it in the hard one. Top-packing aligns the questions exactly, always, and spends nothing.

---

<!-- _class: q-and-a solo -->
<!-- _footer: "solo — the index re-base finally reaches the counter" -->

## One question, at its own scale.

- Why was the numeral the wrong size here?
  - The stage re-declared the token and won.

— The private tokens moved off `> .cell-stage` onto the section, so a modifier and the default now sit in the same cascade and specificity decides. This line had been inert since it was written.

---

<!-- _class: closing silent -->
<!-- _footer: "Closing · closing" -->

## What this pass changed.

`Summary`

- Numeral and question share a baseline in every look — measured 0px, from the rendered PNG
- The spine's rail begins and ends on a node
- `rail` aligns its three columns; `grid` aligns its four question tops
- `tab` groups its pairs at no cost in capacity
