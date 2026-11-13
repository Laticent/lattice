- The Studio no longer freezes after a deck with phone photos lands in the editor. Every reader of the deck skipped
  nothing: the lint, the Coach, the engine's render and the preview's checks each walked every character of each photo's
  base64. They now skip it and put it back in what they return, so findings, fixes and exports are unchanged; the
  editor shows each photo's data as a small chip with its size; and the editor's lint and the Coach's assessment run off
  the page's thread. On a deck of three phone photos in Firefox, the longest freeze fell from 29 s to under 1 s after
  pasting it, and from about 6 s to about half a second after a keystroke (about 1.5 s when the keystroke is on a
  photo's own line).
- Every docs page that loads the engine downloads 4.7 KB less (gzipped). The engine carried the whole typed-glyph table,
  advice text included, for one question it asks of it; it now carries only the set of glyphs, built from the same table.
  The table moves to the Studio's lint, which loads later.
- The Share dialog's PDF options no longer show the Resolution control twice for a 4K deck. Two of its controls shared one
  React key, so a re-render could keep a stale copy beside the new one, and the Download button sat under it.
