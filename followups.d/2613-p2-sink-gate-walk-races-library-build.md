---
origin: 2613
priority: P2
recorded: 2026-10-08
area: infra
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2613
---

# The style-sink gate's tree walk races the library build's staging folder

why now   — `unit (node 22)` failed on #2613 (run 37805180139) with ENOENT on
            `docs/src/lib/ltt/.dist.tmp-12417/position.d.ts`. The walk in
            `test/unit/tools/preview-style-sink-gate.test.js:361-368` skips `dist` but not the
            `.dist.tmp-<pid>` staging folder that `tools/lib/build-workspace-lib.js:28`
            (STAGING_PREFIX) creates and deletes, and `test/unit/tools/package-nodenext-types.test.js`
            runs that build (npm pack → prepack) in parallel. Any PR can hit it; #2613 touches
            neither file.
where     — test/unit/tools/preview-style-sink-gate.test.js `walk`; check whether
            tools/check-ownership.js checkDocumentStyleSinks walks the same tree the same way.
done when — the walk skips names starting with `.dist.tmp-` (import STAGING_PREFIX rather than
            repeating the string), and so does the gate's own walker if it has the same hole.
            Proposed patch: `if (e.name === 'node_modules' || e.name === 'dist' ||
            e.name.startsWith('.dist.tmp-') || e.name === '.astro') continue;`
evidence  — a failing arm: create a `.dist.tmp-x/` folder with a dangling entry under a root and
            show the walk passes; the unit suite on Node 22 and 24.
verify    — tier 0 gates; a one-line skip in a test walker.
