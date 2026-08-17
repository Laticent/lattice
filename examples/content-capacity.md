---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · content-capacity contract"
footer: "Pick the layout by content shape"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Count first, then choose.

`Content-capacity contract`

*Every layout declares how many elements it holds — so you pick by content shape, and the linter warns before an overflow.*

---

<!-- _class: cards-grid -->

## The slip that causes overflow.

- Pick by intent only
  - The agent matches the topic to a layout's tags and skeleton, never counting how many elements the content actually has.
- Pour in too much
  - Eight items land in a grid built for three or four; the slide silently overflows its frame.
- Catch it too late
  - The red overflow ring only shows up at render — long after the layout was chosen.

---

<!-- _class: cards-grid -->

## A grid at its sweet spot.

- Confidence
  - How sure are we the signal is real? Scored one to five each week.
- Recency
  - How fresh is the signal? Decays as the data ages.
- Relevance
  - How much does it move the strategy? Weighted by the team.

---

<!-- _class: list-tabular -->

## Too many? Escalate, don't cram.

1. Confidence — is the signal real?
   - Scored one to five every week.
2. Recency — how fresh is it?
   - Decays as the data ages.
3. Relevance — does it move strategy?
   - Weighted by the team and reviewed quarterly.
4. Coverage — how complete is intake?
   - Tracked against the source checklist.
5. Cost — what did it take to collect?
   - Logged for the calibration loop.

---

<!-- _class: stats -->

## The contract, in four numbers.

1. axis
   - the collection that crowds — item, row, col, cell or line.
2. sweet
   - the ideal count, surfaced to the author.
3. soft
   - past here it crowds — a soft warning fires.
4. hard
   - past here it overflows — the loud warning fires.

---

<!-- _class: code -->

## The warning reads like a fix.

```text
⚠ deck.md · slide 4 · capacity-overflow [cards-grid]
   'cards-grid' holds about 3 items comfortably (max ~5);
   this slide has 8 — it will overflow
   fix: Switch to list-tabular, or split across slides.
```

---

<!-- _class: list-steps -->

## The author's loop.

1. Count
   - How many items, rows, columns, or code lines does the content have?
2. Check
   - Read the component's capacity in components.pick.md — sweet/soft/hard.
3. Choose
   - Within capacity, keep it; over hard, take an escalateTo target or split.

---

<!-- _class: quote -->

> Pick the layout by shape, not by vibe — the number of elements decides it as much as the topic does.

— The content-capacity contract
