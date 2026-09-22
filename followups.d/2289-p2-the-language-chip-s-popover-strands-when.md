---
origin: 2289
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2289#issuecomment-5767837535
backfill: true
---

# The language chip's popover strands when the deck scrolls under it

Backfilled verbatim from the continuation brief on #2289 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] The language chip's popover strands when the deck scrolls under it
       why now   — visible polish defect on the surface #2289 just shipped, and cheap.
       where     — docs/src/components/studio/code-controls.tsx (FencePicker
                   `anchorRect`) and the chip click handler in
                   docs/src/components/studio/ComposeView.tsx. The rect is captured at
                   click time via PopoverAnchor virtualRef because the node view is
                   rebuilt on caret move and the clicked button detaches — keep that,
                   and make the virtual ref re-measure the live node DOM per call.
       done when — opening the chip and then scrolling the editor keeps the popover on
                   its block (or closes it), at 1440 and 390.
       evidence  — docs/e2e/compose-fenced-code.spec.ts gains a scroll arm that fails
                   before the fix; tools/screenshot.js at 1440/390.
       verify    — tier 0 gates, because the blast radius stops at one component.
```
