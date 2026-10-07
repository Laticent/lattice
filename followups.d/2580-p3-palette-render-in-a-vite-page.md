---
origin: 2580
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2580
---

# Render a slide in a Vite page with a published palette, and match it to the CLI render

```text
why now   — #2580 published `@laticent/lattice/palette/<name>.css` and proved the recipe BUILDS in
            Vite 8.2.2 (docs/src/lib/published-palette.test.ts); nobody has looked at a slide that a
            Vite page renders with it. The token block is pinned equal to the one dist/lattice-default.css
            appends, so a difference would come from the page's `:root` versus the renderer's packed
            `section` scope, not from the tokens.
where     — a scratch Vite app importing `@laticent/lattice/css` + `palette/indaco.css` (and
            `palette/cuoio-dark.css`) and holding one rendered slide's HTML; README.md "Embed in a
            browser"; docs/src/content/docs/guides/themes.md "Using a palette in a web app".
done when — the Vite page's slide and the CLI's render of the same deck, light and dark, are compared
            with tools/pixel-check.js and either match or the difference is explained in the guide.
            Also: the same recipe measured with webpack, and README.md line ~334 ("fetches the Mermaid
            CSS section from the palette file") checked against lib/runtime, which reads tokens from
            computed style and fetches no theme file (a pre-existing claim #2580 found and left).
evidence  — tools/screenshot.js of the Vite page beside the CLI's PNG, tools/pixel-check.js output.
verify    — tier 1 checker, because it touches the published package surface's documented recipe.
```
