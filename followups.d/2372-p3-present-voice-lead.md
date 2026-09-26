---
origin: 2372
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2372
---

# Check whether Present's caption also leads Kokoro's voice by its leading silence

why now   — the exported player now skips each clip's own leading silence (`speechOnsetMs` in
            docs/src/playground/narration-encode.js, folded into `leadMs` by the bake). Measured on
            2026-09-26 in the real exported player (Chromium, real playback, the first 8 Kokoro
            clips of test/fixtures/q3-board-review.md): its caption led the voice by 297–370 ms
            before and 6–10 ms after. Present plays the store's uncompressed clips
            through Suono and anchors each cue on the clip's playback onset, not its speech onset,
            so it likely still lights each caption ~0.3 s before a Kokoro voice speaks. Not measured.
where     — docs/src/components/studio/read-aloud.ts (`onItemStart` → `reader.align`); Suono's onset.
done when — Present's caption start is measured against the voice's speech onset on a Kokoro deck,
            and either it is within one frame or the anchor adds the clip's `speechOnsetMs`.
evidence  — a timing of one voiced sentence in live Present, before and after.
verify    — tier 1 checker, because every Present session shares the anchor.
