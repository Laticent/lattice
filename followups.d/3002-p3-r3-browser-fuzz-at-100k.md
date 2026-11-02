---
origin: 3002
priority: P3
recorded: 2026-11-02
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R3 landed
deferred: blocked — 100,000 inputs per engine is about five hours of wall clock in three browsers, and the cloud sandbox reclaims its container while a session is idle, killing the run each time; a workflow that runs it is a new CI job, which is the owner's call
source: https://github.com/Laticent/lattice/pull/3002
---

# The R3 browser fuzz has not reached 100,000 inputs per engine on the final code

why now   — R3's gate in the note is "the soundness invariant on 100,000 inputs per engine". PR #3002 ran
            `npm run fuzz:web-refs -- --seed 11` in Chromium 131, WebKit 26.0 and Firefox 142: 43,800 to 72,900 inputs per
            engine on the code before the stray-`<body>` fix (one leak, fb-43615, which that fix closed and a replay
            confirms), and inputs 0 to about 9,900 per engine on the final code (0 leaks). Each run died when the container
            was reclaimed. The parse5 differential (`check:html-ref-spans --fuzz 100000`) did reach 100,000 per stream.
where     — `tools/fuzz-web-refs.mjs` (`--from` and `--count` resume a run; input i depends only on the seed and i).
done when — `npm run fuzz:web-refs -- --seed 11 --count 100000` reports 0 leaks in each of the three engines on main
            after #3002, from a session that stays attended, a workstation, or a dispatch workflow if the owner adds one.
evidence  — the run's JSON per engine (`leaks: []`, `controlFetched` near 17% of inputs, as in #3002's runs) and the commit it ran on.
verify    — tier 0: it only runs the existing fuzz.
