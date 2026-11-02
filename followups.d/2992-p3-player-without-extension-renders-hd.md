---
origin: 2992
priority: P3
recorded: 2026-11-02
area: engine
severity: low
swimlane: engineering/pipeline.md
deferred: off-path — red on main (379917f) with the same numbers; PR 2992 changes no canvas code, and with an `.html` output both main and the PR render the 4K player at 3840 x 2160
source: https://github.com/Laticent/lattice/pull/2992
---

# `lattice deck out --player` with no extension renders a 4K deck's player at HD

```text
  P3 · [no ticket] an extensionless --player output takes the PDF canvas default
       why now   — tools/verify-player-input.mjs fails "4K: the deck keeps its OWN canvas in the player"
                   (1280px x 720px, expected 3840px x 2160px) on main and on PR 2992 alike. It renders
                   `lattice.js examples/gallery-jargon.md .scratch/out/player-size-4K --player`, with no
                   extension, so lattice.js picks OUT_FORMAT 'pdf' (OUT_FORMATS default) and
                   lib/core/export-canvas.js lowers a 4K deck to HD for the PDF. The player then ships that
                   canvas, though export-canvas.js says the player is never lowered. The same deck to
                   `out.html --player` measures 3840px x 2160px.
       where     — lattice.js OUT_FORMAT (no extension falls back to 'pdf' even when --player is set),
                   lib/core/export-canvas.js RASTER_FORMATS
       done when — an extensionless --player output keeps the deck's own canvas (decide the format from
                   --player before the extension default), and verify-player-input passes all four canvases.
       evidence  — node tools/verify-player-input.mjs: the 4K canvas row PASS.
       verify    — tier 1 checker.
```
