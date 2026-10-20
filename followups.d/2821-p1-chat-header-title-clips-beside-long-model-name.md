---
origin: 2821
priority: P1
recorded: 2026-10-20
area: website
severity: medium
swimlane: engineering/decisions/2026-10-20-chat-transparency.md
source: https://github.com/Laticent/lattice/pull/2821
---

# On a phone the chat header's "Chat" title is clipped to "C" beside a long model name

```text
  P1 · [no ticket] The mobile chat sheet's header title is squeezed to a clipped "C"
       when the model chip carries a long name.
       why now   — the owner hit it testing #2813's preview on an iPhone (the screenshot
                   at 7:11, streaming, $0.00). #2813 put the model chip and the session
                   figure into the header's actions slot, which is what takes the room.
       where     — `ModelChip` in docs/src/components/studio/ChatCost.tsx
                   (`max-w-[10.5rem]`) against the shared `PanelHeader` in
                   docs/src/components/ui/panel.tsx, whose title is `truncate`.
       done when — at 390 px, with a model named like "Anthropic Claude Sonnet 4.5",
                   the title shows "Chat" in full, or is dropped on purpose, and the chip
                   still names the model.
       evidence  — a `tools/screenshot.js` capture at 390 px with that model name. The
                   e2e mocks a model called "Test Model", which fits, so it cannot
                   reproduce this. Measure the title's width before choosing a cap.
       verify    — screenshots at 390, 820 and 1440 px; PanelHeader is shared chrome, so
                   look at one other panel header too.
```
