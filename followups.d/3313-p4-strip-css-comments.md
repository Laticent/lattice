---
origin: 3313
priority: P4
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 1
deferred: large — build change that needs the real build and css:check, which the planning session could not run
source: https://github.com/Laticent/lattice/pull/3313
---

# Strip prose comments from dist/lattice.css

why now   — most of the unminified file is copied source prose, which is why it is hard to read on GitHub or copy.
where     — tools/build-css.js (finish, bundleModules), reuse lib/core/css-comments.mjs; keep the banner, the @theme/@size comment, the "=== source ===" markers and LATTICE-LAYERS-INERT (HARD RULE #26 sentinel).
done when — css:check, test/unit/cli/css-modules.test.js, build-css.test.js and check:render pass, and dist/lattice-min.css is byte-identical.
evidence  — before/after sizes from npm run bundle:report.
verify    — tier 1 checker, because the #26 sentinel and the module join contract ride on it.
