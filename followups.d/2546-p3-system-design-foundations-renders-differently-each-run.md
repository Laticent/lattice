---
origin: 2546
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/blob/main/tools/pixel-check.js
---

# examples/system-design-foundations renders different pixels on each run of the same code

why now   — Segno phase 3's byte-identical check (`tools/pixel-check.js`, 56 decks) found 55
            decks pixel-clean and this one changed. Re-rendered on UNCHANGED main against the
            same snapshot, it still differed, on other pages: run 1 pages 113 and 121, run 2 pages
            104, 113, 180 and 196, main pages 113, 120 and 145. Page 113 differs by 3,674 px in all
            three, so the snapshot render was the odd one there. The diff on page 121 sits in a
            callout's label and the bottom-right footer marks, not in a diagram. A deck that renders
            differently each time makes every pixel gate on it noise.
where     — examples/system-design-foundations.md (234 pages); `node tools/pixel-check.js snapshot
            a --decks system-design-foundations` then `diff a` twice on one commit reproduces it.
done when — two renders of one commit are pixel-identical, or the note in engineering/gotchas/
            names the source of the variance and why it cannot be pinned.
evidence  — two clean `pixel-check diff` runs on one commit.
verify    — tier 0: a measurement.
