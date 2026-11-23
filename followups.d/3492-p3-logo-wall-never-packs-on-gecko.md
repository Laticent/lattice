---
origin: 3492
priority: P3
recorded: 2026-11-23
area: inventory
severity: low
swimlane: lib/core/measure-kit.js
deferred: off-path — a separate mechanism (how Firefox measures a mark's shape), found by #3492's gecko run; #3492 fixes the first-paint flash, which Firefox never shows
source: https://github.com/Laticent/lattice/pull/3492
---

# A logo wall never packs in Firefox's Studio preview: it goes straight to the fallback grid

why now   — #3492 ran the logo-wall specs on the `gecko` project for the first time (none carries `@gecko`). On main and
            on #3492 alike, Firefox records `["none", "fallback/visible"]`: the measure kit finds no mark shape, so the wall
            never packs and shows the equal-cell grid. The cap and revisit specs fail on gecko on main too ("the mocked
            request never arrived", "element(s) not found"): their routes never see the request Chromium and WebKit make.
where     — lib/transformers/logo-marks.js `measureMark`, lib/core/measure-kit.js, and how Firefox loads a mask URL's SVG.
done when — a wall packs in Firefox as it does in Chromium and WebKit, and the three logo-wall specs carry `@gecko` and pass.
evidence  — /tmp logs from #3492's session: lgg-fix-firstvisit.log (gecko, fix: fallback/visible ×3),
            lgg-main-cap-revisit.log (gecko, main's preview CSS: 4 of 4 fail).
verify    — tier 1 checker, because it changes how the runtime measures marks.
