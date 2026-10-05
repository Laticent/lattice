---
origin: 2521
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2521
---

# The integration suite has more than doubled in a month

status    — narrowed 2026-10-05 by #2524's follow-up PR: the cap went 25 -> 45 minutes and the
            merge queue now fails a `cancelled` tier, so a timeout no longer reads as a pass
            where it matters. The growth itself is untouched.
why now   — `integration (node 22)` ran p50 1372s across 41 passing runs on 2026-10-05,
            against p50 601s on 2026-09-02 (`.github/workflows/ci.yml`'s timeout block has both
            samples). On that trend the new 45-minute cap lasts weeks, not a season. The slow
            runs are runner speed, not one test: the palette sweep, export-formats, frame
            identity and strip-notes files each took 1.35-1.75x as long in a slow run.
where     — `npm run test:integration:pr` and those four files (`node --test` durations in the
            job log); `.github/workflows/ci.yml`, the integration job.
done when — integration's p50 is back under 15 minutes, or the owner has picked a split
            or a slice.
evidence  — the 100-run duration pull the ci.yml timeout block describes, before and after.
verify    — owner call first: splitting or adding a CI job is on CLAUDE.md's stop list (the
            CI / hook contract), so put the options and their measured cost to the owner.
