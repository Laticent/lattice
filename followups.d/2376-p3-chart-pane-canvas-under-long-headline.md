---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart pane's canvas misses its box by up to 20% when a headline wraps differently than estimated

why now   — `paneGeometry` (lib/engine/index.js) sizes each pane from `stageBox`, which counts a
            wrapped headline's lines from its character count (`cplTitle`). MEASURED on
            2026-09-27 (PR #2420), in real Chromium on exported HTML:
            - the shape FAMILY is never wrong: 86 panes (examples/panes.md at 16:9/1:1/4:5/9:16,
              plus a stress deck of 3 masthead variants x insight x 6 side and stack layouts),
              nine themes, 0 panes whose stamped `data-family` differs from `familyFor` of its
              laid-out box. The runtime re-stamp this file used to ask for would change nothing;
            - the SIZE is: with a 128-character headline the bar chart's viewBox aspect is 14-20%
              wider than its pane (every other variant is within 2%), so the chart draws ~15%
              shorter than its pane and the slide keeps unused room at the bottom;
            - no constant fixes it. Over 92 headlines in five wordings (plain, all caps, short
              words, long words, W/M-heavy), one-line headlines reach 76 characters and two-line
              ones start at 57. The current 55.8 characters per line is near the balance (13 too
              many lines, 5 too few); 50-66 all leave 14-28 errors. The error is the same on all
              nine themes tried.
where     — lib/engine/index.js (`stageBox`, `paneGeometry`, `paneView`); the fix has to measure
            the headline in the browser, so it lives in lib/runtime/ and needs the chart kernels
            (lib/components/chart/**) there to re-lay out a chart for its real box.
done when — a chart pane under a long headline draws for its laid-out box (viewBox aspect within
            ~3% of the pane's, as every short-headline variant already is), in the export and
            the Studio preview, with the PDF still byte-reproducible.
evidence  — the stress probe (viewBox aspect vs pane box) before and after; the CLI PDF of a long-
            headline chart pane via SendUserFile.
verify    — tier 1 checker, and put the design to the owner first: shipping the chart kernels in
            every export's runtime is a bundle-size and determinism decision, not a bug fix.
