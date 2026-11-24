---
origin: 3407
priority: P1
recorded: 2026-11-24
area: infra
severity: low
swimlane: engineering/decisions/2026-11-21-ci-load-plan.md §3
deferred: blocked — owner decision: editing the `changes` job's path lists changes a CI step (CLAUDE.md second filter, row 2)
source: https://claude.ai/code/session_01DPMMjE3qPpLbpy7tad263a
---

# The PR path filter misses `design/` and the engine's workspaces under `docs/src/lib`

why now   — The owner chose to keep the merge queue running every tier (D1 A, 2026-11-24), so the queue still
            catches both holes before merge. On a PR run they skip tiers that read the changed files, so a break
            first shows as a queue ejection rather than a red PR. (1) `design/` is in neither list, yet the Studio
            imports `design/skills/*.md`, `design/skills/index.json`, `design/editorial.md` and
            `design/design-principles.md` (`agent-library.ts`, `architect-agent.ts`), two docs tests read them, and
            `test/integration/invariants/mark-agreement.test.js` globs `design/*.gallery.md`. A `design/`-only PR runs
            no `docs-build` or `docs-test`. (2) The engine requires 8 workspaces under `docs/src/lib` (markup, segno,
            cadenza, trama, squadra, lastra, ltt, calco), and 24 of 202 integration tests import them, but `code`
            does not list them, so a change there skips `golden-diff` on its PR.
where     — `.github/workflows/ci.yml`, the `changes` job's `code` and `docs` lists.
done when — `design/**` is in `docs`, and `design/*.gallery.md` plus the 8 workspaces are in `code` (or the owner
            decides to leave the queue as the only catch and this file is deleted).
evidence  — Grep of `docs/src` and `test/integration`, 2026-11-22. In the week to 2026-11-22 no queue entry touched
            only `design/` or only those workspaces, so the holes have not yet let a break through.
verify    — A PR that changes only `design/skills/index.json` runs `docs-build` and `docs-test`; one that changes
            only `docs/src/lib/markup/` runs `golden-diff`.
