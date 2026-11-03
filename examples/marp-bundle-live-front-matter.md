---
marp: true
theme: indaco
paginate: true
header: "Deck settings · one rule everywhere"
class: no-progress
---

<!-- _class: title -->

# One deck class, every slide

`Fix · deck-wide class`

This deck says `class: no-progress` once, in its front matter.

---

<!-- _class: divider -->

`Section 01`

## The deck turns the rail off

---

`No class of its own`

## A plain slide follows the deck

The front matter turned the section rail off, so this slide shows no dots in its footer band.

_A deck class reaches every slide that names no class of its own._

---

<!-- _class: cards-grid -->

`Its own _class`

## A slide with its own class follows it too

- Before
  - Marp let a slide's `_class` drop the deck class, bringing the rail back.
- Now
  - The slide's classes add to the deck's. The rail stays off, as on every other slide.

---

<!-- _class: content with-progress -->

`with-progress`

## One slide can turn the rail back on

This slide adds `with-progress` to its own class. The section dots return in its footer band.

_A slide overrides the deck with an explicit token, the way `with-pagination` brings back a page number._

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
class: no-progress
</script>
```

_Edit that block and marp-cli, the VS Code preview and VS Code's Export command all follow it._

---

<!-- _class: closing -->

## One class, every slide

`Fix · deck-wide class`

Override it on a slide with an explicit token.
