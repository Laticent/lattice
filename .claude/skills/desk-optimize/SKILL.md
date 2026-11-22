---
name: desk-optimize
description: >
  Run the ⚡ optimization desk: find and drive measured wins in four areas — engine speed
  and size, CI time and cost, agent and session spend, and code quality (dead code,
  duplication, coupling). Every win ships with before/after numbers. Use when this
  session is told to be the optimization desk, or the owner asks what is slow, heavy,
  wasteful or costly.
argument-hint: "[engine | ci | spend | quality]"
---

# ⚡ Optimization desk

Read first, by section: `engineering/workflow.md` §Desks and §Performance (HARD RULE #19),
`engineering/quality-assessment.md` §Running it and §Reading the results, and
`engineering/gotchas/ci.md` for the route budget. Tag this session `desk:optimize` and `ui:pinned`.
**Measure first:** a win with no reproducible number is not a win, and a guess
("~5s") is not a measurement.

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back.

## Four tracks

| Track | Measure with | A win ships with |
|---|---|---|
| **Engine speed + size** | `npm run bench`, `perf-nightly.yml`, the docs `check:route-budget` gate | #19's evidence: before/after from `npm run bench`, `bench:bless`, and a bench scenario covering the path |
| **CI time + cost** | job durations from recent `ci` runs on `main`; the pre-commit and pre-push hook times | before/after minutes for the same job |
| **Agent + session spend** | `get_session` per session (`usage.cost_usd`, tokens), grouped by desk tag | a spend table for the command center: top sessions, cost per merged PR, waste such as idle polling or a duplicated fix |
| **Code quality** | `npm run quality`; dead code alone: `node tools/quality-assessment.js --check --only dead-code` | the dimension's number before and after, and `quality:bless` |

## The pass

1. **Measure** each track and keep the top three items by size of the win.
2. **Act inside the lane:** start a session from `main` for a measured engine or
   code-quality win (tags `desk:optimize`, `origin:desk-optimize`), with the baseline
   number in its brief.
3. **Propose, never do:** any CI job, step, hook or workflow change, and any change that
   RAISES or loosens a budget (the docs route budget, the engine byte ceiling #3028
   raised, the bench variance band). Those are the owner's (CLAUDE.md's SECOND FILTER).
   Tightening a budget after a measured win is part of the win
   (`engineering/development.md` lowers a debt ceiling in the same commit as the fix).
4. **Report** to the command center: the top items as fleet items, the session spend
   table, CI and budget changes as numbered actions, and `budget: N/10 today`.

## Lane

Never, even for a measured win: remove, skip or merge a test; edit a `SANCTIONED_*`
list or a sanitizer. A CI-time win comes from scheduling or caching; anything that
touches a test's content goes to the owner as a proposal.

Yours: measuring, and fix sessions for engine and code-quality wins. Not yours: CI or
hook changes, budget numbers, model choice (every agent runs on Opus, HARD RULE #27;
cut spend by spawning fewer agents at the right effort, never a cheaper model).
