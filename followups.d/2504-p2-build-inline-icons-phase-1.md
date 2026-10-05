---
origin: 2504
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2504
---

# Build inline icons, phase 1 (host contribution points, then the icons plugin)

why now   — the design is settled (`engineering/decisions/2026-09-29-inline-icons.md` § Decided);
            only Segno phase 2 blocks it.
where     — 1a: lib/core/inline-code-directives.js (a table), lib/plugins/plugin.schema.json +
            resolver (`inline`, `services`, `registers`), lib/core/resolve-spark.js (the register
            factory). 1b: lib/plugins/icons/ (the package in the note's § 6a).
done when — marks, pills and sparks render byte-identically through the table; `^{…}` and the
            pill's `icon=` render on both paths; the `icon:` register works; a deck with no icon loads
            no icon data; examples/inline-icons.md + PDF ship; the owner signs off the dark and light
            exports; 1a has had the adversarial trio.
evidence  — the note's § 10 plan, phase 1; phases 2 (charts, incl. hub-spoke #2396) and 3 (Studio) follow.
verify    — rasterize the demo deck; `npm run build:check`; the bundle delta stated in the PR.
