---
origin: 2794
priority: P5
recorded: 2026-10-19
area: website
severity: low
swimlane: docs/route-budget.json
source: https://github.com/Laticent/lattice/pull/2794
---

# Decide whether the engine gets a `restyle()` hook, which needs room under `getting-started`'s engine ceiling

With the Playground style loader on, a deck that needs a style module the base lacks renders twice: once to
read the slides, once to compose the sheet with the new module (200 to 500 ms on a heavy deck). An engine hook,
`render().restyle()`, recomposed the sheet alone in 30 to 70 ms. It was built, tested and measured, then removed
from this PR: it adds about 70 bytes of gzipped engine JS, and `getting-started` is within 20 bytes of its
`engineJsGz` ceiling (317,145), so the docs build failed. Raising a ceiling is the owner's decision.

why now   — the loader is opt-in, so the cost is one extra render on a cold session with `?styles=modules`; it matters once the default flips (2794-p3).
where     — lib/engine/index.js (the hook), lib/playground/index.js (hands it through), docs/src/lib/playground-engine.ts (`renderInto` calls it); the PR's early commit "scan what the frame holds" (see `git log -S restyle`) has the working code and `test/unit/engine/restyle.test.js`.
done when — either the ceiling for `getting-started` `engineJsGz` is raised by at least 1 KB in its own PR and the hook returns with its test, or `main` frees 100 bytes of engine JS another way and the hook returns.
evidence  — `node docs/scripts/check-route-budget.mjs` after a docs build; the cold-session timing from `docs/scripts/style-loader-bench.mjs`.
verify    — tier 2.
