---
origin: 3096
priority: P5
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-09-steps-as-a-behavior.md
deferred: large — two PRs (contract + cursor, then the page-per-step export); the design is accepted (S1-S4 decided 2026-11-09)
source: https://github.com/Laticent/lattice/pull/3096#issuecomment-6730760918
---

# `_focusSteps` becomes a behavior: one slide, steps walked live, one frame in print

why now   — the parser copies a `_focusSteps` slide once per step (lib/integrations/markdown-it/plugins.js
            `focusSteps`), so every surface gets N slides for one source slide. A 3-slide source with one three-step
            table renders 5 sections and 5 PDF pages. Every reader of slide position pays for it: the #1387
            off-by-one, guards in narration, the preview, the render cache, the slice check and the Marp export, and
            now four section counts (divider marker, numeral, rail, topic eyebrow) that read a focus-step divider as
            three sections. `_build` has the right model (one slide, steps stamped, CSS keyed on a `data-build-at` the
            player sets) but only that half shipped: nothing sets `data-build-at`, so no surface walks its steps yet.
            Issue #380 tracks the walker and the page-per-step PDF; both features need the same two pieces. Issue
            #1765 asks for one Studio control for `_focus`, `_focusStyle`, `_focusSteps` and `_build`.
where     — engineering/decisions/2026-11-09-steps-as-a-behavior.md (accepted, S1-S4 decided), then
            plugins.js (stop copying), lib/transformers/focus.js and lib/base/base.focus.css (steps as state on one
            slide), Present's step walker, the PDF/PPTX export (one frame; page-per-step as an opt-in), and the
            guards the copies made necessary.
done when — a `_focusSteps` slide is one slide in the HTML, the Studio and Present; Present walks the steps by moving
            `.lat-focus`; PDF and PPTX show one frame by default and one page per step only when asked; the
            focus-step divider fixture renders 1/2 and 2/2 with matching numeral, rail and eyebrow without any change
            to those four counts.
evidence  — the dynamic-components note §Dynamic behaviors; the focus-divider fixture in the #3096 measurement comment;
            a 3-slide demo deck rendered to 5 PDF pages (2026-11-09).
verify    — before and after PDFs of examples/focus.md in dark and light mode, sent to the owner for sign-off (an
            export-bytes change); Present driven on the real player; the agreement-test fixture passes.
