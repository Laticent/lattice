---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P3
---

# The runtime re-runs its whole-deck pass after every section patch

why now   — After #2456 it is the largest remaining per-keystroke cost in the Playground
            (`lattice-runtime.js` ~280ms self time over a 31-key burst at 4x throttle).
where     — `lib/runtime/index.js` `runAllContentTransforms`, driven by its MutationObserver.
            Shared kernel (HARD RULE #1), so maker-checker at least.
done when — a patch that replaces one section runs the transforms for that section only,
            with the deck-wide passes skipped when nothing deck-wide changed.
evidence  — a CPU profile A/B of the typing burst, same method as #2456's Performance table.
verify    — tier 1: runtime unit tests; tier 2: the Playground and Studio previews.
