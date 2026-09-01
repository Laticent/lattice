- **Fixed: an exported player no longer advertises that a deck had speaker notes.** With
  `--strip-notes` the note text was already gone, but the player still answered the `n` key
  with a sheet reading "No notes for this slide." — telling the recipient the notes had been
  there. The button, the panel and the key now appear only when the file actually carries
  notes, which is also the honest chrome for a deck that never had any.
- **Fixed: the shared-file manifest no longer records whether `--strip-notes` was used.** Its
  `notes` field was set from the FLAG, so a deck that never had a note reported `true` and only
  a stripped one reported `false` — a one-bit answer, in plain base64 at the bottom of a file
  you email to someone, to "were there notes here?". It now describes the artifact: a stripped
  deck and a note-free deck both report `false`. Applies to the CLI export and the Studio's
  "Download as webpage" alike.
