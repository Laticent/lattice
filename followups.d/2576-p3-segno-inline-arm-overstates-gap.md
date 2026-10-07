---
origin: 2576
priority: P3
recorded: 2026-10-07
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2576
---

# The inline bakeoff arm reports Segno at 4.5x the kernel; the dispatcher alone is 1.4x

why now   — `npm run parser:bakeoff:segno` is the table the README and the decision note quote.
            On the cloud sandbox on 2026-10-07 it reported ordinary inline code at 215 ns
            against the kernel's 47 ns (4.5x), on both `main` and #2576. The same `segnoInline`
            dispatcher timed in a script of its own took 78 ns against the kernel's 54 (1.4x),
            which matches the note's 1.5x. Someone reading the arm's output would chase a
            regression that is not there.
where     — `tools/parser-bakeoff/segno.mjs`: `time()` and the order the arm times things in
            (it times pill reads and failing spans before ordinary code, so V8 has already
            seen those types when ordinary code runs). The standalone repro is the
            `segnoInline` + `time` pair, timed over `inputsFor('inline').real`.
done when — the arm's "ordinary code" row agrees with a standalone timing of the same
            dispatcher within about 1.3x on one machine, or the arm states why the two
            differ.
evidence  — PR #2576's body (§ Caveats) and the decision note's § Generated-parser speed.
verify    — run the arm and the standalone script back to back; compare the ordinary-code rows.
