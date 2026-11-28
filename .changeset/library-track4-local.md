---
---

The Studio Library gives decks their own Decks section, so a kept `.lattice`, PowerPoint, Lattice PDF or Markdown deck no longer hides under Files.

A Markdown file with no slides is still notes and stays under Files; the Decks section uses the import's own slide test, so the two never disagree. An import of only decks opens on Decks. Decks and Files each have an empty state that says how to add one. Design §7 of `engineering/decisions/2026-11-22-local-first-drive-storage.md`, slice 4; takes over `followups.d/3356-p1`.

In the docked Library and on a phone, the section pills are now icons, each named by its label for a screen reader and in a hint on keyboard focus, so all six fit one row on a 320px phone. The 720px sheet keeps the words beside the icons. The row never refolds under the tap that picks a section, and at the dock's 280px minimum the least used sections fold into a More pill that shows the picked section's icon.

The Library header gains a Backup and restore button that opens the same controls as Workspace settings in a dialog, so the escape hatch sits one tap from where your things are kept. Both places share one component, so their copy and behavior cannot drift.
