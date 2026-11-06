---
origin: 3049
priority: P2
recorded: 2026-11-06
area: diagram
severity: low
swimlane: engineering/decisions/2026-11-06-plugin-patterns.md §9
deferred: large — retiring `bake` means drawing Mermaid AFTER the engine renders, in the capture page through the draw frame; the capture page does not run the runtime's Mermaid pass, which is what themes each diagram for its slide's band, so the theming would move into the CLI's draw host — a redesign of the export's diagram path, not a slice. Owner decision 2 (retire `bake` once Mermaid leaves it) stands; Mermaid has not left it yet.
source: https://github.com/Laticent/lattice/pull/3049
---

# Mermaid's export still inserts its pictures before the engine runs

why now   — D2 slice 3 moved Mermaid's bake onto the fences the engine parses (`ctx.fences()`, lib/core/plugin-fences.mjs),
            so the export draws exactly the diagrams the preview draws; 43 Mermaid decks export identically apart from
            Mermaid's own random ids. The bake itself remains: it draws in a locked page and splices SVG into the
            SOURCE before the engine renders, which is the one contribution point that rewrites a deck's text.
where     — lib/plugins/mermaid/mermaid.bake.js, lib/plugins/host-bake.js, lib/export/locked-figures.js (the draw host
            slice 2 built for function-plot, which would take Mermaid's module-loaded frame), lattice.js's bake call.
done when — a Mermaid fence is drawn after the engine renders, through the CLI's draw host, themed for its slide as the
            preview themes it; `bake` has no user and leaves the schema; the 43-deck export differential holds.
evidence  — the 43-deck export differential (masking Mermaid's random gitGraph and icon ids); dark and light renders.
verify    — tier 3 (export path): the adversarial trio, and the owner's export sign-off.
