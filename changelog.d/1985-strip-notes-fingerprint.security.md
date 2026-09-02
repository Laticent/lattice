- **Security: `--strip-notes` no longer says which slides had notes.** The export used to
  remove each note's comment node from already-rendered HTML and leave the whitespace behind,
  so a stripped slide carried exactly one byte more than the same slide written without a
  note. The shared player ships the deck's own scrubbed source for re-import, so a recipient
  could re-render it, diff, and read off which slides carried a note (never what it said).
  The flag now scrubs the source and renders that, so the exported slides are byte-identical
  to a deck written without notes. Both export paths changed — the CLI and the Studio's
  Webpage export.
