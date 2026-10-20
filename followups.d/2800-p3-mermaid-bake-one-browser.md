---
origin: 2800
priority: P3
recorded: 2026-10-20
source: https://github.com/Laticent/lattice/pull/2800
area: diagram
severity: low
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md
---

# Bake Mermaid without a browser of its own.

why now   — The owner's speed rule (2026-10-20) is no browser start that can be avoided. A deck with Mermaid
            still starts one for the bake (lib/plugins/mermaid/shared/render-worker.js, a child process,
            because `lattice.js` renders while its module evaluates and cannot `await`), and its PDF, PNG
            or PPTX export then starts the capture browser as well. `main` does the same, so #2800 added
            no launch; this is the saving that is left.
where     — lib/plugins/mermaid/shared/render-worker.js; lattice.js (the bake call and `renderExport`).
risk      — The bake runs before the export's browser exists, and it decides the SVG the `.html` ships.
            Moving it later changes the order of the pipeline, so every Mermaid export must stay
            byte-identical (32 / 32 diagrams and the three example decks' PDFs, as #2800 checked).
done when — a Mermaid deck's PDF export starts one browser, and every Mermaid export is byte-identical
            and no slower.
