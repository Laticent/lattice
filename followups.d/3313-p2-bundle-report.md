---
origin: 3313
priority: P2
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 0
deferred: large — new tool; the session that planned it could not run npm install
source: https://github.com/Laticent/lattice/pull/3313
---

# Add npm run bundle:report: what is in lattice.css and lattice-runtime.js

why now   — every later phase of the plan cites its numbers, and today nobody can see what the two bundles contain without opening a 3 MB file.
where     — tools/bundle-report.mjs (new), package.json; reuse the module manifest from tools/css-modules.js and an esbuild metafile of lib/runtime/index.js.
done when — dist/bundle-report.md lists every CSS module (raw, minified, comment share, owning plugin) and the runtime's bytes by area, and its totals match dist/lattice.css and dist/lattice-runtime-min.js.
evidence  — the generated report attached to the PR.
verify    — tier 0 gates, because it is a read-only tool.
