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

why now   — option B is built (the design note's §7): tags carry their words, cards come out
            with native shadows, one-sided borders are lines, and each card is grouped with
            what it holds. What is left is the owner's look on the devices this machine
            cannot reach, and the tags this slice could not lift.
where     — docs/src/lib/calco/reader.ts (the SHAPES block), shapes.ts, odp.ts, pptx.ts.
done when — (1) card-tags and muted-tier, dark and light, opened in Collabora on iOS and in
            Google Slides, with a card dragged and a tag resized in each: the card's tag,
            rule and text move with it and nothing is left behind. LibreOffice 24.2 is
            checked (UNO-driven move and resize; renders against the PDF in §7).
            (2) A tag drawn by `::before` (`content: counter(card)`, `STEP 01`,
            `RECOMMENDATION`) lifts with its card: it needs the scoped-stylesheet hide of §2a
            and a way to read a counter's value. Until then those cards stay a picture whole.
evidence  — owner screenshots from Collabora iOS and Google Slides beside the PDF.
verify    — tier 1 checker for (2), because the reader changes.
status    — (2026-10-07) built in the PR after #2587; (1) waits on the owner, (2) is not started.
