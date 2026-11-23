---
origin: 3459
priority: P3
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — a product render order found by a test-only PR, which did not cause it
source: https://github.com/Laticent/lattice/pull/3459
---

# A deck set right after saving a component renders once without the component's CSS

why now   — #3459 fixed `share-saved-packages.spec.ts:100`, which read this frame and went red under load. The test
            now waits for the styled render; the Studio still paints the unstyled one first.
where     — `docs/src/components/studio/StudioShell.tsx`: saving a component calls `refreshComponents`, which lists the
            components from IndexedDB asynchronously; the preview takes the component's CSS from that list
            (`usedLocalCss` → `previewExtraCss`). A deck set before the list lands renders without the CSS, then again
            with it.
done when — after a save, a deck that uses the saved component never paints without its CSS: the save puts the new
            record in `localComponents` at once (it already has it in hand), and the IndexedDB list only confirms it.
evidence  — a probe on main 84bb0806e (×10 at four workers): 9 runs read the outline `solid` on the first render, 1 read
            `""` and turned `solid` 565 ms later. Reaching it takes a whole deck set inside the save's refresh window.
verify    — read the outline on the FIRST render after `saveProbes` with no poll, ×20 at four workers: 0 reads of `""`.
