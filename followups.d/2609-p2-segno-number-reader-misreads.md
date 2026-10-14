---
origin: 2609
priority: P2
recorded: 2026-10-08
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-08-library-trio-before-publish.md
source: engineering/decisions/2026-10-08-library-trio-before-publish.md §3 (SEGNO-2, SEG-R2)
---

# The shared number reader accepts malformed numbers

why now   — the trio on Segno found silent wrong values in `readNumber`. (`1.234,5` read as
            1.2345; the chart-authoring census PR fixed that case in both readers.) `--5` reads as -5, `(5` and `5)` as 5, `1,2,3` as 1.2 with the unit
            `.3`, and `1.2.3.4x` as 1234. A chart value typo becomes a different number with no
            warning.
where     — docs/src/lib/segno/types.ts (`normalizeSeparators`, `NUMERIC`, `readNumberFull`) AND
            lib/core/chart-values.js, which Segno mirrors on purpose: a parity test holds the two
            together, so a fix to one alone fails it. That is why this did not land in the trio's
            PR: it changes how every chart reads deck values, which is a rendered-surface change
            that owes its own demo deck (HARD RULE #9).
done when — a doubled
            sign, an unbalanced parenthesis and a unit that is not letters, % or ‰ make the value
            unreadable (and lint names it); both readers change together and the parity test passes.
evidence  — a unit table of the inputs above, before and after, through both readers.
verify    — tier 1 checker, because it moves rendered chart values.
