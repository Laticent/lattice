- **`obligation-matrix` and `matrix-2x2` split at the presentation sizes**, reversing their
  `atomic` placements (owner's call). Landscape is untouched in both cases.
  - `obligation-matrix` gets `compare-table`'s reshape: each regime row becomes a card whose
    column headers become in-card labels. Measured first: 9 of 10 pages of its own gallery were
    bad at portrait (8 ringing, 1 clipping). A row slice was tried and rejected on the
    measurement — it took the gallery to 43 bad pages, because slicing rows does not narrow six
    columns. It declares no authoring `capacity` band: the component's own sample and stress doc
    both hold six regimes, which its stress summary calls "the grid ceiling", so any band that
    admits the sample admits the ceiling.
  - `matrix-2x2` paginates one quadrant per page. The retired note's objection still stands for
    an unadorned slice; what answers it is that the quadrant's own label IS its position on both
    axes (`High impact · Low effort`) and every page carries an `Option N of 4` rail.
- **`obligation-matrix`'s state marks are painted on a split page.** Every `.state` rule was
  scoped `td .state`, so on a card page the disc reached the DOM and nothing styled it — a GDPR
  card rendered as Notice / Consent / Retention / Breach / DSAR with nothing beside any of them,
  and no gate could see it because every word was conserved. The selectors are widened to
  `:is(td, .ct-card dd)` rather than copied, and the field list becomes a grid on a split page so
  the discs align in one column instead of tracking each label's width.
