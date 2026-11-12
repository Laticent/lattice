- The Studio no longer freezes after a deck with phone photos lands in the editor. Every reader of the deck skipped
  nothing: the lint, the Coach, the engine's render and the preview's checks each walked every character of each photo's
  base64. They now skip it and put it back in what they return, so findings, fixes and exports are unchanged; the
  editor shows each photo's data as a small chip with its size; and the editor's lint and the Coach's assessment run off
  the page's thread. On a deck of three phone photos in Firefox, the longest freeze fell from 29 s to under 1 s after
  pasting it, and from about 6 s to about 1 s after a keystroke.
