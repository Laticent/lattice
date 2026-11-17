---
origin: 3292
priority: P3
recorded: 2026-11-17
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
deferred: off-path — PR 3292 fixes the test that raced this; the render order of a plugin's approval belongs to the code-package door (docs/src/lib/code-packages/door.ts, StudioShell.tsx), which that PR does not touch
---

# Find out whether approving a plugin paints its slots one render before its stylesheet

why now   — `plugin-slots.spec.ts:67` once read the badge transparent in CI (run 44098310773, attempt 1) while the
            failure screenshot, a moment later, showed it filled. If the text really paints first, a person who clicks
            Approve sees the plugin's markup unstyled for one render. Not reproduced locally: 24 of 24 runs, 12 of them
            at 6x CPU throttle, read the fill on the first try.
where     — suspected: a preview render already in flight when Approve is clicked reads the approval live in the door
            (`isPluginApproved`, door.ts) but still carries the old extra-CSS stamp (`codePackagesStamp`), which has no
            sheet until `onApproved` sets the new one (StudioShell.tsx `onCodeApproved`).
done when — either a probe shows the badge's fill set on the first paint of its text across a throttled CI-like run
            (then delete this file), or the in-flight render is dropped or re-stamped on approval so the markup and
            its sheet always paint together.
verify    — log, for each render, whether the frame's `.lp-status-card-badge` text and fill are both present, while
            clicking Approve as early as the notice appears; repeat under `--workers=4`.
