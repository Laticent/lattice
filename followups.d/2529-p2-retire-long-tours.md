---
origin: 2529
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2529
---

# Retire the four long tours once Building and Polish lessons land

why now   — owner ruling 2026-10-05: keep `first-look` as the showcase, fold `walkthrough`,
            `board-deck`, `just-markdown` and `quiet` into lessons. They stayed in #2529 because
            Coach and light/dark have no lesson yet.
where     — `docs/src/components/studio/tours/*`, `studio-actions.ts`, `use-studio-demo.ts`;
            e2e `demo.spec.ts`, `demo-mobile.spec.ts`, `vetrina-geometry.spec.ts` (drives
            `quiet`); the Show Me menu in `StudioShell.tsx`.
done when — Building (charts, tables, comparisons, images, notes) and Polish (Coach, Fix all,
            Reshape, light/dark) lessons exist; the four tours are deleted; `StudioActions` is
            retired into the action list; Vetrina's engine loads with `import()` on first lesson
            or tour, with the Studio chunk size measured before and after.
evidence  — chunk bytes before/after; e2e green with the moved fixtures.
verify    — unit, build:check, the demo and lessons e2e specs.
