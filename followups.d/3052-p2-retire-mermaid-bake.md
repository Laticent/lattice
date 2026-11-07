---
origin: 3052
priority: P2
recorded: 2026-11-06
area: diagram
severity: low
swimlane: engineering/decisions/2026-11-06-plugin-patterns.md §9
deferred: large — slice 1 of 5 shipped (the CLI's locked page opens Mermaid's module-loaded frame, plugin-patterns.md §10). Slices 2 to 5 (a capture-page driver for Mermaid's pass, `--html`/`--fluid` written from the drawn page, the image-set look re-drawn through the host, then deleting `bake`) move export bytes together and need one owner sign-off; together they are a redesign of the export's diagram path, not a slice. Owner decision 2 (retire `bake` once Mermaid leaves it) stands.
source: https://github.com/Laticent/lattice/pull/3052
---

# Mermaid's export still inserts its pictures before the engine runs

why now   — D2 slice 3 moved Mermaid's bake onto the fences the engine parses (`ctx.fences()`, lib/core/plugin-fences.mjs),
            so the export draws every fence the engine parses; 43 Mermaid decks export identically apart from
            Mermaid's own random ids. The bake itself remains: it draws in a locked page and splices SVG into the
            SOURCE before the engine renders, which is the one contribution point that rewrites a deck's text.
trace     — engineering/decisions/2026-11-06-plugin-patterns.md §10 has what the bake supplies each export, and the slices.
            There is no light/dark SVG pair (an earlier note assumed one): each fence is drawn once, in its slide's band.
where     — lib/plugins/mermaid/mermaid.bake.js, lib/plugins/host-bake.js, lib/export/locked-figures.js (the draw host
            slice 2 built for function-plot, which would take Mermaid's module-loaded frame), lattice.js's bake call.
done when — a Mermaid fence is drawn after the engine renders, through the CLI's draw host, themed for its slide as the
            preview themes it; `bake` has no user and leaves the schema; the 43-deck export differential holds; the two
            shapes the preview draws and the export does not (` ```mermaid-x `, a raw `<pre><code class="language-mermaid">`)
            draw in the export too, because it then finds figures in the rendered page by the runtime's own selector.
evidence  — the 43-deck export differential (masking Mermaid's random gitGraph and icon ids); dark and light renders.
verify    — tier 3 (export path): the adversarial trio, and the owner's export sign-off.
