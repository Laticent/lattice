---
marp: true
theme: indaco
paginate: true
header: "Lattice · frame chrome"
footer: "Feature deck"
finish: atrium
logo: ../lib/base/_logo/acme-logo.svg
logo-on: title
logo-x: 50
logo-y: 82
---

<!-- _class: title finish-none -->
<!-- _header: '' -->
<!-- _paginate: false -->

# Chrome belongs to the frame

`Finish · Logo · Notes`

A finish no longer drags the running chrome into the content flow.

---

<!-- _class: content -->

## Every slide here carries a finish, a header, a footer and page numbers.

The header sits at the frame's top-left berth, the footer at its bottom-left, both on the
finish's own backdrop. Neither is in flow, so neither costs the stage a pixel.

---

<!-- _class: content -->

## The stacking rule wanted a z-index, and took the flow with it.

- The intent
  - A finish paints its backdrop behind the slide, so content above it needs a stacking order.
- The cost
  - On a child that positions itself, `top` stops meaning "inset from the frame" and starts meaning "offset from where I landed in flow".

---

<!-- _class: content -->

## Measured, before the fix.

| Chrome | Declared | Rendered |
|---|---|---|
| running header | 28px / 30px berth | 116px / 94px, on 11 of 15 slides |
| deck logo, x | `logo-x: 50` | 92.2% |
| deck logo, y | `logo-y: 82` | 84 / 87.1 / 88 / 100% |

A y that drifts per slide is the tell: an absolute placement cannot depend on the copy above it.

---

<!-- _class: content -->

## A trailing paragraph is promoted to a note.

- A note is a footnote
  - A short paragraph after a list or a table gets a hairline rule and muted ink.
- A conclusion is not
  - "A list, then a concluding sentence" is ordinary prose, and promotion changes what it meant.

This paragraph follows a list, so it renders as a below-note.

---

<!-- _class: content no-note -->

## The same slide, with `no-note`.

- A note is a footnote
  - A short paragraph after a list or a table gets a hairline rule and muted ink.
- A conclusion is not
  - "A list, then a concluding sentence" is ordinary prose, and promotion changes what it meant.

This paragraph follows the same list, and stays body copy.

---

<!-- _class: closing finish-none -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Where The Fix Lives`

## The rule that was wrong is the rule that changed.

`Position is withheld from frame chrome, and a gate holds it there.`
