- The Studio's markdown editor, slide rail, slide counter and live preview now stay in step
  through one focus hub (Fuoco, `docs/src/lib/fuoco`) instead of eight hand-written guards in
  the shell. An arrow key along a line no longer re-renders the Studio. Measured on a 123-slide
  deck against `main`, same machine: an arrow key's Event Timing drops from 24 ms to the 16 ms
  frame floor, a slide change reaches the rail in 15 ms (was 25) and the preview in 36 ms (was
  49), a rail click answers in 48 ms (was 76), and typing in a slide drops from 72 ms to 60 ms
  per key with less than half the long-task time (405 ms against 966 over 35 keys).
- A deck that splits on headings, the default, now counts the slides the PDF prints. The rail
  shows one pill per rendered slide, the counter and the deck chip count them, and the preview
  shows the heading the caret is under. Before, `# Title` with two `##` read as one slide and
  the preview only ever showed its first heading (#1570).
- After inserting, duplicating, deleting or moving a slide, restoring a version, applying an AI
  edit or appending a lesson slide, the editor lands on the slide the operation names once the
  new text is in place, rather than one animation frame later; Compose now follows these too.
- Plugin block rules declare `scansAhead` in their manifest: whether the rule decides by reading
  lines past the block it opens. `math`'s `$$` block does. The plugin resolver refuses a block
  rule without it.
- Fuoco is a standalone library, `@laticent/fuoco`, usable without Lattice: any text cut into
  units and parts (Markdown sections, transcript cues, code symbols, slides) through an
  outliner, with a general `createTextOutliner` and `byPattern` / `byHeadings` /
  `byBlankLines` splitters built in. Lattice's slide outliner is one adapter
  (`docs/src/lib/deck-outline`). A live demo with its own brand is at `/fuoco` on the docs site.
