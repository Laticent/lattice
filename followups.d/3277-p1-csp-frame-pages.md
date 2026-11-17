---
origin: 3277
priority: P1
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-site-discovery.md §2
deferred: large — an engine change to every preview-frame builder (HARD RULE #22's sanctioned builders), its own PR per #17; the owner chose to stage it after this one (2026-11-17)
source: https://github.com/Laticent/lattice/pull/3277
---

# CSP stage 2: cover the frame, eval and network pages

why now   — #3277 put a strict script policy on 75 of 203 routes. The other 128 carry none, for three reasons `docs/scripts/csp.mjs` names. FRAME (125: landing, Studio, Playground, the 80 component pages, docs pages with a "preview this" island): a same-origin `srcdoc` frame inherits its parent's policy, and the engine writes inline scripts into it at run time, some with per-deck values (`window.__SLIDE_W=1280…`); with a strict policy the Playground preview rendered blank. EVAL (1, /libraries/calco/): HarfBuzz's Emscripten bindings build functions from strings, so the PPTX export hung at "Embedding fonts…". NETWORK (2, /libraries/cadenza/ and /libraries/suono/): the voice code calls OpenRouter and Google and imports kokoro-js from esm.run.
where     — the frame builders `docs/scripts/csp.mjs` detects (`srcdoc` in a reachable module: `deck-preview`, `preview-draw-host-impl`, `door-run`, the generated `player-core` / `layout-core` / `theme-core` / `player-prune`, `sanitize-slide-html`); the inline scripts in a frame today: the settle/release guard, `window.__SLIDE_*` geometry, the fit script, the tile-open handler.
done when — FRAME: every script a frame runs is a same-origin file (per-deck values passed as a JSON data block or data attributes, which CSP does not govern). EVAL: the font subsetter runs in a same-origin worker (a page's <meta> policy does not reach a worker), or HarfBuzz is built with embind's DYNAMIC_EXECUTION=0. NETWORK: those two pages get a per-page `connect-src`/`script-src` allowance naming exactly their RUNTIME_ORIGINS. Then csp.mjs stops exempting, and `e2e/site-csp.spec.ts` covers all 203 routes, with Studio and Playground interactions driven under the policy.
evidence  — `docs/scripts/csp.mjs` header (the measurement); the trial in #3277's decision note §3.
verify    — `npm run build`, then `npx playwright test e2e/site-csp.spec.ts` on every project, plus the Studio smoke suite, with zero `securitypolicyviolation` events.
