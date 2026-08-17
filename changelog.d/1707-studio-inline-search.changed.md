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
- **Fixed: opening the field could push the Present/Share tail off-screen.** Its
  minimum width was wider than the narrowest desktop row could pay, so at 1100 and
  1160 in Craft the row overflowed by 100px and 40px — and because the header's
  scroll valve is lifted while the field is open, that overflow could not be
  scrolled back into reach. The floor is now the measured break-even, and the field
  is still never narrower than the pill it replaces. `studio-header-fit` gained a
  guard that opens the search at six widths × three stops, since every previous
  overflow check measured the header idle.
- **Fixed: dismissing the search left focus nowhere.** The old overlay restored focus to
  its trigger on close; the inline field unmounted while focused and dropped focus to the
  document body, so Escape-then-Enter did nothing and a screen reader lost its place in the
  row. Escape now hands focus back to the pill — while a click elsewhere, or a command that
  moves focus itself, still keeps it where the user put it.
- **Tablet gets the same dropdown as desktop.** ⌘K no longer changes its
  presentation with the width: at tablet the centered overlay is replaced by the
  identical inline field and dropdown. Only the launcher differs — the tablet row
  has no spare width for a pill (measured 0px of slack from 700 through 834), so
  search is still reached from the ⋯ menu and ⌘K there. Phones keep the sheet,
  whose field docks above the keyboard.
- **Opening the search now hides the controls to its right** — appearance, tours,
  Present, Share, feedback — and gives that width to the field. Previously the
  field grew only into the row's leftover space, so the cost landed on the deck
  title (311px → 263px at 1440) and at tablet it could not grow at all. The deck
  title now keeps its full width at 1440 and above, and the field roughly doubles
  at the tightest desktop widths (220px → 561px at 1100). Everything returns when
  the search closes.
