---
marp: true
size: portrait
theme: indaco
paginate: true
header: "Lattice · inventory ordinal"
---

<!-- _class: title -->

# The index rides the title

`inventory · ledger · ordinal placement`

A portrait ledger auto-splits to one row per page. The ordinal now hangs off the
row's title, so it sits on that title's line at any row height.

---

<!-- _class: inventory -->

`inventory · the parts ledger`

## Three rows, one per page.

- The ordinal indexes the row
  - So it belongs on the row's title line.
- A split page is page-tall
  - The lone row centers; the title moves down.
- A centered box is not a centered line
  - The old ordinal centered on the box.

---

<!-- _class: statement -->

`what changed`

## The ordinal's containing block is the title, not the row.

It stays out of the flow that stacks the bold lead over its body prose — the row
still reserves the gutter — but it is now carried by whatever moves the title
instead of having to chase it.

---

<!-- _class: inventory compact -->

`inventory · compact`

## compact splits the same way.

- Same anchor, denser rows
  - The offset is not re-tuned per variant.
- The fallback is the old placement
  - A row with no lead has no title.

---

<!-- _class: closing -->

## Measured on the render.

On the portrait split page the ordinal was **199px** below its title (render px,
2x) and dead on the *body's* baseline. It is **2px** off the title now. Every
non-split page renders byte-identical to before.
