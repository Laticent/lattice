- **Changed: the Studio's preview sub-bar is shorter on a phone, and its two pills
  are one size.** The bar dropped the word "Preview" below 700px — the pane switcher
  directly above it already says which pane is showing, so the label was ~65px of
  duplication, and losing it is what stopped the reader-view pill truncating to
  "Full de…" at 390px. The reader-view pill is now sized to the `Slide N / M`
  counter it sits beside (`px-2 py-0.5`, 12px) instead of standing ~9px taller, at
  every width including the narrow pane where it collapses to its icon. Together
  those take the phone's sub-bar from 47px to 38.2px and hand the difference to the
  slide. The two-pane tiers keep the label and their 45px bar, where the "Collapse
  preview" button sets the height.
- **Fixed: the Studio's pre-paint shell no longer misplaces the slide box for readers who
  raise the browser's minimum font size.** It reserved space for the preview sub-bar and the
  slide navigator from numbers measured once at the default size, while the bands themselves
  grow with the reader's text — so the slide jumped at hand-off, by up to 13.4px on a laptop.
  The shell now measures what the browser does to a 12px element and grows both bands with it:
  0.59px at a 24px minimum, and 0.61px at a 14px one, which no root-font-size reading could
  see. The phone keeps the frozen model — its action bar is a third fixed band whose error runs
  the other way, and correcting only the other two made the phone worse.
