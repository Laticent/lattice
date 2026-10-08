---
origin: 2556
priority: P3
recorded: 2026-10-06
area: engine
severity: low
swimlane: engineering/decisions/2026-10-07-calco-native-shapes.md
source: https://github.com/Laticent/lattice/pull/2556
---

# Editable office export: cards, pills and rules as native shapes

why now   — option B is built and checked on the owner's devices (the design note's §7). The
            tags this slice could not lift are the ones drawn by `::before`: the numbered card
            tags and step labels stay pixels, so those cards cannot be moved yet.
where     — docs/src/lib/calco/reader.ts (the SHAPES block), shapes.ts, odp.ts, pptx.ts.
done when — a tag drawn by `::before` (`content: counter(card)`, `STEP 01`, `RECOMMENDATION`)
            lifts with its card. It needs the scoped-stylesheet hide of the design note's §2a and
            a way to read a counter's value. Until then those cards stay a picture whole.
evidence  — calco-shapes-test slides 7 and 8 (the numbered cards, the option cards) export
            with movable cards, opened on the owner's devices.
verify    — tier 1 checker, because the reader changes.
status    — (2026-10-08) option B is built (PR #2597). The owner opened its .pptx and .odp on
            their own devices: they look right and cards, tags and rules move as expected. What
            is left is the `::before` tags above; not started.
