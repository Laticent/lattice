---
origin: 2344
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2344
---

# Square, tall and strip family layouts for four charts never apply in a browser preview

why now   — found by #2344's checker, and it predates that PR. In the CLI export these rules
            apply. In the Studio preview and the Playground they never do.
where     — lib/engine/css.js `packSelector`. Arms like `:where([data-family="tall"]) figure.kanban
            …` pack to `article.lattice > section :where([data-family…]) …`, but
            lib/engine/slides.js stamps `data-family` ON the section, so the packed form needs a
            stamped descendant that does not exist. 38 arms in dist/lattice.css (kanban, roadmap,
            timeline-list, matrix-grid).
done when — decide whether those arms are meant for the slide or only for the re-hosted figure.
            If for the slide, rewrite them in the attached form lib/adaptive/families.js asks
            for (`section.X:where([data-family=…])`); if for the figure only, say so where they
            live.
evidence  — jsdom, 2026-09-24: `<section data-family="tall"><figure class="kanban">…` matches the
            unpacked selector and not the packed one. Note that no slide emits `figure.kanban`
            today (0 on a portrait deck), so first check what these arms actually style.
verify    — a render of a portrait deck with each of the four charts, preview vs CLI.
