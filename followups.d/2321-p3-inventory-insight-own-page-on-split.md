---
origin: 2321
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2321
---

# Give a claimed inventory insight its own closing page on a split run

why now   — #2321 shows a split inventory's insight once, on the last body page, but that page's row rises by half the insight's height (about 18px at 22 dpi on a portrait render with a two-line insight), a visible jump on the final page turn.
where     — `lib/core/split-envelope.js` `beatShapesFor`: a claimed blockquote (`coda.claims: ["blockquote"]`) is read as anatomy and repeated as `post`; inventory hides all but the last copy in CSS (`inventory.styles.css` split-page rule 1).
done when — a split inventory run ends on a page of its own carrying the insight in the look's own styling, and every body page seats its row at the same height; `examples/inventory-split-portrait.pdf` shows no row movement across the run.
evidence  — `node lattice-emulator.js examples/inventory-split-portrait.md /tmp/p.pdf` — compare the ledger's row on pages 2.3 and 2.4.
verify    — the same render, plus `test:integration`; check the 29 other components that claim a coda shape do not change placement.
