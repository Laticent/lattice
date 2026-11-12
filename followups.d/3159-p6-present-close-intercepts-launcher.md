---
origin: 3159
priority: P6
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-09-26-studio-panel-lazy-loading.md
deferred: off-path — Present's close transition, a surface #3159 does not touch; it fails the same way on main
source: https://github.com/Laticent/lattice/pull/3159
---

# Under load, a closing Present dialog still takes the next click

why now   — studio-warm-offline.spec.ts's sweep ("every on-demand Studio surface opens offline…") fails 1 in 6 under load
            (3 workers plus the root unit suite) on main and on #3159's branch alike: after Escape closes Present, the
            next click on "Workspace launcher" times out because the Present dialog's subtree "intercepts pointer
            events". The dialog carries `pointer-events-none`, so something inside it still takes hits while it fades.
where     — docs/src/components/studio/PresentOverlay.tsx (the dialog's closing state); the sweep's click at the line
            after Present closes
done when — nothing inside a closing Present dialog takes pointer events, and the sweep passes 6/6 under the same load
evidence  — the #3159 session's runs: branch 5/6 and main 5/6, both failures at the launcher click with the same
            interceptor
verify    — cd docs && npx playwright test e2e/studio-warm-offline.spec.ts --grep 'every on-demand' --project=desktop --workers=3 --repeat-each=6
