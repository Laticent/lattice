playground: +877
home: +1364
components: +599
getting-started: +599
The ESM engine's loaders ride the site shell: engine-base.ts (the one place that knows the engine's
asset directory, which the KaTeX, grammar and plugin-data loaders now read instead of a script tag),
the warm-up's chunk prefetch from esm/chunks.json, and on the preview routes ensure-charts.ts with
its chunk-load message, plus the same-origin and file-name checks on every
engine asset address. Each route was already at or past its soft target on main, so every byte
is declared. The same PR takes 179KB gz off the Studio's startup JS and 221KB gz off the engine every
one of these routes loads (engineering/decisions/2026-10-14-engine-spine.md §6).
