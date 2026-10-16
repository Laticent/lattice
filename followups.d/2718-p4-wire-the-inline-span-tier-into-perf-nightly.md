---
origin: 2718
priority: P4
recorded: 2026-10-16
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2718
---

# Run the inline-span bench tier in perf-nightly, on both arms

why now   — #2718's inline-span tier gates `npm run bench:check`, but the nightly cannot run it
            on the base arm. `.github/workflows/perf-nightly.yml:336` copies only
            `engine-bench.mjs` into the base worktree, so `inline-span-timer.mjs` and
            `fixtures/inline-spans.json` are missing there and the tier reports `absent`.
            `tools/perf-nightly-compare.mjs` has no arm for the `inline` key either. So a
            per-span dispatcher regression is caught only when someone runs bench:check by hand.
where     — perf-nightly.yml (copy the timer and the fixture beside engine-bench.mjs) and
            perf-nightly-compare.mjs (compare `inline.summary[].ratio`, head vs base, at the
            12% band). Changing perf-nightly.yml changes a CI step, which is the owner's call
            (CLAUDE.md SECOND FILTER row 2), so put the options to the owner first.
done when — a nightly run's engine-perf.md shows both inline rows for head and base, and a
            dispatch arm (the per-span `includes` test #2718's PR body describes) reads as a
            regression there.
evidence  — the nightly's engine-perf.md for a clean run and for the arm.
verify    — tier 1 checker: it edits a scheduled workflow and the comparator other perf rows use.
