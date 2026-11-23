---
origin: 3256
priority: P2
recorded: 2026-11-23
area: inventory
severity: medium
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md
deferred: blocked — the owner ruled on #3256 to take its merge ask first and fix this right after; claimed by session_01DPMMjFQcat1AAf5y6KDELj
source: https://github.com/Laticent/lattice/pull/3256
---

# A logo wall can paint its unmeasured grid for one frame on a first visit

why now   — docs/e2e/logo-wall-first-visit.spec.ts:82 catches it: the recorder logs `unstamped/visible` before
            `measuring/hidden`. A real one-frame flash of the wrong layout (jank), met in #3256's full e2e run.
where     — the runtime marks the list `data-logo-wall="measuring"` (lib/core/measure-kit.js `run`), and
            lib/components/inventory/logo-wall/logo-wall.styles.css hides only `measuring`. When a slide's markup
            lands, a frame can paint before the runtime's pass stamps it.
done when — the first painted frame of a logo wall in the live preview is hidden or packed, never the unmeasured
            grid; exports unchanged (they carry no runtime, so an unstamped wall must stay visible there: scope any
            hide rule to live-preview frames, e.g. `html[data-lattice-live-layout]`).
evidence  — base 84bb0806e: 1 failure in 48 at --workers=8 (`unstamped/visible`); #3256: 1 in 79. After the fix:
            0 in ≥100 at 8 workers, a failing arm (drop the rule: red), and a demo deck under #9.
verify    — tier 1 checker, because it changes component CSS on every live preview and must not touch exports.
