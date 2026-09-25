---
origin: 2376
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a pane that clips its content is silent, and the carve's warnings go nowhere

why now   — each pane clips at its own edge (lib/forms/cell/pane/pane.css), and a pane
            that overflows does not overflow its SECTION, so the slide-level overflow tab
            and `lint:deck` stay green while a table loses its last rows in the PDF. The
            carve also records warnings (`env.latticePanes[].warnings`: a whole-slide
            component in a pane, a bad `panes:` ratio, a third marker) that nothing reads.
where     — lib/core/panes.js (warnings), lib/authoring/lint-core.js (HARD RULE #7: the one
            home for lint rules), lib/core/overflow-probe.js (CLIP_CELL_SELECTOR already
            iterates `.cell-stage`, which each pane holds — check the export tags it).
done when — `lint:deck` reports the carve's warnings and a per-pane capacity check (the
            manifests' per-family budgets), and an export of a deck whose pane clips names
            the page, as it does for a clipped slide.
evidence  — adversarial-trio inversion on PR #2376 (path 2); the proof's own first demo
            slide clipped a list pane at a 192px stage.
verify    — a deck with an over-full table pane: `npm run lint:deck` warns, and the CLI
            export prints the page in its overflow warning.
