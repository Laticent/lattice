- **Changed: the Studio's preview sub-bar is shorter on a phone, and its two pills
  are one size.** The bar dropped the word "Preview" below 700px — the pane switcher
  directly above it already says which pane is showing, so the label was ~72px of
  duplication, and losing it is what stopped the reader-view pill truncating to
  "Full de…" at 390px. The reader-view pill is now sized to the `Slide N / M`
  counter it sits beside (`px-2 py-0.5`, 12px) instead of standing ~9px taller, at
  every width including the narrow pane where it collapses to its icon. Together
  those take the phone's sub-bar from 47px to 38.2px and hand the difference to the
  slide. The two-pane tiers keep the label and their 45px bar, where the "Collapse
  preview" button sets the height.
