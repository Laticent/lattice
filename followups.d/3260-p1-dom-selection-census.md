---
origin: 3260
priority: P1
recorded: 2026-11-16
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — other specs; the flaky-test coordinator ruled no sweep in PR 3260
---

# Other e2e specs that set a DOM selection inside an editor

why now   — PR 3260 fixed compose-refine.spec.ts:92, which set a DOM selection and then waited on selection-driven UI before
            ProseMirror had read the browser's queued `selectionchange`. These specs set a DOM selection the same way
            (`setBaseAndExtent`, `addRange` or `selectNodeContents`). None of them is known to flake; each needs a look.
where     — docs/e2e/compose-fenced-code.spec.ts:230, compose-fidelity.spec.ts:57, compose-soft-break.spec.ts:41 and :69,
            studio-pane-sync.spec.ts:74, plugin-inline-ui.spec.ts:60 and :90, touch-chrome.spec.ts:35-36. Outside Compose
            (likely unaffected): math-compare-webkit.spec.ts:333, present-guide.spec.ts:118, preview-font-swap.spec.ts:117.
done when — each spec that waits on selection-driven UI after a DOM selection inside ProseMirror dispatches
            `selectionchange` synchronously right after it (as compose-refine.spec.ts `selectIn` does), or the spec is
            shown not to depend on ProseMirror reading the selection.
evidence  — compose-refine:92 failed about 1 in 790 under four CPU burners and the live device tier, and 1,000/1,000 after
            the fix. The gotcha is recorded in engineering/testing.md (PR 3254).
verify    — for each spec changed, the stress recipe from PR 3260: its project at --workers=4 with four CPU burners.
