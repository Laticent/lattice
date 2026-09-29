---
origin: 2419
priority: P3
recorded: 2026-09-27
updated: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2419
---

# authority-chain: four tiers with gloss lines do not fit at `venue: hall`.

The laptop half of this finding is fixed (PR #2493): the citation line takes its own line
box and each row pads by --sp-sm, so the gloss clears the bottom border by the same inset as
the top (measured 17px each way at laptop). What remains is capacity at a large venue.

```text
  P3 · [no ticket] authority-chain at hall: rows overlap and the slide clips.
       why now   — at `venue: hall` the type is 1.5x, and four tiers with a citation and a
                   gloss line each need more than the frame: the export reports gallery
                   slide 2 as overflowing ("Content clipped"), and because the rows are
                   `flex:1; min-height:0` they compress and the text spills into the next
                   card rather than the chain clipping at its tail.
       where     — lib/components/legal/authority-chain/authority-chain.styles.css (row
                   min-height); the manifest's capacity (soft 5, hard 6) is set at laptop.
       done when — at hall a four-tier chain either fits, splits, or clips at its tail
                   with no card overlapping the next; capacity says what hall holds.
       evidence  — hall render of authority-chain.gallery.md slide 2, before and after.
       verify    — rendered on 2026-09-29 (PR #2493 session): the export's overflow
                   warning names 7 of the gallery's 12 slides at hall.
```
