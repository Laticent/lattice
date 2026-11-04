---
marp: true
theme: indaco
paginate: true
header: "Deck settings · one rule everywhere"
footer: "Lattice · switches"
class: no-progress no-footer
---

<!-- _class: title -->

# One deck class, every slide

`Fix · deck-wide class`

This deck says `class: no-progress no-footer` once, in its front matter.

---

<!-- _class: divider -->

`Section 01`

## The deck turns the rail and the footer off

---

`No class of its own`

## A plain slide follows the deck

The front matter turned the section rail and the running footer off, so this slide shows neither.

_A deck class reaches every slide that names no class of its own._

---

<!-- _class: cards-grid -->

`Its own _class`

## A slide with its own class follows it too

- Before
  - Marp let a slide's `_class` drop the deck class, bringing the rail back.
- Now
  - The slide's classes add to the deck's, so the rail stays off here too.

---

<!-- _class: content with-progress with-footer -->

`with-progress · with-footer`

## One slide can turn them back on

This slide adds `with-progress with-footer` to its own class. The section dots and the footer return.

_A slide's `with-X` wins over the deck's `no-X`, for every switch._

---

<!-- _class: content silent with-pagination -->

`silent with-pagination`

## A clean slide can keep one band

`silent` hides the header, footer, page number and rail together. This slide brings back only its page number.

---

`One spelling`

## Every switch reads the same way

| Switch | Off | Back on |
|---|---|---|
| Section rail | `no-progress` | `with-progress` |
| Running footer | `no-footer` | `with-footer` |
| Page number | `no-pagination` | `with-pagination` |
| Callouts | `no-callout` | `with-callout` |
| Motion | `no-motion` | `with-motion` |

_The old `callout-off`, `motion-on` and `finish-none` spellings are retired; `lint:deck` rewrites them._

---

<!-- _class: divider -->

`Section 02`

## The same rule in an exported Marp bundle

---

`Export to Marp`

## The bundle keeps its settings in one block

```markdown
---
marp: true
theme: indaco
---
<script type="application/lattice-settings">
class: no-progress no-footer
</script>
```

_Edit that block and marp-cli, the VS Code preview and VS Code's Export command all follow it._

---

<!-- _class: closing -->

## One class, every slide

`Fix · deck-wide class`

Turn a switch back on for one slide with `with-X`.
