- **The Studio's ⌘K search is the header's own combobox, not a centered overlay.**
  At desktop widths (≥1100) the search pill now expands in place into the row's
  free space — 600px at 1440, 720px at 1920, up from a 180px pill — and the
  command list drops beneath it, anchored to the field. Typing filters live,
  Escape restores the pill, and clicking outside dismisses. Idle, the pill is
  unchanged, so the pre-paint skeleton still matches it control-for-control.
- **Fixed: the dropdown was clipped away by the search widget's own overflow.**
  Reaching outside the 54px header takes clearing two clipping contexts, and only
  one of them was the header's `overflow-x-auto` scroll valve. The other is
  `Command`'s base class (`overflow-hidden`, for its rounded corners), which cut
  the card off at the control it hangs from; the root had even been scrolled to
  73px trying to reveal the active item, which is what made the list appear to
  draw *inside* the bar. Corner clipping now lives on the card, which has the
  corners. The header keeps its scroll valve, and no test moved to e2e.
- The open field sits on the row's 32px control line (`BAR_CONTROL`) rather than
  11px above it, and no longer paints an opaque slab across its span of the
  translucent header.
- Below 1100 the search keeps its existing homes — the `CommandDialog` at tablet,
  the bottom-docked `PanelSheet` on mobile — so exactly one search surface exists
  at every width.
