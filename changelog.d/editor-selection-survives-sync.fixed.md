- **The Source editor keeps your selection when the deck changes elsewhere.** A slide-settings or note
  write the Studio made while you held a range (a select-all included) collapsed it to a caret, so the
  next Delete removed one character instead of the selection. The whole range now maps through the write,
  and a range the write replaced entirely becomes a caret instead of an inverted selection.
- **A navigation that was waiting for the editor's text no longer lands after you have moved.** A slide
  reveal parked until the editor caught up (a restore after reload, a slide added and gone to) now yields to
  a click, a select-all or typing made in the meantime, instead of moving the caret out from under you.
