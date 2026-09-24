---
origin: 2348
priority: P2
recorded: 2026-09-24
---

# obligation-matrix narration ignores the author's label set

why now   — A label set `[{[x], In force}]` renames the obligation-matrix key, but narration still reads each cell as "applies", so the slide and the voice disagree — the exact key-versus-content contradiction the six-state-marks work set out to remove. Roadmap already threads the label set into its cells.
where     — `lib/transformers/prose-projection.mjs:1091` (`WORD_MAPS['obligation-matrix']`) and `stateWordOf` (~1110-1124) read fixed words; `lib/transformers/label-set-key.js` builds only the key. Compare `lib/components/chart/roadmap/roadmap.transform.js:188` (`cellLabelFor`).
done when — Narration of an obligation-matrix slide with a label set speaks the renamed word for each cell, on both render paths, with a unit test that fails without the change; the sentence in `docs/src/content/docs/guides/status/marks-in-layouts.mdx` §"Rename the words with a label set" that scopes this to roadmap is widened.
evidence  — Fact-check on #2348 traced the narrator: no label-set lookup exists for obligation-matrix.
verify    — Prose projection of the obligation-matrix label-set lab slide in the guide reads "In force", not "applies".
