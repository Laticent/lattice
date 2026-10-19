---
origin: 2782
priority: P2
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# Add a picture-in-picture map rail to the Playground, driven by Veduta and Fuoco.

```text
  why now   — the Playground now takes its filmstrip window from Veduta (19a5a50), so the next
              proof is a second window over the same list. Chosen before the Studio on purpose:
              the Playground is where the prototype and the filmstrip rule already live.
  where     — docs/src/playground/deck-render.js, docs/src/components/playground/PlaygroundApp.tsx;
              the Playground has no Fuoco use today (walk/reconcile track focus), so wire it first.
  done when — a rail of wireframe and live tiles beside the filmstrip, one focus shared with the
              walk, first/last/prev/next, at desktop, tablet and phone widths.
  evidence  — real-browser screenshots at 1440, 820 and 390 px; playground e2e green; iOS Safari
              marked UNVERIFIED unless run.
  verify    — maker-checker (blast radius: the Playground's preview path).
```
