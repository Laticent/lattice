---
origin: 2822
priority: P2
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md §5 D-B
---

# Run the editor's Mermaid syntax check in the draw frame, not the Studio page

why now   — measured in #2822: on the first edit the Studio page loads `mermaid.min.js` (857 KB) for its own syntax checker
            (`mermaid-parse`), about 360 ms of main-thread time, in about 40% of runs, before and after the draw-frame change.
            The frame already holds Mermaid, so a second copy and its pause are avoidable.
where     — docs/src/lib/mermaid-parse.ts and its callers; the draw host (a `parse` job kind) and draw-frame-core.mjs.
done when — the Studio page never loads `mermaid.min.js`; the editor's diagnostics come from the frame with the same messages.
evidence  — 10 interleaved runs per path (first diagram, redraw, bytes); the redraw spread narrows to the no-parser case (about 650 ms).
verify    — checker: the diagnostics' wording and line numbers must match the in-page parser on the lint corpus.
