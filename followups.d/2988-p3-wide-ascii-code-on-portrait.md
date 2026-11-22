---
origin: 2988
priority: P3
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §25
deferred: blocked — owner, 2026-11-22: "that's an edge case we can't do anything about. log it and move on." Code keeps one type step down and cannot wrap without changing what it says, and the owner ruled out shrinking type, so no layout fixes a block wider than a portrait page.
source: https://github.com/Laticent/lattice/pull/2988
---

# A wide ASCII-art code block wraps on a portrait phone and loses its columns

why now   — `system-design-foundations.md` 173 (two tables of keys set side by side as `text`) and 225 (a fill-in
            form of underscores) clip at portrait: each line is wider than the page, so the code wraps, the
            columns the author aligned by hand fall apart, and the verify loop rejects every page it tries.
            The full portrait sweep of 2026-11-17 lists only these two slides for this cause.
where     — lib/plugins/code/code.styles.css (the phone wrap), lib/core/fit-measure.js `readable` (rejects the
            wrapped pages); examples/system-design-foundations.md 173 and 225
done when — the owner picks a treatment for code wider than its page on a phone (a horizontal scroller in
            the live player only, a "wide code" marker that keeps laptop width and scales, or authoring
            guidance), or decides the author should restructure such a block
evidence  — the 2026-11-17 portrait sweep (.scratch/xdiff-p.log): system-design-foundations.md :: 173,225;
            the same two slides on the 11-13 sweep
verify    — `node lattice.js examples/system-design-foundations.md out.pdf --size portrait` prints no
            OVERFLOW for pages 173 and 225
