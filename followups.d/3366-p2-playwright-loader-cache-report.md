---
origin: 3366
priority: P2
recorded: 2026-11-21
area: infra
severity: low
swimlane: engineering/testing.md
deferred: blocked — filing with microsoft/playwright is outward-facing, so it is the owner's call
source: https://github.com/Laticent/lattice/pull/3366
---

# Report Playwright 1.65's per-file transform cache that ignores the module format

why now   — under 1.65.1 one worker hands the same compiled code to `import` and `require()` of a file: `getFromCompilationCache` (playwright/lib/transform/esmLoader.js) answers from `memoryCache.get(filename)` before its format-aware hash. A spec that `require()`d the engine got ESM source as CommonJS ("Cannot use import statement outside a module") whenever another spec in the worker had imported lib/core/boundary-parser.mjs. #3366 worked around it in inline-grammar-marp-mirror.spec.ts (the engine renders in a child node).
where     — microsoft/playwright; docs/e2e/inline-grammar-marp-mirror.spec.ts carries the workaround and its comment
done when — the report is filed with the three-file reproduction (markdown-stress + studio-jargon-alignment + inline-grammar-marp-mirror on one worker: 2 failed on 1.65.1, 21/21 on 1.56.1), its link is in the spec's comment, and the workaround is dropped once a fixed release lands
evidence  — #3366 commit f9ffc0d's message
verify    — none: tracking only
