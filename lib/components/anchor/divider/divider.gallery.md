---
marp: true
theme: indaco
pagination: true
header: "Lattice · divider"
---

<!-- @meta{layout=title, class=silent} -->

# divider

`Anchor · Divider · Prose`

Section boundary slide. Dark canvas with a single heading.

---

<!-- @meta{layout=divider, class=silent, footer=Default · divider} -->

`divider · Section 03`

## A divider gives the deck a place to breathe.


---

<!-- @meta{layout=divider, class=silent numbered, footer="numbered · divider numbered — Masthead — the running section number over a hairline, top-left."} -->

`divider numbered`

## The stamp counts this divider for you.


---

<!-- @meta{layout=divider, class=light, footer="light · divider light — Bright canvas, sentence-length waypoint."} -->

`divider light`

## The light divider trades the dark canvas for a bright, full-sentence waypoint.


---

<!-- @meta{layout=divider, class=qr, footer="qr · divider qr — The payload bullet becomes a code."} -->

`divider qr`

## The payload bullet becomes a scannable code.

- https://laticent.io/components/divider
- Scan for the divider's docs `caption`


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · divider} -->

## When NOT to reach for divider.

- More than five per deck
  - Each divider is a hard context switch. Too many dilutes the signal and slows the audience. Group related content under fewer sections instead.
- Section title that doesn't earn a section
  - If the next few slides aren't one unit, use the `light` variant. Keep the dark divider for real section starts.
- Header or footer overrides
  - Don't blank them with an empty `header=""` or `footer=""` in the record. A divider keeps the deck's header and footer; drop one with `no-header` / `no-footer`, or all with `silent`.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `title` — opens the deck — same dark-bookend chrome
- `closing` — closes the deck — completes the bookend trio
