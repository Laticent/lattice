---
origin: 2728
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# Firefox takes about 31 s to open the gallery player from disk

Measured on 2026-10-16 with Playwright Firefox: three loads of the 120-slide gallery `--player` file (2.7 MB) took 30,457–31,660 ms. Chromium loads the same file in under 1 s. The cause was not investigated. It was the same before and after #2728.

where — profile one load in Firefox. Candidates are the many large `data:` URIs, the `:has()` no-JS selectors, and the font block.
done when — the cause is named, and the gallery opens in Firefox within a few seconds or the note says why it cannot.
