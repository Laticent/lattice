---
origin: 2361
priority: P2
recorded: 2026-09-27
---

# At `venue: hall` the label lift is never stepped down, so six talk slides clip at every size

why now   — found testing the agentic-practices talk on PR #2399. At `venue: hall` the deck settles
            at 1x, but pages 4, 6, 27, 45, 47 and 57 (all `compare-prose vertical` with an insight
            callout) "clip at every size". The cause, measured: `--venue-meta-lift` (1.3 at hall,
            1.15 at conference) scales the label role on top of `--fs-scale`, and STEP / LEVEL
            (lib/core/scale-fit.js) lower only `--fs-scale`. Rendered alone at hall, those six clip;
            with the lift forced to 1 they fit at 1x. So a hall deck can clip slides that fit at
            laptop. Came in with #2390 (the lift and LEVEL), not #2399.
where     — lib/core/scale-fit.js (STEP / LEVEL), lib/base/base.modifiers.css (the venue rules),
            engineering/typography.md §7 "Venue", the decision note's lift rationale.
how       — the owner ruled on PR #2399 (2026-09-27): (c) keep the lift and let lint warn. Hall
            labels stay large for legibility; the author trims. So: teach `capacity-scale` (or a
            sibling rule in lib/authoring/lint-core.js) that at `venue: hall` / `conference` a slide
            carrying lifted labels (insight callout, compare-prose vertical) needs room for the lift,
            and name the slide with a fix line. Calibrate the threshold on the talk's six pages and
            the 70 galleries at hall. Options (a) step down with the rung and (b) scale in proportion
            were declined.
done when — `lint:deck` at `venue: hall` warns on each of the talk's six clipping pages (4, 6, 27,
            45, 47, 57) with a fix line, and warns on no slide that fits at hall.
evidence  — the talk rendered at hall before/after; the 6-slide deck with and without the lift.
verify    — tier 1 checker: engine kernel.
