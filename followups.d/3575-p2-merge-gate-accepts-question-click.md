---
origin: 3575
priority: P2
recorded: 2026-11-27
area: infra
severity: medium
swimlane: engineering/workflow.md §Merging
deferred: off-path — the owner chose a separate small hook PR (D6 A, question tool, event 88d90479-f243-4134-acc8-7edab93aaaf2), to build on #3550's gate
source: https://github.com/Laticent/lattice/pull/3575
---

# Let the merge gate accept the owner's question-tool click

why now   — `owner-merge-gate.mjs` reads only typed turns (`origin.kind === 'human'`) and skips
            every tool_result, so it blocked the command center's merges of #3442 and #3571 after
            the owner clicked them.
where     — .claude/hooks/owner-merge-gate.mjs; test/unit/tools/owner-merge-gate.test.js. #3550
            (night desk) edits the same files: land it first.
done when — the gate allows a merge when the owner's latest answer is an AskUserQuestion result
            whose selected label names the PR and its head sha, and the call's head matches.
evidence  — a fixture from a REAL command-center transcript (the local shape of a question-tool
            answer was not read on #3575: UNVERIFIED); failing arms: a label for another PR, a
            stale head, an answer from a config or classifier source.
verify    — node --test on the gate tests; one real click-to-merge in the command center.
