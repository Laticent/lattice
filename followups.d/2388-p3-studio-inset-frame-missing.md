---
origin: 2388
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2388
---

# A Fabricate finish's Inset frame edge is missing in the Studio

Found by the independent checker while verifying the saved-finish export fix (backdrop-register.md
§4.9); not caused by it, since that fix does not touch `--fin-frame` or `box-shadow`. Probably the
same family as `2400-p3-gallery-frame-missing-studio-download.md` (gallery's frame, also
`--fin-frame`, missing from a capture). #2404 stopped the capture from erasing a section's
`box-shadow`, which should have fixed that one; this one also shows in Fabricate's own specimen,
so look at both together.

```text
  P3 · [no ticket] Inset frame edge not drawn in the Studio.
       why now   — a finish saved with Edge: Inset frame shows no frame in Fabricate's specimen
                   (screen and "Export preview") or in Share → Images, although the computed
                   `--fin-frame` is set. The CLI draws the frame.
       where     — the frame is a stacked inset box-shadow on the section (base.finish.css,
                   `--fin-frame`); something in the Studio's preview/capture drops or overrides
                   it. Start by comparing the section's computed box-shadow in the preview frame
                   and in the CLI page.
       done when — a saved finish with Inset frame shows the frame in the Studio preview and in
                   Share → Images, in light and dark.
       evidence  — Studio preview screenshot and exported PNG beside the CLI render.
       verify    — tier: Studio e2e, the saved-finish-export spec shape.
```
