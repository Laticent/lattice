---
theme: indaco
pagination: true
header: "Lattice · the slot contract"
---

<!-- @meta{layout=title, class=silent} -->

# The manifest is now the contract lint checks

`Fix · slot contract`

Each layout says what you write for it, and `lint:deck` holds every slide to that.

---

<!-- @meta{layout=quote, footer=quote · only the paragraph right after the quote is the credit} -->


> A quotation earns the whole slide, or it does not belong on one.

— the quote layout, stating its own rule

A second paragraph used to print as a second credit, in tracked capitals. It reads as body text now.

---

<!-- @meta{layout=cards-grid, footer="cards-grid · `##` builds the heading; `#` used to drop it silently"} -->


## A `##` heading builds the layout's title.

- Required slots
  - A missing heading, list or table is an error.
- Heading level
  - `#` where a layout reads `##` is an error.
- List marker
  - A layout that reads only `1.` or only `-` says so.

---

<!-- @meta{layout=stats, footer="stats · the tiles come from a `1.` list; a `-` list collapses them"} -->


## Tiles come from a numbered list.

1. 67
   - layouts whose deleted heading lint used to pass
2. 0
   - still pass with no finding
3. 471
   - manifest samples that meet their own contract

---

<!-- @meta{layout=list, class=takeaway, footer=list · each word that does nothing as written warns} -->


## A variant that does nothing as written says so.

1. On cards and lists, `numbered` is a `1.` list, never a class
1. A `-` list under `takeaway` has no counter: the marker decides
1. Letters, roman numerals and dots need `principles`

---

<!-- @meta{layout=closing} -->

# Lint-clean now means the layout gets what it reads.

`engineering/decisions/2026-11-19-deterministic-authoring-audit.md · W1`
