---
origin: 2705
priority: P3
recorded: 2026-10-16
area: theming
severity: low
swimlane: engineering/cascade.md
source: https://github.com/Laticent/lattice/pull/2705
---

# Nine `:where(.lattice-exporting) section…` arms are dead in the live preview

why now   — The engine's packer (lib/engine/css.js packSelector) treats only a literal leading
            `section` as the slide, so an arm written `:where(.lattice-exporting) section.x …` packs
            to `article.lattice > section :where(.lattice-exporting) section.x …`, a section
            inside a section. Nine such arms sit in base.finish.css, base.modifiers.css,
            split-panel.styles.css and split-compare.styles.css (`grep -rn
            ":where(.lattice-exporting) section" lib`). Each has a sibling arm
            (`section.finish.lattice-exporting …` and the like) that probably covers the Studio's
            raster export, but nobody has confirmed that. Found by the checker on the
            catalog-follow-ups PR, which fixed the same trap in a finish's panel reset. Not caused
            by that PR.
where     — the four files above; lib/engine/css.js packSelector. The guard in
            test/unit/engine/css-scope.test.js only catches a leading `:where(section…)`.
done when — each arm either matches in the packed sheet (rewritten to lead with `section`, or
            proven redundant and removed), and the guard is widened to any packed
            `section :where(…) section`.
