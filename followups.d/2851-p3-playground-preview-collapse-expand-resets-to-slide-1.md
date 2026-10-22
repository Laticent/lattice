---
origin: 2851
priority: P3
recorded: 2026-10-21
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md
source: https://github.com/Laticent/lattice/pull/2851
---

# Collapsing and expanding the Playground preview on desktop always returns it to slide 1

why now   — found by a checker on #2851 with a control run that made no Edit/Explore switch: the preview was on slide 20, the reader collapsed the preview and expanded it, and it was on slide 1.
where     — docs/src/components/playground/PlaygroundApp.tsx `onPreviewExpand` (a deferred render takes `freshRender()`, which writes a new document at the top) and the collapsed-pane render deferral (`previewCollapsedRef`, `pendingWhileCollapsedRef`).
done when — expanding the preview puts it back on the slide it was on (or the caret's slide in Edit), with no wrong-slide frame; the same cover and open-at-target idea as #2851.
evidence  — the frame probe (every animation frame: pane, scroll, slide shown) before and after, and a real-browser spec that collapses and expands.
verify    — collapse, expand, and collapse during an edit, on desktop; Chromium, Firefox and WebKit.
