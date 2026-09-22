---
marp: true
theme: indaco
color-mode: print
finish: atrium
paginate: true
header: "Finish canvas · print face"
---

<!-- _class: title -->

`Engine · base.finish.css`

# The finish follows the panel, not the page

A frame that restates its canvas above the register keeps it — and the finish has to composite against what the slide really paints.

---

<!-- _class: divider -->

`Section 01`

## Where print takes the page.

---

<!-- _class: topic -->

`Section 01 · Print`

## The register wins

Print resets the surface and remaps the consumed tokens, so a plain topic gives up its panel and the finish follows it to the page.

---

<!-- _class: topic fact -->

`Section 01 · Print`

## The third arm

A fact slide keeps its panel when the register takes the page.

`section.topic.fact (0,2,1) beats section.print (0,1,1)`

---

<!-- _class: topic -->

`Section 01 · Print`

## Same section, same track

The track is what makes the difference measurable: a tracked topic is back at the base specificity, a tracked fact slide is not.

---

<!-- _class: closing -->

## Measured on the exported PDF, not the screen — the two faces disagree here.
