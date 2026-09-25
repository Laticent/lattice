---
origin: 2372
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2372
---

# Give the tour recorder a real host, and replay a recording on the docs site

why now   — LTT step 4 built `createTourRecorder`, `staleStretches` and `replayNarrator`
            (docs/src/lib/vetrina/recorder.ts), but no page wires `record`. Until one does, the
            recorder's only callers are tests and tools/verify-tour-recorder.mjs, and video export
            of a tour has nothing to read.
where     — docs/src/pages/vetrina.astro (the one page that runs a storyboard); the recorder's
            README section (docs/src/lib/vetrina/README.md §Recording a run).
done when — the page can record its tour to an .ltt.json, a committed recording replays through
            `replayNarrator`, and `staleStretches` runs against the page's storyboard in a test so
            an edited line flags its stretch.
evidence  — tools/screenshot.js at 1440, 820 and 390 px of the replay with the cursor on its word,
            plus the recording itself.
verify    — tier 1 checker, because it puts the recorder on a shipped page.
