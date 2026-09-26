---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Let an author set the gaps between shapes and between groups

why now   — The owner asked for it on #2385. The only spacing control today is the
            universal `compact` modifier, which swaps one fixed set (node 20, rank 40,
            group pad 10) for another (30, 58, 14) in flowchart.layout.js. An author
            cannot open up a crowded chart, tighten one that sprawls, or space groups
            apart from each other independently of the shapes inside them.
where     — flowchart.layout.js (the `spacing` it passes to the kernel);
            graph-layout.js (dagre's nodesep / ranksep / edgesep, the gap between
            sibling groups); the `flowchart:` front-matter register planned for
            slice 4 (lib/base/base.registers.docs.md) and/or a span word on the
            chart; tokens for the defaults. Pairs with
            `2385-p2-flowchart-group-padding.md`, which covers the space INSIDE a group.
done when — An author can set, with named steps rather than raw numbers (e.g.
            `tight` / `normal` / `roomy`):
              - the gap between shapes along the flow;
              - the gap between shapes across the flow;
              - the gap between groups.
            The defaults stay today's (`compact` keeps mapping to the tight step).
            The self-healing half: a setting that would push the chart's type below
            the floor falls back one step at a time toward tight before the type
            shrinks, and lint notes the fallback. The quality counts stay zero across
            the gallery at every step, and the demo deck shows the steps.
evidence  — The owner's review of #2385.
verify    — node --test test/unit/components/graph-layout.test.js; render
            examples/flowchart.md at each step and look.
