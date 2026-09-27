---
origin: 2402
priority: P3
recorded: 2026-09-27
source: engineering/decisions/2026-09-26-studio-panel-lazy-loading.md § Warming Present, Fabricate and the reading view
---

# A diagram never rendered online shows its source offline

```text
  P3 · decide whether the Studio should warm the Mermaid bundle for offline use
       why now   — /playground/v/<hash>/export/mermaid-v11.min.js (877KB gz) loads only when a
                   render first needs it, and the service worker caches it only then. Offline,
                   any diagram the browser has never rendered since the last deploy falls back
                   to its source text. Seen on Fabricate's Diagram specimen offline.
       where     — docs/src/playground/deck-preview.js and single-slide-render.ts (where the
                   bundle URL is built); docs/src/components/studio/studio-warm.ts › startStudioWarmUp.
       done when — the note records a rule (warm when the deck on screen has a diagram, as the
                   KaTeX provider does for math; or never, with the bytes argued), and the rule
                   is implemented if it warms anything.
       evidence  — docs/e2e/studio-warm-offline.spec.ts extended with a diagram deck.
       verify    — tier 1; real Chromium on the built site.
```
