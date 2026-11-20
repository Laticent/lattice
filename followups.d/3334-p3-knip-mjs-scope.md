---
origin: 3334
priority: P3
recorded: 2026-11-20
area: infra
severity: medium
swimlane: engineering/quality-assessment.md
deferred: large — widening knip to .mjs surfaces 27 files, 14 undeclared imports, 43 unused exports and 3 duplicate exports, each needing its own verdict
source: https://github.com/Laticent/lattice/pull/3334
---

# Widen the dead-code ratchet to .mjs and .cjs files

why now   — knip.jsonc's `project` covers lib/**/*.js, tools/**/*.js and *.js, so 157 .mjs files in lib/ and 72 in tools/ are never read; a dead .mjs file, an unused export in one, or an undeclared import from one passes the pre-push check (shown by the #3334 maker-checker review).
where     — knip.jsonc `project` (to {js,mjs,cjs}), its `entry` list, `ignoreDependencies` (three entries exist only because .mjs is not read: @mediabunny/aac-encoder, woff2-encoder, @breezystack/lamejs), test/quality/baseline.json.
done when — `project` includes .mjs and .cjs, every new finding is fixed or listed with its reason, the three .mjs-only ignoreDependencies entries are gone, and the dead-code rows are back at 0.
evidence  — each finding with its verdict, in the PR body.
verify    — tier 1 checker, because a wrong entry hides real dead code.
