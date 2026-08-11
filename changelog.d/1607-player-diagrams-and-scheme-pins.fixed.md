- **Mermaid diagrams now reach the exported `.html` player with their labels.** The player
  sanitizes its slide DOM, and that sanitizer bars both things a Mermaid SVG leans on: the
  `<style>` mermaid injects into it, and `<foreignObject>` — where every node, edge and cluster
  label lives. Every exported player therefore shipped diagrams as shapes and arrows with no
  words, on both the CLI and the Studio. Each diagram is now baked to a self-styled SVG with
  native `<text>` labels (`flattenSvgStyles(…, { foreignObjectLabels: 'text' })`) before
  assembly, so the sanitizer stays strict and the diagram still reads. Charts are deliberately
  left token-driven — freezing their computed colors would pin them to the export-time scheme
  and kill the player's own light/dark toggle.
- **The Studio's Share → Webpage export renders its diagrams at all.** The browser render leaves
  a ```` ```mermaid ```` fence as a `<pre><code>` for the runtime to inflate, and the player ships
  no runtime — so the exported file froze the un-rendered form: raw Mermaid source on the slide,
  and a wall of it where Read·Article should have shown the diagram. The Studio now bakes the deck
  through the shared capture frame first, the browser-side twin of the CLI's own player capture.
  Runtime-inflated components (state-chart, function-plot) are baked by the same step.
- **A dark-authored deck no longer goes blank when the player is toggled to light.** The player
  replaces `light-dark()` with static CSS, which erased Lattice's per-slide scheme pins — so a
  `color-mode: dark` deck viewed in light gave every slide light surfaces under `--text-display`,
  a constant `#FFFFFF`: title, divider and closing rendered white on white. `section.dark` now
  carries the dark values in both player schemes, `.light`/`.color-light` keep light values in
  dark, and `.print` keeps its own band (previously overridden in dark mode, printing `#111111`
  ink on a `#001D33` canvas).
- **`--strip-notes` strips notes again, and the Studio's webpage export keeps them.** Baking the
  deck through the capture frame put every slide through `sanitizeSlideHtml`, which deletes comment
  nodes — and the speaker-note, `describe:` and `caption:` channels ARE comments. So the export lost
  every note and accessible description, and, worse, the empty set left `stripNotesFromSource` with
  nothing to remove: a deck exported with **Strip speaker notes** on shipped the note text verbatim
  in its envelope. The channel is now lifted ONCE at the render boundary (`notesCore.slideNoteRecord`) and read from
  there, so nothing downstream depends on a comment surviving a DOM round trip. It is split
  DEPTH-AWARE: the flat splitter truncates a slide holding a hand-authored `<section>` at the nested
  close tag, dropping its comments while leaving the slide COUNT correct — so the loss passed a
  count-parity check unnoticed, and a first attempt at this fix still leaked on that deck shape.
  Note that the envelope manifest is base64-encoded, so the leaked note was invisible to a plain
  search of the exported file — only `parseEnvelope` sees it.
- **PowerPoint exports carry their accessible descriptions again.** The PPTX alt text was read
  out of the same sanitized capture frame, so a screen reader got `Slide 1` while the author's
  `describe:` text sat intact one step upstream. Same root cause as the lost notes; both now read
  a per-slide record lifted from the engine render, before any frame exists.
- **Speaker notes no longer ship as narration.** The narration bake was handed the RAW source, not
  the scrubbed one, and its chain reads the slide note — so a deck exported with **Strip speaker
  notes** ON *and* narration on shipped every note as visible caption text, and as synthesized
  audio the recipient could play aloud. Third channel, same flag.
- **A failed diagram bake is reported rather than swallowed.** It shipped the un-inflated fence in
  silence — the exact defect the bake exists to fix — and the two most likely failures (the bake
  returning nothing usable, and a slide-count mismatch) did not even reach the `catch`, because
  neither throws. All three paths now warn. The signal is still weaker than it should be: the
  status line is transient and the export's own completion toast still says the file is ready, so
  a durable failure indicator is outstanding.
- **`waitForDiagrams` waits for the fences the runtime has not reached yet.** It counted only
  existing `.mermaid` boxes, and an untagged fence has none — so on the very deck it exists to
  wait for it saw nothing pending and returned at once. It now gates on the runtime's own
  `data-mermaid-state`, which also makes the PPTX/PDF raster of a diagram-heavy deck less racy.
