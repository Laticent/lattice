---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Give a flowchart group's title and contents real breathing room

why now   — The owner flagged it reviewing #2385: a group's title hugs the shapes
            inside it, and shapes sit close to the group's border. #2385 only
            guarantees the title is not COVERED. The band opened after dagre asks for
            the title's height, 6 above and 4 below, because dagre never reads a
            cluster's padding. The side padding (groupPad 14, compact 10) is likewise
            whatever dagre's node spacing happens to give.
where     — graph-layout.js (the title band after `dagre.layout`, the group boxes);
            flowchart.layout.js (the spacing it passes: groupPad, groupPadTop);
            flowchart.styles.css / tokens (the spacing should come from a token, not
            a literal).
done when — A group keeps a stated minimum gap between its title and its first
            shape, and between its border and every shape on all four sides, in
            both directions and in compact spacing. The minimums come from one
            token-driven setting with sensible defaults. They heal: the kernel
            re-asserts them after dagre (as the title band does now), so no layout
            can come out tighter. A quality count holds the gaps across the unit
            gallery and the fuzz corpora. The type-size cost is measured the way
            the title-band change measured it, reported and accepted in the PR.
evidence  — The #2385 typing deck, Services slide (compact lr): Browser and
            Inventory sit about 4 units under their group titles.
verify    — node --test test/unit/components/graph-layout.test.js; render the
            typing deck and examples/flowchart.md and look.
