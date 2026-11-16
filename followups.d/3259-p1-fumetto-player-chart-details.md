---
origin: 3259
priority: P1
recorded: 2026-11-16
area: export
severity: high
swimlane: engineering/decisions/2026-11-16-fumetto-popover-library.md §11
deferred: blocked — the owner confirms §10 items 4 to 7 (name, byte budgets, author switch shape, Studio migration) before slice 1; the build is five slices, too large for the design PR
source: https://github.com/Laticent/lattice/pull/3259
---

# Build Fumetto and chart detail cards in the exported player

why now   — the exported player ships every chart's detail templates and opens none of them; the owner wants hover, tap and keyboard detail cards in the player, on by default, drawn by our own zero-dependency popover library.
where     — new `docs/src/lib/fumetto/`; new `lib/runtime/chart-reveal/` (the framework-free half of `docs/src/playground/chart-interact.js`); `lib/export/player-core.mjs` (inline the kernel and Fumetto only when the deck has `template.chart-detail`); `docs/src/components/chart-detail-layer.tsx` (onto `@laticent/fumetto/react`); `lib/cli/options.js` (`--strip-chart-details`).
done when — the five slices in the decision's §11 have landed: Fumetto core with its parity suite and byte budget; the player Present view; Studio, Playground and Present on the shared kernel; the Read view, viewer button, author switch and demo deck; the mark.
evidence  — `node dist/lattice.js examples/chart-detail-reveal.md out.html --player` keeps 15 detail templates and 51 marks, and no player code opens them. The spike places identically to Floating UI on 5,000 seeded cases in Chromium and WebKit at 1.0 KB gzipped against 6.9 KB.
verify    — `node engineering/decisions/2026-11-16-fumetto-popover-library/spike/harness.mjs --engine webkit` (and chromium); then, per slice, the real player in Chromium and WebKit with dark and light exports sent for the owner's sign-off.
