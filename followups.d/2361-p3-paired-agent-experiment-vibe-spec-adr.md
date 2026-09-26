---
origin: 2361
priority: P3
recorded: 2026-09-26
---

# Measure vibe vs spec-driven vs ADR+backlog with real agents, not a model

why now   — the owner was handed a claim that ADRs + backlogs beat spec-driven agentic tools
            at "Day 30" and vibe coding everywhere after a prototype. A toy Monte Carlo
            (2026-09-25, scratch only) only echoed its made-up inputs: vibe "won" because it
            counted tasks done, not defects shipped. Only a real run can test the claim.
            On hold at the owner's request to protect budget; the owner may run it on a Sunday.
where     — a fresh scratch workspace (not this repo's tree); results, if kept, go to
            engineering/decisions/ and optionally one talk slide labeled with its run count.
design    — one fixed todo CLI contract; six hidden stages given one at a time:
            (1) add/list/complete/delete + file storage, (2) tags, filters, search,
            (3) due dates, recurrence (monthly-on-31st, DST), overdue, (4) undo/redo across
            all ops, (5) shared lists with owner/editor/viewer, (6) two-replica sync with
            offline edits, conflicts, and a data-file migration.
            Three builders, same model and tools, fresh session per stage:
            vibe (build from the request), spec-driven (requirements.md → design.md →
            tasks.md, then code), ADR+backlog (an ADR per architectural choice, backlog
            items with "done when", then code). The orchestrator stands in for the human
            gates, which is a stated limitation.
            A separate agent writes the hidden acceptance tests before any build starts;
            builders never see them. After each stage run all stages' tests.
measure   — acceptance pass rate per stage, regressions, tokens and dollars, wall-clock,
            lines of code, and a blind judge's maintainability score.
cost      — pilot: 18 builds + test writer + judge ≈ 20 agents, ≈ $25–45, 1–2 h.
            Replicated (3 runs): ≈ 58 agents, ≈ $75–130. Over the session ~10-agent line,
            so the owner's explicit OK is required first (HARD RULE #25).
done when — the owner has chosen pilot or replicated, it has run, and the numbers are
            reported with the run count and the limitations above stated.
verify    — owner decision on scale and budget; one run is an anecdote, three is a signal.
