- **Fixed: an exported player no longer reveals that a deck had speaker notes.** With
  `--strip-notes` the note text was already gone, but the player still answered the `n` key
  with a sheet reading "No notes for this slide." — telling the recipient the notes had been
  there. The button, the panel and the key now appear only when the file actually carries
  notes, which is also the honest chrome for a deck that never had any.
