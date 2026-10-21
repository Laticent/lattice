---
origin: 2780
priority: P3
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# Slim the npm tarball: minify the two bundles, drop duplicate fonts and Mermaid variants

why now   — the tarball is 24.1 MB gzipped and 80 MB unpacked; minifying every JS and CSS file measured 12.9 MB, and exact-duplicate fonts and three Mermaid bundles are another 3 to 4 MB.
where     — measurements and method: engineering/decisions/2026-10-18-on-demand-styles.md §10. dist/lattice.js (21.3 MB, 3.2 MB minified), dist/lattice-runtime.js (9.6 MB, 1.2 MB), lib/plugins/mermaid/vendor (zenuml, cli assets, TTF copies), dist/fonts and lib/plugins/math/vendor (byte-identical KaTeX and weight-named font copies). Keep the license comments; do not minify lib/ sources.
done when — npm pack --dry-run --json reports a smaller tarball, the integration tier passes with the minified CLI, and no public export (dist/lattice.css, dist/lattice-runtime.js) disappeared.
evidence  — npm pack size before and after; node lattice.js on the gallery deck with the minified bundle.
verify    — tier 1 independent checker: it changes what every install runs, and it renames font files the CSS names.
