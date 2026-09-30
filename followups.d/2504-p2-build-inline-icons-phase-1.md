---
origin: 2504
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2504
---

# Build inline icons, phase 1 (registry, kernel, `^{…}`, pill `icon=`, `icon:` register)

why now   — the design is settled (`engineering/decisions/2026-09-29-inline-icons.md` § Decided);
            only Segno phase 2 blocks it.
where     — lib/icons/ (curation.json, own/*.svg, icons.generated.js), tools/build-icons.js,
            lib/core/inline-icons.js, lib/core/resolve-spark.js (made a shared factory).
done when — `^{…}` and the pill's `icon=` render on both paths, the `icon:` register works,
            examples/inline-icons.md + PDF ship, and the owner signs off the dark and light exports.
evidence  — the note's § 10 plan, phase 1; phases 2 (charts, incl. hub-spoke #2396) and 3 (Studio) follow.
verify    — rasterize the demo deck; `npm run build:check`; the bundle delta stated in the PR.
