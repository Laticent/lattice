- **Added: every overwrite of a saved theme, component or finish keeps the version
  it replaced, and a Library card can restore one.** #1873 shipped the in-place
  edit — a Library "Edit" button and an id-pinned Save — while the version-history
  kernel it was built alongside had zero production callers, though that module's
  own docblock says history "is what makes that overwrite safe to offer at all". A
  card that has history now says so in its metadata line; the link opens an
  **Earlier versions** list and restoring one brings the stylesheet back
  byte-identical. Restoring is itself an overwrite, so it checkpoints the current
  state first — a mis-clicked restore is recoverable from the same list.
- **Fixed: a `.zip` import that lands on a name you already use no longer replaces
  your asset without a trace.** The store dedupes by kind + name when the caller
  passes no id, so importing a bundle whose theme shared a name with one of yours
  silently overwrote your CSS. That save is now snapshotted as "Before import".
- **Fixed: deleting an asset takes its version history with it**, by every route —
  the Library card, the Inspector's two trash buttons, and the Workspace "Clear
  library" sweep — and opening the Library reclaims any version left stranded by a
  route that skipped it.
