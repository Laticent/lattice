---
origin: 2353
priority: P2
recorded: 2026-09-24
---

# Baked diagram labels sit right of center and overrun their boxes

why now   — the reading article now draws long diagrams at 12px labels instead of 3px, so the
            offset that was invisible before is plain to see: "Order placed" and "Payment
            checked" run past their box's right edge, and a lone "Draft" sits right of center
where     — the bake that turns a Mermaid foreignObject label into a native <text>
            (lattice-emulator.js "player capture: serialize baked DOM",
            docs/src/components/studio/export/deck-export.js); visible on the --read export,
            the --player article and the Studio Read pane alike
done when — a baked label is centered in its node on all three hosts, measured as the gap
            between the text's bbox and the rect's on each side
evidence  — before/after crops of an 8-stage LR flowchart on the --read export at 390
verify    — tier 1 checker, because the bake's output bytes feed three surfaces and the
            frozen player golden
