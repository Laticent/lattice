---
origin: 2710
priority: P5
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2710
---

# `npm run dev` cannot paint the Studio: Vite refuses to import ESM from /public

why now   — found while verifying #2710: the docs dev server refuses to import the ESM engine staged under /public, so the Studio never paints and every browser check has to go through build:e2e + preview:e2e (minutes per iteration). Pre-existing on main.
where     — docs/astro.config / Vite config; docs/scripts/sync-playground-assets.mjs staging.
done when — `cd docs && npm run dev` paints the Studio with a deck rendered.
evidence  — a screenshot from the dev server.
verify    — cd docs && npm run dev, open /studio/.
