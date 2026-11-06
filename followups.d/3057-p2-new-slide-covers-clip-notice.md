---
origin: 3057
priority: P2
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-plugin-patterns.md §9
deferred: off-path — a Studio layout defect found by the sandbox e2e triage on PR #3057, red on main (8a755f69) as well; the fix is a layout change owed screenshots at three widths, and PR #3057 touches no Studio chrome
source: https://github.com/Laticent/lattice/pull/3057
---

# The New slide button covers the clip notice's "Use Huddle" button

why now   — docs/e2e/venue-fixed-size.spec.ts:104 fails: at 1440×900 Playwright reports the floating "New slide" button
            "intercepts pointer events" over the clip notice's "Use Huddle" button, and the screenshot shows the overlap, so
            a person cannot press it either.
where     — docs/src/components/studio/StudioShell.tsx (the button, `bottom-[calc(100%+16px)]` above the slide strip) and
            the `ClipNotice`, which renders in the same band.
done when — the notice's buttons are reachable at 1440, 820 and 390 px with the New slide button present, and
            venue-fixed-size.spec.ts:104 passes.
evidence  — tools/screenshot.js at the three widths, before and after; the spec's pass line.
verify    — tier 1, self-review with the gates and the three screenshots.
