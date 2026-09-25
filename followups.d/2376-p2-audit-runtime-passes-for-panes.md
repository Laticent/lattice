---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# runtime passes keyed to `section.X` do not see a pane

why now   — about 17 passes in lib/runtime select `section.<component>`, and the sketch
            rough-ink pass (lib/core/rough-ink.js:170-184) is `section`-only, so a pane gets
            no ink under `mode: sketch` and no runtime-built structure (Mermaid in a pane is
            untested).
where     — lib/runtime/**, lib/core/rough-ink.js.
done when — each pass either walks `:is(section, lat-pane).X` or is shown not to apply to a
            pane, and a Mermaid diagram renders in a pane on the CLI and in the Studio.
evidence  — decision note §6.4; red-team nit 6 on PR #2376.
verify    — a sketch deck with a table pane (inked) and a diagram pane, CLI + Studio.
