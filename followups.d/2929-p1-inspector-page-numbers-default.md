---
origin: 2929
priority: P1
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2929
---

# The nightly inspector spec still expects page numbers off by default

```text
  P1 · update docs/e2e/inspector.spec.ts:30 "page-numbers toggle writes paginate front-matter"
       why now   — #2826 turned page numbers on by default, but this nightly-only spec still
                   asserts the switch starts aria-checked="false", so it fails on main on
                   every run (seen twice while verifying #2929, which does not touch it).
       where     — docs/e2e/inspector.spec.ts:30-37
       done when — the spec asserts the new default (on), toggles it off and back, and checks
                   the front matter each way; it passes on desktop.
       evidence  — #2929's e2e log: "Expected: false / Received: true" at inspector.spec.ts:33.
       verify    — cd docs && npx playwright test e2e/inspector.spec.ts --project=desktop -g "page-numbers"
```
