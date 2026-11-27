---
origin: 3451
priority: P3
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §5 slice B
deferred: off-path — true of every workspace library, already published ones included; not caused or worsened by #3451
source: https://github.com/Laticent/lattice/pull/3451
---

# A CommonJS TypeScript consumer gets TS1471 from every library's `require` types

why now   — the libraries go public with 1.0.0; a `module: node16` CJS project doing `import x = require('@laticent/…')` fails to typecheck.
where     — each docs/src/lib/<name>/package.json `exports[*].require.types` points at `./dist/*.d.ts` inside a `"type": "module"` package; the builders in tools/build-<name>-lib.js.
done when — the require branch points at `.d.cts` types the builders emit, for every library.
evidence  — the #3451 checker reproduced TS1471 on markup, lastra/decode, segno-markdown and the published-shape @laticent/segno; the JavaScript `require` itself loads.
verify    — tsc --module node16 on a CJS fixture that requires each library: no TS1471.
