---
origin: 2705
priority: P3
recorded: 2026-10-16
area: theming
severity: low
swimlane: engineering/cascade.md
source: https://github.com/Laticent/lattice/pull/2705
---

# `:where(:root) { color-scheme: … }` in all 14 themes packs to a section inside a section

why now   — The packer turns `:where(:root)` into
            `article.lattice > section :where(:where(section):not([\20 root]))`, which needs a slide
            inside a slide. Every theme (indaco.css:59 and 13 more) writes it, so the preview may
            never get that `color-scheme` default. Found by the checker on the catalog-followups-2
            PR; whether another rule supplies it is unchecked. The css-scope guard misses it
            because the regex wants `section` right after `:where(`.
where     — themes/*/*.css (`grep -rn ":where(:root)" themes`); lib/engine/css.js packSelector;
            test/unit/engine/css-scope.test.js DEAD.
done when — each theme's rule matches in the packed sheet (or is shown redundant), and the guard
            catches nested `:where(`, `:where(.a) > section.x` and `.x section.x` shapes.
