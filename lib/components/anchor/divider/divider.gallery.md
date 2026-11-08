---
marp: true
theme: indaco
paginate: true
header: "Lattice · divider"
---

<!-- _class: title silent -->

# divider

`Anchor · Divider · Prose`

Section boundary slide. Dark canvas with a single heading.

---

<!-- _class: divider silent -->
<!-- _footer: "Default · divider" -->

`divider · Section 03`

## A divider gives the deck a place to breathe.


---

<!-- _class: divider silent numbered -->
<!-- _footer: "numbered · divider numbered — Masthead — the running section number over a hairline, top-left." -->

`divider numbered`

## The stamp counts this divider for you.


---

<!-- _class: divider light -->
<!-- _footer: "light · divider light — Bright canvas, sentence-length waypoint." -->

`divider light`

## The light divider trades the dark canvas for a bright, full-sentence waypoint.


---

<!-- _class: divider qr -->
<!-- _footer: "qr · divider qr — The payload bullet becomes a code." -->

`divider qr`

## The payload bullet becomes a scannable code.

- https://laticent.io/components/divider
- Scan for the divider's docs `caption`


---

<!-- _class: cards-grid three claim-hero -->
<!-- _footer: "Anti-patterns · divider" -->

## When NOT to reach for divider.

- More than five per deck
  - Each divider is a hard context switch. Too many dilutes the signal and slows the audience. Group related content under fewer sections instead.
- Section title that doesn't earn a section
  - If the next 3-4 slides aren't a coherent unit, the `light` variant (bright canvas, centered) is the right tool. Reserve the dark divider for genuine section starts.
- Header or footer overrides
  - Don't blank the header or footer with `_header: ''` / `_footer: ''` on a divider. A divider keeps the deck's running header and its footer, the standing note (a "Confidential", a copyright), by the anchor-chrome rule (engineering/decisions/2026-11-08-anchor-chrome.md). Drop one on purpose with `no-header` / `no-footer`, or every band with `silent`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `title` — opens the deck — same dark-bookend chrome
- `closing` — closes the deck — completes the bookend trio
