---
origin: 2402
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2402
---

# The instant-shell portrait test flakes against the full production build

```text
  P3 · studio-instant-shell.spec.ts › "a rect from another orientation › is not replayed in portrait"
       why now   — it fails intermittently against `npm run build` (the build that adds
                   inject-modulepreload and hoist-stylesheets): 6 of 8 runs on main 133ac54,
                   4 of 8 on #2402's branch, each time "portrait slide box … left: shell 0 vs
                   app 16". It passes under `build:e2e`, which CI runs, so CI never sees it —
                   but production ships the full build, so the pre-paint shell may really
                   draw the portrait slide box 16px off after a landscape session there.
                   followups.d/2336-p3-packages-trio-followups.md records older rates (1 of 2, 1 of 4).
       where     — docs/e2e/studio-instant-shell.spec.ts:539; the pre-paint seed and shell
                   (docs/src/pages/studio.astro, the SSR shell script); the post-build steps
                   docs/scripts/inject-modulepreload.mjs and hoist-stylesheets.mjs.
       done when — the test passes 8 of 8 against `cd docs && npm run build` output, or the
                   difference between the two builds is shown to be a harness artifact and
                   the spec says so.
       evidence  — `npx playwright test --project=desktop e2e/studio-instant-shell.spec.ts:539
                   --repeat-each=8` against each build.
       verify    — tier 1; real Chromium via the e2e preview server.
```
