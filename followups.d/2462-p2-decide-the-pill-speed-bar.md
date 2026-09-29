---
origin: 2462
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Decide whether pills may stay at 2.0x the kernel

why now   — #2462 met the 1.5x speed target everywhere except pills (2.0x, 701 ns vs 350 ns),
            and the grammar step's speed depends on V8 state (110–280 ns). The note defers the
            call to a phase-2 check-in; the inversion review asks that it never pass silently.
where     — engineering/decisions/2026-09-28-segno-unified-inline-notation.md § The engine,
            "What is left".
done when — the owner either lowers the bar for pills in the note, or phase 2 binds pills
            straight off the flat tree and the arm shows at most 1.5x.
evidence  — `npm run parser:bakeoff:segno`, before and after, same machine.
verify    — tier 1.
