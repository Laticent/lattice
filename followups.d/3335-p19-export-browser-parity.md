---
origin: 3335
priority: P19
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new engine capability or preset, outside this design-only PR
source: https://github.com/Laticent/lattice/pull/3335
---

# V2-V4: export and browser parity for the new styles

why now   — V2 to V4: every new finish, mark and bookend composition is unverified outside the CLI PNG and PDF paths.
where     — PDF, PPTX, ODP (engineering/pipeline.md §3), export-to-Marp (lib/export/marp-bundle.js), the HTML player, the Studio preset tiles; Playwright Chromium, WebKit and Gecko in CI (D9).
done when — each new register renders correctly on every export and in all three engines, with artifacts from each surface; Studio screenshots at 390, 820 and 1440 px.
