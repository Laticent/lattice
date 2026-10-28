---
origin: 2921
priority: P1
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md
source: https://github.com/Laticent/lattice/pull/2921
---

# Do not mount CodeMirror while the Playground editor is hidden in Explore

why now   — after the lint gate (§11) and the lazy picker index (§12), the largest single piece left in the Playground's
            748 ms hydration task is `EditorHost`'s mount effect: `createEditor` costs 171 ms at 4x CPU, 108 ms of it
            CodeMirror's `EditorView`, on every Explore load where the editor is not on screen. The Playground's bar is
            Lighthouse mobile 60; it reads 45 by median on the CDN today.
where     — docs/src/components/playground/EditorHost.tsx (the mount effect); PlaygroundApp.tsx readers of `editorRef`
            (`getSource`, the Explore-to-Edit switch, `onEditorReady`); playground-tour.js (targets `#editor-host`).
decided   — nothing yet. Every reader of the editor must work while it is unmounted, or wait for it.
done when — an Explore load creates no `EditorView` until the editor is shown or the browser is idle; Edit-first loads
            unchanged; Playground TBT lower on a CDN preview, 5 runs interleaved.
evidence  — the long-task table of note §12 re-run; the CDN Lighthouse table.
verify    — tier 2 maker-checker at least: it changes when the editor exists on every Playground load.
