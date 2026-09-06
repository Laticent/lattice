- **Fixed: edits typed in the last moments before leaving the Studio are no longer lost.**
  Editor writes ran on a 400ms debounce, and leaving the page *cleared* that timer
  rather than running it — so the browser's back button, a bookmark or a closed tab
  dropped whatever you had just typed. The deck now writes through on `pagehide` and
  on a hidden `visibilitychange`.
- **Fixed: a deck you only looked at is no longer saved as if you had edited it.**
  Opening the Studio and leaving wrote a stored source for the active deck. That row's
  existence is what tells Lattice a deck carries edits, so it pinned a built-in sample
  to the copy shipped the day you first visited — later releases' improvements never
  reached it — and it armed the "back up your work" nudge for people who had done none.
- **Fixed: the Studio's top bar can no longer be left hidden after a phone keyboard
  closes.** The bar collapses while you type on a phone; nothing cleared that state if
  the window then widened to a desktop layout, leaving the Studio with no top bar and
  no way to bring it back.
