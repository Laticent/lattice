---
origin: 2457
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# The Studio dev server cannot render any deck: `bg-image.js` has no default export under Vite

Found while #2457 verified split panels on the real Studio. `cd docs && npm run dev`, open
`/studio/`, and every preview shows "This preview couldn't render — The requested module
'/@fs/home/user/lattice/lib/core/bg-image.js' does not provide an export named 'default'."
The production build (`npm run build` + `astro preview`) renders fine, so this is the dev
server's CJS-as-ESM path, and it predates #2457 (`docs/src/lib/image-size-memo.ts:14`
imports `bgImage` default from a CommonJS module; last touched by #2412).

```text
  P2 · Studio dev server renders no deck (bg-image.js default import under Vite)
       why now   — the dev server is the documented visual loop (development.md
                   § Previewing the docs site); with it broken, agents fall back to
                   a full production build per iteration or skip the real surface.
       where     — docs/src/lib/image-size-memo.ts:14 and lib/core/bg-image.js
                   (module.exports shape vs Vite's dev-time ESM interop).
       done when — `npm run dev` renders the welcome deck in /studio/ with no
                   preview error, and the production build is unchanged.
       evidence  — a screenshot of /studio/ on the dev server, before and after.
       verify    — tier 1: run the dev server, load the Studio, look.
```
