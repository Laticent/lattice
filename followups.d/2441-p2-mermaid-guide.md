---
origin: 2441
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2441
---

# A Mermaid diagram gets no Guide walk, and one inline edge label silences its narration

Found on #2441's storyboard deck (examples/guide-storyboards.md, slide 9). The owner asked whether
this was a regression of the Mermaid narration work (2026-07-13-mermaid-diagram-narration.md). It
is not: the gallery's diagram slide still narrates its flowchart in full. Two separate gaps:

why now   — (1) NARRATION. `parseConnector` (lib/core/chart-narration.js, `CONNECTORS`) reads
            `A -->|Yes| B` but deliberately not Mermaid's equally valid inline form
            `A -- Yes --> B` / `A == Yes ==> B` (the comment above `CONNECTORS`: "unused in
            practice", and the only ReDoS-safe regex bars `-` from the label). One such edge makes
            `parseFlowchart` bail, so the WHOLE slide narrates only its heading. Measured: the
            storyboard slide narrated `How a signal becomes a decision.` and nothing else; rewritten
            with `-->|Yes|` it narrates the whole flow.
            (2) THE WALK. Even when narrated, a diagram's reading is one `frame` span over the whole
            flow: `narrateDiagram` binds no node, and Lattice stamps nothing on Mermaid's SVG for a
            `node` unit to resolve (the flow archetype's `[data-mark]`). So restrained never focuses
            a node, expressive brackets the whole figure once, and somber has no key beat.
where     — (1) `CONNECTORS` / `parseConnector` in lib/core/chart-narration.js: a linear-time
            scanner (not a regex) for `-- label -->` and `== label ==>`, or, short of that, skip the
            label and keep the edge rather than bail the diagram.
            (2) `narrateMermaidFence` → per-node `said(..., { act: 'visit', unit: 'node', id })`
            spans; a post-render stamp of `data-mark` on Mermaid's node groups from the parsed
            source (verify Mermaid's own node ids survive the render first). Tracked more broadly
            in `followups.d/2415-p2-scene-gaps.md` (diagram, flowchart).
done when — the storyboard deck's slide 9 in its original `-- Yes -->` form narrates the whole flow,
            and under each delivery the Guide focuses each node as it is named (restrained), inks it
            (expressive), and lands one beat on the key node (somber).
evidence  — the narration text before and after; a storyboard sheet of slide 9 per delivery.
verify    — tier 1 checker: the connector scanner is ReDoS-sensitive (CodeQL `js/redos`).
