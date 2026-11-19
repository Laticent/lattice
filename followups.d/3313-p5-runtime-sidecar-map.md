---
origin: 3313
priority: P5
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 1
deferred: large — build change that needs the real build, which the planning session could not run
source: https://github.com/Laticent/lattice/pull/3313
---

# Move lattice-runtime.js's inline source map to a sidecar file

why now   — most of the unminified runtime is one base64 source-map line, which breaks GitHub and copy-paste; the path stays the same.
where     — tools/build-runtime.js (sourcemap: 'linked'); package.json files already ships dist/; tools/build-marp-kit.js already strips the inline map.
done when — runtime:check and the marp-kit test and the hydrate tests (hydrate-host.test.js, fence-hydrate-resolve.test.js) pass, and DevTools resolves sources in the VS Code preview.
evidence  — sizes from npm run bundle:report; a DevTools screenshot from the real preview, or UNVERIFIED.
verify    — tier 0 gates, because the path and the minified build do not change.
