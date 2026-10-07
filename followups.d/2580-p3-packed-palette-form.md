---
origin: 2580
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2580
---

# Decide whether to publish a palette form that renders slides without the engine

```text
why now   — #2580 measured the published `@laticent/lattice/palette/<name>.css` next to
            `@laticent/lattice/css` in a Vite page against the CLI's render: 0 of 51 slides match.
            The engine CSS gives the slide no width and height, and a palette's `light-dark()`
            tokens resolve once on `:root`, so a `dark` slide keeps the light canvas.
            `render()` from `@laticent/lattice/engine` matched 51 of 51, so the docs now point
            slides there. A web app that wants slides without running the engine still has no
            stylesheet it can import.
where     — tools/build-default-bundle.js (writes dist/palettes/); lib/engine/css.js
            `packTheme` (the :root → section pack) and `scaffold` (the slide box); README.md and
            docs/src/content/docs/guides/themes.md "Using a palette in a web app";
            engineering/decisions/2026-09-23-portable-packages.md §10 (the 2026-10-07 measurement).
done when — the owner picks: (a) publish packed forms (engine scaffold + palette tokens scoped
            to the slide, e.g. `palette/<name>.slides.css`) and they match the CLI on the same 51
            slides, or (b) keep `render()` as the one slide path and close this file.
evidence  — the same harness as #2580: each slide screenshotted at 1280×720 and diffed against the
            CLI's HTML render with `compare -fuzz 3%`, indaco and cuoio-dark.
verify    — tier 1 checker, because it adds a published package surface.
```
