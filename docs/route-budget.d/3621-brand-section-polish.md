home: +255
studio: +10
playground: +10

The "Your brand, on every deck" carousel now shows the line its heading names: a `theme:`
chip above the slide that updates as the palettes cycle, and the color-blind-safe palettes
grouped under their own label (PR #3621). Given back first: the first version also had a
per-slide Light/Dark switch and a `color-mode:` chip and cost 612 gzip bytes, which pushed
home past its hard ceiling in CI (323.8KB against 323.5KB). The switch and the chip went
(the site header's light/dark toggle already re-renders the slide), and the swatch fills
moved out of the island into index.astro at build time. Measured locally with the gate's
own `measure()` against this branch's base (`af35eb3`): 330,413 B on main, 330,648 B with
this PR, +235 B; declared with 15 B of headroom for gzip variance between builds.

Studio and playground (and 5 of home's bytes): lib/theme/chain.mjs now default-imports
lib/core/css-tokens.js and destructures `cssImports`, because Vite's dev server cannot serve
a named import of a CommonJS file with its own require(), and every live slide on the home
page rendered blank under `npm run dev` (engineering/gotchas/docs-site.md). CI measured
the shared chunk that carries it at +5 B on each route.
