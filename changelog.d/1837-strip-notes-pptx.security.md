- **Fixed: `--strip-notes` no longer ships the speaker note in the `.pptx`.** The PowerPoint
  writer received the notes array as authored rather than the stripped one, so the note
  survived in `ppt/notesSlides/*.xml` — the one format whose native viewer shows it to anyone
  who opens the file. Two sibling leaks went with it: a `--raster` or `--paper` render wrote
  the unstripped note to its `<out>.notes.txt` sidecar, and that run's log line reported the
  notes it had just removed.
