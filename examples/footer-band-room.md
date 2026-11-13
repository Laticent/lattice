---
marp: true
theme: indaco
paginate: true
header: "Lattice · Footer band"
footer: "Acme · Q3 board review"
progress-rail: on
---

<!-- _class: title -->

# The footer keeps its room

`Lattice · Fix · footer band`

A slide without a section rail gives the rail's space back to the footer's words.

---

<!-- _class: divider -->

## Slides without a rail

---

<!-- _class: no-progress -->
<!-- _footer: "Was: the band kept a gap for an empty rail column, so a footer this long ended in an ellipsis. Now it all reads." -->

## The footer reads to the end

- This slide hides its rail with `no-progress`, so the rail's column is empty
- An empty column now costs the footer nothing: each mark carries its own lead
- Before the fix, the footer lost 72px here and this line ended in "…"

---

<!-- _class: no-progress -->
<!-- _footer: "A long footer on a slide with no rail now runs to the page number's column" -->

## Ten example decks print their footers in full again

- The overflow nightly flagged ten decks whose footers ended in "…" after #3095
- Every one was clean on the commit before #3095, and every one is clean again
- Portrait decks lost the most: the band's gap there is 48px, and three of them stacked

---

<!-- _class: divider -->

## Slides with a rail

---

## The rail still holds still

- With a rail, the page column is one width on every slide: six characters plus the number's lead
- The rail ends where that column starts, so it sits on the same line on slide 9 and slide 10
- The divider's marker ends on that line too, so the mark it teaches does not move

---

## Each mark pays only for itself

- The split counter, the rail and the page number each carry their own lead
- A mark that is not on the slide takes no space in the band
- The footer's words take what is left, and only a footer longer than that ends in "…"

---

<!-- _class: closing -->

## Room for the words, a fixed rail

The footer gets the band's free room, and the rail keeps its place.
