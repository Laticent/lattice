---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Let a flowchart group lay its own shapes out tb or lr

why now   — The owner flagged it reviewing #2385. The chart's direction (`lr` / `tb`
            or automatic) applies to every group; an author cannot say "this group
            stacks its members top to bottom inside a left-to-right chart", as
            Mermaid's `direction TB` inside a subgraph can. dagre has one rankdir
            per graph, so a per-group direction needs the group laid out on its own
            and placed as one box.
where     — lib/core/flowchart-grammar.js (a span word on the group's row, e.g.
            `:tb` / `:lr`); graph-layout.js (lay a directed group out separately,
            size it, place it as a compound node, then route lines into it);
            flowchart.docs.md; lint-core.js.
done when — A group can pin its inner direction with one span word. By default it
            follows the chart. The choice heals: a pinned direction that would
            shrink the chart's type below what the other direction gives, or cannot
            fit the stage, falls back, and lint warns, the way `lr` on a portrait
            deck already falls back to `tb`. Lines into and out of such a group
            still meet the router's never-rules and quality counts (zero across the
            gallery and the fuzz corpora). The demo deck gains a slide that shows it.
evidence  — The owner's review of the #2385 typing deck.
verify    — node --test test/unit/components/graph-layout.test.js
            test/unit/core/flowchart-grammar.test.js; render the demo deck.
