---
origin: 3131
priority: P3
recorded: 2026-11-12
area: chart
severity: low
swimlane: lib/plugins/chart-family/kinds/piechart/piechart.transform.js
deferred: off-path — main double-escapes the same name; #3131 did not cause it or change it
source: https://github.com/Laticent/lattice/pull/3131
---

# A pie key prints "R&amp;D" for "R&D"

why now   — the trio's checker on #3131 (2026-11-12): a pie entry named `R&D` prints `R&amp;D` in its key on a
            square, mobile and 16:9 page, and `main` renders the same (`R&amp;amp;D` twice in the HTML on both).
where     — the pie transform's key labels (lib/plugins/chart-family/kinds/piechart), where an already-escaped label is
            escaped again.
done when — `R&D`, `A < B` and `"quoted"` print as typed in a pie key at every page shape, pinned by a unit test.
