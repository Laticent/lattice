---
marp: true
theme: indaco
paginate: true
header: "Lattice · divider"
---

<!-- _class: title silent -->

# divider

`Anchor · Divider · Prose`

Section boundary slide. A single heading on the theme's accent, dimmed in dark.

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

<!-- _class: divider subsection -->
<!-- _footer: "subsection · divider subsection — A finer, sentence-length break: centered, a tier smaller, no rail." -->

`divider subsection`

## A subsection divider marks a finer turn with a full-sentence waypoint.


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
  - If the next few slides aren't one unit, use the `subsection` variant. Keep the default divider for real section starts.
- Header or footer overrides
  - Don't blank them with `_header: ''` or `_footer: ''`. A divider keeps the deck's header and footer; drop one with `no-header` / `no-footer`, or all with `silent`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `title` — opens the deck — a bookend that follows the color mode too
- `closing` — closes the deck — completes the bookend trio
