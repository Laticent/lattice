- **Undo survives a reload in the Studio.** Reopen the Studio and ⌘Z undoes the edit you made
  before it. If the Studio saved text the history had not stored yet, it comes back as one step,
  "Unsaved changes"; if the deck changed outside the Studio (a restored backup, an import), that
  change is one step of its own, and the older steps apply only after it. If you edit the deck in
  the moment before the stored history loads, that session keeps its undo in memory and the stored
  history waits, untouched, for the next load. A second tab on the same
  deck keeps its undo in memory and says so, and Clear all and deleting a deck remove the history
  too. The history is stored in IndexedDB, capped at 50 MB across decks; the heavy work (shrinking
  a broad change to the lines that changed, checking a stored history) runs in a worker.
- **Undo and Redo buttons on a touch tablet.** An iPad with no keyboard now shows Undo and Redo in
  the Studio's top bar, as a phone does. After a reload, Safari offers its own undo (shake, the
  keyboard bar's undo key) only once the page has an undo list of its own, so before this an iPad
  had no way to reach the history that survived the reload.
- **One Edit → Undo on a Mac takes back one step.** Safari on macOS sends the Edit menu's Undo as
  two undo requests; the Studio now runs one and only refuses the other, where it used to
  take back two steps.
