---
origin: 2376
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2376
---

# a map sets its region names across its own key

why now   — the new `⚠ CHART LABELS OVERPRINT` line fires on one shipped deck, and rightly:
            `examples/global-south.md` pages 3–6 and 8 print the map's region names ("Africa",
            "Caribbean / Central America", "Pacific") straight across the key's entries
            ("Global South — Africa"), whose names wrap to two lines beside the map. Visible in
            the committed PDF (page 4). Pre-existing: this PR only made it reportable.
where     — lib/components/chart/map/map.transform.js (where a region's name is placed, and
            whether it avoids the key's rail); the key's wrap in svg-legend.js.
done when — `node lattice-emulator.js examples/global-south.md out.pdf` prints no CHART LABELS
            OVERPRINT line, and page 4 reads cleanly.
evidence  — the page-4 render before/after.
verify    — tier 1 checker: the map kernel draws every map slide.
