---
origin: 2325
priority: P3
recorded: 2026-09-24
---

# heatmap.gallery.md clips content on pages 3 and 4, and the corpus baseline says clean

why now   — `node tools/check-overflow-corpus.js` fails on it on main as of 2026-09-24
            (CONTENT CLIPPED p3, p4, "baseline: clean"); found while verifying #2325, which
            produces identical output
where     — lib/components/chart/heatmap/heatmap.gallery.md, the heatmap layout, and the
            corpus baseline (24 decks entered the corpus since it was blessed)
done when — the gallery fits, or the clip is judged deliberate and re-blessed with a reason
evidence  — check-overflow-corpus output before and after
verify    — tier 0 gates plus the visual review path
