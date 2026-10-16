---
origin: 2730
priority: P1
recorded: 2026-10-16
area: infra
severity: medium
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2730
---

# Confirm the inline-span tier on the first real perf nightly

why now   — #2730 wired the inline-span tier into `perf-nightly.yml` (both arms, `--inline-runs 5`)
            and `tools/perf-nightly-compare.mjs` (12% band). Its evidence is a LOCAL reproduction of
            the nightly; nothing ran on a GitHub runner, so the 12% band against runner noise is
            unverified. A false alarm files a `priority:high` rolling issue.
where     — the first scheduled `Perf nightly (docs regression watch)` run after #2730 merges: its
            `engine-perf.md` job summary, and the `Bench — base` / `Bench — head` logs (each prints
            `(median of 5 runs per row: …)`).
done when — that run's engine-perf.md shows both inline rows for head and base with a verdict of
            ok or win, and the five per-run ratios in each arm's log sit within 12% of their
            median. If they do not, widen the band or raise `--inline-runs` with the measured
            spread quoted, or say why the alarm is real.
evidence  — the run link and the inline rows pasted into the PR that closes this file.
verify    — tier 0: read the run. A band or run-count change it forces is tier 1 (a checker),
            because it moves what a scheduled alarm files.
