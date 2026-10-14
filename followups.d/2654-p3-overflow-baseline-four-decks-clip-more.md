---
origin: 2654
priority: P3
recorded: 2026-10-13
area: engine
severity: low
swimlane: test/oracle/family-overflow.json
source: https://github.com/Laticent/lattice/pull/2654
---

# Four decks clip more slides than the overflow baseline

why now   — `npm run overflow:check` on main at 4b0eef0 exits 1. None of the four decks has a math slide, so
            the #2654 math arm is not the cause; the cause is not yet found.
where     — examples/portrait-split-chrome.md (now p10), examples/split-panels-jank.md (now p8 as well),
            exemplars/README.md (p1), lib/components/layout/rows/rows.gallery.md (p4).
done when — each deck is trimmed or its clip is explained, or the baseline is re-blessed with the PR justifying it.
            The baseline also predates 43 newer decks (384 recorded, 427 swept); re-bless covers those.
evidence  — `overflow:check` output after the change.
verify    — tier 1; the sweep takes about 22 minutes, so run it once under tools/wait-for.sh.
