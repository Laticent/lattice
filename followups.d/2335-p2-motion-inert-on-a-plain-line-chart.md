---
origin: 2335
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2335
---

# `motion-on` does nothing on a plain line chart

why now   — the render proof found `line` draws no motion target: `line.transform.js` emits `data-mark` only on the per-category hit rect, and only where the author wrote a detail bullet, while the motion host needs `svg [data-mark]` (`docs/src/playground/anima-host-sel.ts` `hasAnimatableChart`). So `motion: on` animates every other chart and silently skips a line chart without detail bullets. The editor now hides `motion-*` on `line`.
where     — `lib/components/chart/line/line.transform.js` (~line 955, the `hits` map); `docs/src/playground/anima-host-sel.ts`.
done when — a plain line chart animates under `motion: on` (a mark the host can drive, independent of detail bullets), and `npm run check:modifier-effects -- --only=line --bless` records `chart-marks` for `line`.
evidence  — `lib/core/modifier-effects.generated.json` has no `chart-marks` for `line`; PR #2335.
verify    — render a line-chart slide with `motion: on` in the Studio preview and watch it build.
