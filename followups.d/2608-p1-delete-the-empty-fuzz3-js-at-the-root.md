---
origin: 2608
priority: P1
recorded: 2026-10-08
area: infra
severity: low
swimlane: engineering/development.md §Test layout
source: https://github.com/Laticent/lattice/pull/2608
---

# Delete the empty fuzz3.js at the repo root

why now   — a 0-byte tracked file at the root reads like a fuzz harness that
            exists; it was committed by accident with #2545 (f75d2801), and
            nothing references it
where     — /fuzz3.js; confirm with `git grep -n fuzz3` before deleting
done when — the file is gone, `git grep fuzz3` is empty, build:check passes
evidence  — the deletion diff plus the empty grep
verify    — tier 0 gates, because it is one tracked empty file with no callers
