- **Fixed: the Playground's editor pane no longer flashes full-width before the split lands.**
  The panes were sized pre-hydration with `flex-grow`, which divides the row between the
  children that have parsed — so while the streamed document had emitted the editor and the
  divider but not the preview pane, the editor took the whole row and then narrowed in view.
  On a slow machine that was ~170ms of visible reassembly. The panes now take a percentage
  share of the container, which is the same width either way.
