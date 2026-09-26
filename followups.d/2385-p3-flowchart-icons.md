---
origin: 2385
priority: P3
recorded: 2026-09-26
---

# Icons in flowchart shapes, including cloud provider services

why now   — The owner's idea, raised on #2385: an icon in a shape, with cloud provider
            service icons (compute, storage, queues, functions and the like) as the
            first set.
where     — lib/core/flowchart-grammar.js (an icon span word, e.g. `:icon-queue`);
            flowchart.layout.js (measure and paint the icon inside the shape);
            flowchart.styles.css; an icon kernel shared with the chart family.
done when — A decision note settles three questions before code:
              1. Source and license. The providers' official architecture icon sets
                 each carry usage terms; confirm redistribution in a deck engine, or
                 draw a neutral house set.
              2. Rendering. An icon is a drawn shape colored by the element, like the
                 `--mark-*` / `--shape-*` mask tokens (HARD RULES #3 and #29), never
                 a typed glyph or a fixed-color bitmap. That keeps it working under
                 every theme, finish and dark mode.
              3. Bundle cost. It is measured against docs/route-budget.json; icons
                 load only for decks that use them.
            Then an author can put an icon in a shape with one word. The shape grows
            to fit it, and the router still meets every never-rule. The
            self-healing half: an unknown icon name draws the shape without an icon,
            and lint names the nearest known icon.
evidence  — The owner's review of #2385.
verify    — render a demo slide with icons in light, dark and every finish; route
            budget.
