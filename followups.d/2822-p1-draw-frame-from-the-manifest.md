---
origin: 2822
priority: P1
recorded: 2026-10-21
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md §5 D-B
---

# Let a plugin choose the sandboxed draw frame from its manifest

why now   — the draw frame is wired to two plugins by name, so a third library-backed plugin needs edits in about ten files
            and cannot ask for the frame itself. The owner asked whether future plugins can choose it.
where     — lib/packages/draw-frame-core.mjs (`DRAW_KINDS`, the per-kind bootstrap), lib/plugins/draw-shims.mjs,
            tools/build-plugin-registry.js (`renderDrawFrameLibraries`, the Mermaid-only preload list),
            docs/src/lib/preview-draw-host.ts (`KINDS`), preview-draw-host-impl.ts (the per-kind sanitizer and dispatch),
            docs/src/lib/code-packages/draw-host.ts (`DrawJob`), docs/src/lib/render-engine.ts (the warm-up),
            single-slide-render.ts and deck-preview.js (the Mermaid-only preload skip).
done when — a plugin manifest declares a `draw` section (library entry and kind of build, whether it needs `'unsafe-eval'`,
            the sanitizer profile, the words that warm it, and an optional frame-side adapter file), and adding such a plugin
            touches only its own folder; Mermaid and function-plot are re-expressed that way with byte-identical output.
evidence  — a throwaway third plugin (for example a small chart library) drawn in the Studio preview with no edit outside its folder;
            the Mermaid and plot e2e arms and the draw-frame integration tests pass unchanged.
verify    — tier 2 trio: it changes the boundary's policy surface. Open question for the owner: should third-party (npm) plugins ever
            get a frame with a DOM, or stay in the DOM-free worker pool?
