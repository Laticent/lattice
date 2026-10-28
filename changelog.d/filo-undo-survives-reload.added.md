- **Undo survives a reload in the Studio.** Reopen the Studio and ⌘Z undoes the edit you made
  before it. If the Studio saved text the history had not stored yet, it comes back as one step,
  "Unsaved changes"; if the deck changed outside the Studio (a restored backup, an import), that
  change is one step of its own, and the older steps apply only after it. An edit made in the
  moment before the history loads is kept as one step on top of it. A second tab on the same
  deck keeps its undo in memory and says so, and Clear all and deleting a deck remove the history
  too. The history is stored in IndexedDB, capped at 50 MB across decks; the heavy work (shrinking
  a broad change to the lines that changed, checking a stored history) runs in a worker.
