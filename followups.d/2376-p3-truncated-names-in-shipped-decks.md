---
origin: 2376
priority: P3
recorded: 2026-09-28
area: chart
severity: medium
swimlane: lib/components/chart/waterfall/waterfall.docs.md
source: https://github.com/Laticent/lattice/pull/2376
---

# two shipped decks print a chart name cut short, and the export now says so

why now   — the panes-chart-labels PR made a name painted cut short report as `truncate` on the
            `⚠ CHART LABELS DROPPED` line. Across 1,716 chart renders of the shipped corpus it names
            three decks. One is by design (heatmap.gallery.md's stress slide tests that a long row
            name ellipsizes rather than being culled). Two are not: waterfall.gallery.md prints
            "Receip…", "Tax settl…" and "Facility…" under a nine-step walk, and
            examples/mobile-landscape.md prints "Contract…" under its waterfall. Both are visible in
            the committed PDFs. Pre-existing; this PR only made them reportable.
where     — the two decks' waterfall slides (shorter step names, fewer steps), or waterfall's
            category band (lib/components/chart/waterfall/waterfall.transform.js
            fitCategoryLabels), which gives each step two lines of about 12 characters.
done when — neither deck's export prints a CHART LABELS DROPPED line, and each slide still makes
            its point.
evidence  — the two slides before/after.
verify    — tier 0: a deck edit; tier 1 checker if the waterfall kernel changes.
