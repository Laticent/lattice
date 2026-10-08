---
origin: 2549
priority: P3
recorded: 2026-10-07
area: website
severity: low
swimlane: engineering/decisions/2026-10-05-reopenable-exports.md
---

# The Library's "Drop to add" overlay can stay up after a cancelled drag

why now   — Found while building the shell's deck drop (§9 of the swimlane doc). Measured on
            Chromium: a cancelled drag (CDP `dragCancel`) delivers no `dragleave` to the page.
            The Library's overlay comes down only when its dragenter/dragleave depth counter
            reaches zero, so a drag cancelled over the Library would leave "Drop to add" up
            until the next drag. Pre-existing and off this PR's path, so logged, not changed.
where     — `docs/src/components/studio/Library.tsx` › `dropProps` (the `dragDepth` counter).
done when — the overlay comes down after a cancelled drag. `deck-drop.ts` › `useDeckFileDrop`
            has the pattern: hide on a `dragleave` whose `relatedTarget` is outside, plus a
            one-second dead-man timer on `dragover`.
evidence  — an e2e arm that opens the Library, sends a native drag in, cancels it, and asserts
            the overlay is hidden (`docs/e2e/deck-drop-import.spec.ts` › `nativeDrag` drives it).
verify    — tier 0. One component's overlay state.
