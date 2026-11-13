---
origin: 3034
priority: P5
recorded: 2026-11-05
area: infra
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §6
deferred: blocked — the floor change landed (issue #2085); what is left needs a week of nightly runs after merge
---

# perf-nightly files a regression for noise under its 0.5 floor

docs/scripts/perf-regression.mjs (about line 167) trips the 0.5 score floor on any drop. Mobile pages sit at 0.38–0.49, so a
−0.01 to −0.04 wobble filed a "regression" on 3 of the last 6 nights (issue #2085). Proposal: trip the floor only on a drop
larger than the noise band (`noiseAbs`). It changes what the alarm means, so it waits on the owner.

done when — a week of perf-nightly runs files no regression for a drop inside the noise band, and a drop past it still files one.

2026-11-08 — the owner left the call to the session ("use your best judgment"), and the floor now trips only when head
crosses it from above by more than `noiseAbs` (engineering/decisions/2026-11-08-docs-perf-nightly-diagnosis.md §2). What is
left is the done-when above: read a week of perf-nightly runs, then delete this file.

2026-11-08, read again — #3085 merged at 15:28 UTC. The last scheduled night before it (run 42478891535, 12:09 UTC,
head `644f177b`) filed nothing, and the PR-branch dispatch (run 42490597756) filed nothing either. No scheduled night has
run on the new rule yet, so the week starts with the 2026-11-09 night and ends with the 2026-11-15 one. Close #2085 and
delete this file after that run if none of the seven filed a drop inside the noise band.

2026-11-09, 13:14 UTC — no night read yet. The 11-09 scheduled run had not started (the 05:37 UTC cron has fired
between 11:53 and 13:27 UTC this week). #2085 is already closed (the owner, 2026-11-08 20:22 UTC), so the alarm can no
longer append to it: `perf-nightly.yml` finds the rolling issue among OPEN issues by its title marker, and a noise
filing would now show up as a NEW `[perf-nightly] docs perf regression detected` issue. So the week's test is "no new
such issue for a drop inside the noise band" across the 11-09 to 11-15 scheduled runs; list them with
`gh api 'repos/laticent/lattice/actions/workflows/perf-nightly.yml/runs?per_page=10'` and read each run's perf-report
artifact. Nothing is left to close; delete this file (and its pair) after the 11-15 run if none of the seven filed one.

2026-11-09, 15:10 UTC — night 1 of 7 read. Scheduled run 42633038656 (head `99009e45`, 14:16 UTC, alternated head/base)
reported "no regression": every row inside tolerance, mobile `/playground/` 0.48 → 0.49 and `/studio/` 0.37 → 0.45
under the 0.5 floor, neither tripped. No `[perf-nightly]` issue was opened on 11-08 or 11-09. Nights 2-7 (11-10 to
11-15) are still to read; the file stays until the 11-15 run.

2026-11-12 — nights 2 and 3 of 7 read. 11-10 (run 42827175167, head `467a0b57`) filed #3121 with two rows, and
neither is a noise filing: mobile `/studio/` score 0.45 → 0.38 is a 0.07 drop past the 0.05 tolerance (the floor did
not trip: base was already under it), and mobile `/` TBT 891 → 1153 ms is past max(100 ms, 20 %). That is the
"a drop past it still files one" half of the done-when. 11-11 (run 43024500526) reported green and commented on #3121.
Nights 4-7 (11-12 to 11-15) are still to read.
