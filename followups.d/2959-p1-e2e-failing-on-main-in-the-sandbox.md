---
origin: 2959
priority: P1
recorded: 2026-10-29
area: website
severity: medium
swimlane: engineering/development.md §Studio e2e suite
deferred: off-path — every one fails identically on main (be19565) in the cloud sandbox; PR 2959 touches none of these surfaces
source: https://github.com/Laticent/lattice/pull/2959
---

# Eleven e2e tests fail on main in the cloud sandbox

```text
  P1 · [no ticket] find why eleven desktop e2e tests fail on main in the cloud sandbox
       why now   — the full-suite evidence run for PR 2959 hit them, and the same eleven
                   failed the same way on a clean build of main (be19565), same sandbox,
                   2026-10-29 (not on the rolling issue #2035, so the nightly runner may
                   not see them: they may be sandbox-specific):
                     command-palette:139 (overflow menu: 'Present' resolves to 2 items)
                     journeys/author-export:31, :46, :65, :89 and journeys/chart-export:22
                       (no sonner toaster: the "… ready." toast never mounts)
                     marp-bundle-panes:25 (same missing toast)
                     mermaid-unavailable-export:336
       where     — docs/e2e/ (the specs above); the export toast, the overflow menu
       done when — each passes in the sandbox, or its spec names the sandbox limit it needs.
       evidence  — the eleven green in the sandbox, and on the nightly.
       verify    — tier 1 checker.
```

2026-11-12 — anima-motion-frames:247 and mermaid-cache-bindings:143 fixed on branch claude/flaky-e2e-render (stale
premises: a `non-scaling-stroke` scale, and the draw shim's `data-lattice-tip`); removed from the list above.
