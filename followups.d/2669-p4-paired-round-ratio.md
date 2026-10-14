---
origin: 2669
priority: P4
recorded: 2026-10-13
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2669
---

# The Segno bakeoff divides two minimums; a paired per-round ratio would be steadier

why now   — The bakeoff alternates columns round by round but still takes each column's fastest round and
            divides them. The ordinary-code row swings 1.06x to 1.29x between runs of unchanged code, and the
            every-span ratio spread (about 0.25) straddles the 1.4x line the design note's acceptance reads.
where     — tools/parser-bakeoff/segno.mjs `timeSet` and `trio`: return the per-round times, compute
            shipped/kernel inside each round, and report the median across rounds.
done when — five runs on one machine of unchanged code spread the every-span ratio by 0.1 or less.
evidence  — the five readings before and after, same machine.
verify    — tier 0 gates: a measurement tool, no shipped code.
