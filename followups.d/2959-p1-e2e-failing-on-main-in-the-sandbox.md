---
origin: 2959
priority: P1
recorded: 2026-10-29
updated: 2026-11-21
area: website
severity: medium
swimlane: engineering/development.md §Studio e2e suite
deferred: blocked — the one test left is #3307's, an open PR that edits it
source: https://github.com/Laticent/lattice/pull/2959
---

# One e2e test of the eleven that failed on main in the cloud sandbox is left

```text
  P1 · [no ticket] journeys/chart-export.spec.ts:22 on desktop in the cloud sandbox
       why now   — the full-suite evidence run for PR 2959 hit eleven desktop tests that failed the same way on a
                   clean build of main (be19565), 2026-10-29. Ten are cleared: anima-motion-frames:247 and
                   mermaid-cache-bindings:143 fixed on branch claude/flaky-e2e-render (2026-11-12); the export toasts
                   now carry the file size and the specs expect it (#3057); and on 2026-11-21 (branch
                   claude/chromium-e2e-flake-triage, main 450df6d, fresh `build:e2e`, --retries=0) command-palette:139,
                   journeys/author-export:31, :46, :65 and :89, marp-bundle-panes:25 and mermaid-unavailable-export:336
                   passed every run on desktop, tablet and mobile: 4 workers x2 and x8, and 1 worker x5.
                   journeys/chart-export.spec.ts:22 was not re-run: #3307 is editing it.
       where     — docs/e2e/journeys/chart-export.spec.ts
       done when — it passes in the sandbox once #3307 lands, or its spec names the sandbox limit it needs.
       evidence  — a desktop run of the spec on a fresh build of main, alone and at 4 workers.
       verify    — tier 1 checker.
```
