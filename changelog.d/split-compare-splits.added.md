- `split-compare` now splits at portrait, square and other tall page shapes, on the
  owner's ruling: an accent cover carrying the question, then one option card per
  page, then the **recommendation on its own closing page**. The question rides
  every option page, because a comparison read one answer at a time needs the
  question beside each. See `examples/split-decision.md`.
- **Fixes content loss.** At portrait an un-split `split-compare` slide kept both
  option cards and pushed the `RECOMMENDATION` block — the slide's conclusion —
  off the page entirely, with no warning.
- New `compare-options` split strategy. `split-compare`'s transform builds
  `.option` divs rather than a list, so a plain item axis had nothing to slice and
  paginated an option's inner rows instead; this strategy reads the rendered shape
  the component actually produces.
