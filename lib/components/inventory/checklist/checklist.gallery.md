---
marp: true
theme: indaco
pagination: true
header: "Lattice · checklist"
---

<!-- @meta{layout=title, class=silent} -->

# checklist

`Inventory · Stack · Structure`

Items with state markers — done, partial, failed, unknown, to do, skipped.

---

<!-- _class: checklist -->
<!-- @meta{footer=Default · checklist} -->

## The checklist tracks readiness in six answers.

- [x] Done rows take a solid check
- [-] Half-done rows show the dash
- [!] Failed rows take the red cross
- [?] Unsettled rows ring a question mark
- [ ] Open rows stay an empty ring
- [/] Descoped rows get the slash


---

<!-- _class: checklist -->
<!-- @meta{stress-slide} -->
<!-- @meta{footer="Stress test · checklist — Nine rows, all six answers — the ceiling."} -->

## Nine rows is where the checklist overflows.

- [x] The first rows land while attention is fresh
- [x] Sixteen words is the budget a stress row may spend
- [x] Three checks in a row read as momentum
- [-] A dash admits the honest middle state
- [!] A red cross marks the check that failed
- [?] A ringed question admits what is unknown
- [ ] Late rows stay short; the audience is counting now
- [/] The slash records what was cut, visibly
- [x] Nine is the last row this layout seats


---

<!-- @meta{layout=checklist, class=dark, footer=Composition: dark · checklist dark} -->

## The checklist tracks readiness in six answers.

- [x] Done rows take a solid check
- [-] Half-done rows show the dash
- [!] Failed rows take the red cross
- [?] Unsettled rows ring a question mark
- [ ] Open rows stay an empty ring
- [/] Descoped rows get the slash


---

<!-- @meta{layout=checklist, class=compact, footer=Composition: compact · checklist compact} -->

## The checklist tracks readiness in six answers.

- [x] Done rows take a solid check
- [-] Half-done rows show the dash
- [!] Failed rows take the red cross
- [?] Unsettled rows ring a question mark
- [ ] Open rows stay an empty ring
- [/] Descoped rows get the slash


---

<!-- @meta{layout=checklist, class=accent, footer=Composition: accent · checklist accent} -->

## The checklist tracks readiness in six answers.

- [x] Done rows take a solid check
- [-] Half-done rows show the dash
- [!] Failed rows take the red cross
- [?] Unsettled rows ring a question mark
- [ ] Open rows stay an empty ring
- [/] Descoped rows get the slash


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · checklist} -->

## When NOT to reach for checklist.

- All-done lists
  - If every item is `\[x]` the state markers are decoration. Use `list` (or its `takeaway` variant) for celebratory recaps; checklist earns its weight when the mix matters.
- Long per-item prose
  - Each item is one short line. If a row needs a sentence of explanation, the right home is cards-stack or list-tabular.
- Custom state markers
  - Only the six markers — `\[x]` `\[-]` `\[!]` `\[?]` `\[ ]` `\[/]` — map to the mark palette. Anything else in brackets (`[X]`, `[~]`, `[>]`) renders as literal text and breaks the visual contract. `[X]` is the trap: GitHub-flavored markdown reads it as a checked box, and it does not draw a mark here.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `list` — items have no state — just bullets
- `list-tabular` — rows need a label-plus-description structure, not state
- `cards-stack` — each item needs two sentences of body
