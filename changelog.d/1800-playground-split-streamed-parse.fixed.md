- **Fixed: the Playground's editor pane no longer stretches across the window before the split
  lands.** The panes were sized pre-hydration with `flex-grow`, which divides the row between the
  children that have parsed — so while the streamed document had emitted the editor and the
  divider but not the preview pane, the editor took the whole row and then narrowed in view. On a
  slow machine that was ~170ms of visible reassembly. The absent pane's share is now reserved, so
  the editor is at its final width from its first paint. (The preview pane still arrives when it
  arrives — what this removes is the editor moving, not the wait for the other half.)
