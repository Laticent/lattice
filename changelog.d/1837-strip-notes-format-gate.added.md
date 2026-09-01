- **Added: a per-format `--strip-notes` gate.** One deck is now driven to every row of the
  export format table, and to the flag variants that select a different write path, asserting
  the note is absent from every artifact produced. The case list is checked against the
  emulator's own table, so a new format that nobody covers fails the suite by name.
