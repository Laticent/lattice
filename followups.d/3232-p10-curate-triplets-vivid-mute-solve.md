---
origin: 3232
priority: P10
recorded: 2026-11-22
area: theming
severity: low
swimlane: engineering/decisions/2026-11-16-status-triplets.md §4
deferred: off-path — logged from a session archive sweep; the triplet solver is not touched by the PR that records it, and today's shipped values pass `--check`
source: https://github.com/Laticent/lattice/pull/3232
---

# `curate-status-triplets.js` solves the vivid trio against a deferred it then throws away

why now   — Both `marks:` intensities paint deferred with one token, `--mute-mark`. The write path solves the
            vivid trio against a vivid deferred, then swaps in the muted deferred and re-picks only the pilot
            (info) against it. The trio's own separation from deferred was judged against the discarded value,
            so a fresh solve could write a vivid trio that `--check`, which reads the shipped tokens, rejects.
            It never passes silently: `--check` catches it. Today's values pass.
where     — tools/curate-status-triplets.js, the per-intensity light solve (`if (intensity === 'vivid') mute =
            out[face].muted.mute;`, near line 453), and the `best` trio picked before it.
done when — the vivid solve uses the muted deferred from the start, so every theme the write path writes passes
            `node tools/curate-status-triplets.js --check` with no further edit; a test runs the solve on one
            theme and checks the result against the same contract.
evidence  — reading of the solve on main (164ecfa); `--check` green on the shipped values.
verify    — run the write path on all brand themes into a scratch copy, then `--check` on it; `npm run check:glance`.
