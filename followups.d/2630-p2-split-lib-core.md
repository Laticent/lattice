---
origin: 2630
priority: P2
recorded: 2026-10-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §8
source: engineering/decisions/2026-10-11-codebase-structure.md §8
---

# Choose lib/core's split from the change-coupling data

why now   — lib/core is 223 files and 58,797 lines, imported by 23 parts. Measured inside, it is 61
            islands (the largest 136 files, 49 isolated files). 31 of its files are `resolve-*`. A
            folder of unrelated islands scores high cross-part cohesion by construction, so the
            island count, not cohesion, is the signal to split on.
where     — lib/core/; `npm run structure` (inside-part report); `tools/change-coupling.js --json`.
done when — a decision note names the candidate sub-parts (e.g. the resolvers, the split and pane
            kernels, export helpers), measured by internal imports and co-change, and the owner
            picks one; the split lands as its own PR with the gate holding it.
