---
origin: 3197
priority: P2
recorded: 2026-11-13
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — did not reproduce locally (0 of 68 webkit-phone runs, including 4 workers with CPU load); needs a nightly failure with a trace
source: https://github.com/Laticent/lattice/pull/3197
---

# setEditorContent's Delete left one character after select-all on webkit-phone

why now   — the Studio e2e nightly of 2026-11-13 12:35 (run 43426447331, webkit-phone shard 7) failed
            share-narration-rate-limit.spec.ts:40 inside the shared helper: "setEditorContent: the Delete after
            select-all left text behind" (1,695 of the 1,696-character welcome deck). A screencast frame shows the
            caret moved to line 14 between the select-all and the Delete.
where     — docs/e2e/studio-fixture.ts setEditorContent; suspected source docs/src/components/studio/Editor.tsx:867
            (`revealFocus` landing a late caret move from the pane sync). Unproven.
done when — the cause is shown (a trace of a late selection change) and setEditorContent waits for that signal
            (or writes the content without a select-all), with the HARD RULE #34 evidence.
evidence  — the nightly trace in that run's shard-7 artifact; a repro that turns red.
verify    — tier 0 gates plus the #34 runs; it changes a helper every Studio spec uses.
