---
origin: 2913
priority: P1
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md
source: https://github.com/Laticent/lattice/pull/2913
---

# Do not load or run the lint while the editor is hidden

why now   — the Playground's editor lints its draft at boot even in Explore, where the editor is not on screen: a 575 ms task at 4x
            CPU that loads the 279 KB lint core (note §9). A throwaway build that skipped it while hidden measured Playground TBT
            1,870-1,990 ms to 1,620-1,790 ms (4 runs each, local, interleaved), score +0 to +3.
where     — docs/src/playground/editor.js (`lintSource`); re-lint when the editor shows (`forceLinting` from @codemirror/lint).
decided   — W1 on the PR's decision card: default is to build this, and to measure time-sliced hydration without shipping it.
done when — the lint runs the moment the editor is visible (Edit view, phone edit pane) and never while hidden; Playground TBT lower on a
            CDN preview, 5 runs interleaved against the base preview.
evidence  — the Lighthouse table; a Playwright check that Edit-first loads still lint.
verify    — tier 1 checker: it changes every Playground load.
