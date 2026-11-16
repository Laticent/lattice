---
origin: 3259
priority: P1
recorded: 2026-11-16
area: engine
severity: high
swimlane: engineering/decisions/2026-11-16-cenno-popover-library.md §11
deferred: blocked — the owner confirms §10 items 5 to 7 (byte budgets, author switch shape, Studio migration) before slice 1; the build is five slices, too large for the design PR
source: https://github.com/Laticent/lattice/pull/3259
---

# Build Cenno and chart detail cards in the exported player

why now   — the exported player ships every chart's detail templates and opens none of them; the owner wants hover, tap and keyboard detail cards in the player, on by default, drawn by our own zero-dependency popover library.
where     — new `docs/src/lib/cenno/`; new `lib/runtime/chart-reveal/` (the framework-free half of `docs/src/playground/chart-interact.js`); `lib/export/player-core.mjs` (inline the kernel and Cenno only when the deck has `template.chart-detail`); `docs/src/components/chart-detail-layer.tsx` (onto `@laticent/cenno/react`); `lib/cli/options.js` (`--strip-chart-details`).
done when — the five slices in the decision's §11 have landed: Cenno core with its parity suite and byte budget; the player Present view; Studio, Playground and Present on the shared kernel; the Read view, viewer button, author switch and demo deck; the mark.
evidence  — `node dist/lattice.js examples/chart-detail-reveal.md out.html --player` keeps 13 detail templates and 51 marks, and no player code opens them. The spike places identically to Floating UI on 5,000 seeded cases in Chromium, WebKit and Firefox at 1.0 KB gzipped against 6.9 KB.
verify    — `node engineering/decisions/2026-11-16-cenno-popover-library/spike/harness.mjs --engine webkit` (and chromium, firefox); then, per slice, the real player in Chromium and WebKit with dark and light exports sent for the owner's sign-off.
