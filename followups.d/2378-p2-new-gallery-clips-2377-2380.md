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

rechecked — 2026-09-26, on origin/main 283f47a (#2389) plus PR #2390, which does not touch either
            component or anything at scale 1: STILL OPEN, unchanged. `heatmap.gallery.md` reports
            "⚠ CONTENT CLIPPED — pages 3, 4" and `list.gallery.md` "⚠ OVERFLOW — page 9". What is cut:
            list p9 is the "eight lines at the hard ceiling" stress slide and shows 5 of its 8 lines;
            heatmap p4 truncates its first row label ("January 2026…"). The list page is the same
            question as `2378-p3-capacity-hard-above-measured.md`: the rig measures `list` at 3 at
            `wide` and the manifest declares hard 6, so the gallery's "hard ceiling" of 8 is past both.
