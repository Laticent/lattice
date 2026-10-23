---
origin: 2852
priority: P2
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# Tags and pills in the office export are not resizable shapes with text inside.

```text
  P2 · [no ticket] Tags and pills in the office export are not resizable shapes with text inside.
       why now   — the owner's desktop check: tags (card-tags) look right but dragging a handle does not grow or shrink
                   them with their text; a tag should be one shape that carries its own text and resizes with it.
       where     — docs/src/lib/calco/reader.ts (shape + text frame pairing for inline-block pills), pptx.ts and odp.ts
                   (write the text inside the shape, with autofit/size-to-text) rather than as a shape beside a frame.
       done when — a tag is one native shape holding its text; dragging a handle resizes the shape and the text stays inside;
                   verified in PowerPoint and Collabora.
       evidence  — card-tags exported, a tag selected and resized in each app.
       verify    — tier 1 maker-checker (shape model change).
```
