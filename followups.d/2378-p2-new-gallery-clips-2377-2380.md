---
origin: 2378
priority: P2
recorded: 2026-09-25
---

# Two galleries clip on main after #2377 and #2380, and the overflow baseline now records them

why now   — found by the full `check-overflow-corpus --bless` run in the fit-register PR, not caused by it: `heatmap.gallery.md` pages 3–4 report "⚠ CONTENT CLIPPED" (content lost inside a clipping box) and `list.gallery.md` page 9 reports "⚠ OVERFLOW", on `origin/main` at 73172f3 with no change applied. The ratchet now carries them, so they will not grow silently — but a gallery page that clips is a defect in a shipped specimen.
where     — lib/components/chart/heatmap/ (heatmap.gallery.md p3–4; #2377 changed chart hover/tap targets) and lib/components/inventory/list/ (list.gallery.md p9; #2380 re-laid out list rows).
done when — both galleries render with no OVERFLOW and no CONTENT CLIPPED line, and `node tools/check-overflow-corpus.js --bless` lowers the baseline by those 3 pages.
evidence  — the emulator's own OVERFLOW / CONTENT CLIPPED lines for both galleries, before and after; the rasterized pages via SendUserFile.
verify    — tier 0 gates, plus a look at the pages; tier 1 checker if the fix touches shared chart CSS.
