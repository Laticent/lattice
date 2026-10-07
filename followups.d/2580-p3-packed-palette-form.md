---
origin: 2580
priority: P3
recorded: 2026-10-07
area: theming
severity: low
swimlane: engineering/decisions/2026-09-23-portable-packages.md
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

## Measured for the decision (2026-10-07, p11)

The candidate for (a) was prototyped and is **not published**. `tools/palette-slide-parity.js`
builds it into its output folder and runs the harness above (portable-packages note §10, "The
packed palette form, prototyped and measured").

| Decks | `render()` css | packed pair (candidate) | today's pair |
|---|---|---|---|
| six galleries, 51 slides, indaco | 51/51 | 51/51 | 0/51 |
| six galleries, 51 slides, cuoio-dark | 51/51 | 51/51 | 0/51 |
| two-slide panes deck, both palettes | 2/2 | 0/2 | 0/2 |
| quote gallery at `size: story`, first 7 slides, both palettes | 7/7 | 0/7 | 0/7 |

- **(a) publish `slides.css` + `palette/<name>.slides.css`.** Costs: about 25 lines in
  `tools/build-default-bundle.js`, two `exports` entries, a unit test, 1.5 MB unpacked, and a
  public contract that must keep matching the CLI. Limits, both by construction: 16:9 only, and
  no panes (their per-deck `lat-pane` twins cannot live in a fixed sheet). Buys: a page that
  renders once and swaps palette in the browser without rendering again.
- **(b) keep `render()` as the one slide path and delete this file.** Costs nothing. The one
  source of `article.lattice` slide markup in the package, `render()`, already returns a
  stylesheet that matches the CLI on 51 of 51 slides (the CLI writes its own flat HTML), so the
  packed pair styles markup that only arrives with a working stylesheet.

**Recommendation: (b)**, unless the owner names a consumer that needs the in-browser palette swap.
If (a) is picked, the build is the two loops in `buildPacked()` in the harness, moved into
`tools/build-default-bundle.js`; then change the harness's `packed` arm to link the files in
`dist/` and rerun it.
