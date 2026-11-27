---
marp: true
theme: indaco
pagination: true
header: "Lattice · closing"
---

<!-- @meta{layout=title, class=silent} -->

# closing

`Anchor · Bookend · Prose`

Final slide. The mirror of title, in the same color mode.

---

<!-- @meta{layout=closing, class=silent, footer=Default · closing} -->

## The closing mirrors the title, with one last claim.

`anchor · closing`


---

<!-- @meta{layout=closing, class=qr, footer="qr · closing qr — Scan to take the deck with you."} -->

`closing qr`

## Leave a scannable takeaway behind.

The payload bullet renders as a QR code sized for the back row.

- https://laticent.io/components/closing
- Scan to open `caption`


---

<!-- @meta{layout=closing, class=silent index, footer="index · closing index — Ends on a reference list — see also, next steps."} -->

## Where to go next.

`Next steps`

- `docs` — the component catalog and authoring contracts
- `gallery` — every layout rendered in light and dark
- `studio` — compose and preview a deck in the browser


---

<!-- @meta{layout=closing, class=silent spectrum, footer="spectrum · closing spectrum — Mirrors title's generated gradient bar — the deck's color story, one last time."} -->

## The closing echoes the same six-step spectrum.

`Closing · spectrum`


---

<!-- @meta{layout=closing, class=silent cover-masthead, footer="cover-masthead · closing cover-masthead — A heavy rule over the title, set left."} -->

## The back cover composes as a masthead.

`anchor · closing · cover-masthead`


---

<!-- @meta{layout=closing, class=silent cover-ledger, footer="cover-ledger · closing cover-ledger — A small-caps title over a double rule."} -->

## The back cover composes as a ledger.

`anchor · closing · cover-ledger`


---

<!-- @meta{layout=closing, class=silent cover-column, footer="cover-column · closing cover-column — An accent column at the right edge, the title set left."} -->

## The back cover composes as a column.

`anchor · closing · cover-column`


---

<!-- @meta{layout=closing, class=silent cover-label, footer="cover-label · closing cover-label — A gallery wall label: a smaller title low on the left under a hairline."} -->

## The back cover composes as a label.

`anchor · closing · cover-label`


---

<!-- @meta{layout=closing, class=silent cover-stage, footer="cover-stage · closing cover-stage — A stage-size centered title."} -->

## Thank you.

`anchor · closing · cover-stage`


---

<!-- @meta{layout=closing, class=silent cover-frame, footer="cover-frame · closing cover-frame — The title boxed in a keyline."} -->

## The back cover composes as a frame.

`anchor · closing · cover-frame`


---

<!-- @meta{layout=closing, class=silent cover-poster, footer="cover-poster · closing cover-poster — A giant title set left."} -->

## Make it yours.

`anchor · closing · cover-poster`


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · closing} -->

## When NOT to reach for closing.

- Multi-line heading
  - Keep the closing line to one editorial sentence. The layout is centered and large — two-line closings get cramped and lose impact.
- Header or footer overrides
  - Don't blank the footer with `_footer: ''` on the closing: it is the deck's standing note (a "Confidential", a copyright), and the last slide is often the one left on screen. Drop it on purpose with `no-footer`, or every band with `silent`.
- Mid-deck closing
  - If the audience needs a strong statement mid-deck, use `big-number` or `content` with the `dark` modifier. Reserving closing for the final slide preserves its bookend role.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `title` — opens the deck — the same cover, in the same mode
- `divider` — mid-deck section breaks — the bookend on the accent field
- `big-number` — single emphatic statement mid-deck without the bookend signal
