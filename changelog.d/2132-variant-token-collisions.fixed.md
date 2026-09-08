- **Fixed: three component stylesheets no longer reach slides they were never written for.**
  A component is selected by its id as a bare class and a variant is a second bare token on the
  same attribute, so a variant token that collides with a component id pulls that component's
  sheet onto the slide. `decision.styles.css`, `quadrant.styles.css` and `bullet.styles.css` now
  carry `:where(:not(.compare-prose))` / `:where(:not(.radar))` / `:where(:not(.list))` on every
  selector that owns their id — the same zero-specificity guard `stats` already had. Measured
  against the built bundle, `compare-prose decision` went from 16 matching selectors to 6 and
  `radar quadrant` from 3 to 1, and what remains in both cases is a recipe the variant owner's own
  sheet declares deliberately for both components. All six affected slides render pixel-identical
  at 150 DPI, so nothing that leaked was load-bearing.
- **Fixed: the collision gate was reading almost none of two of the sheets it certifies.** Its
  selector filter required `section` to start the compound or follow a combinator, and the chart
  family anchors its rules on `:is(section.<name>, figure.chart-frame)` — so the check saw 7 of
  quadrant's 37 owning selectors and none of bullet's 11.
