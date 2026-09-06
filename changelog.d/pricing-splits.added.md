- `pricing` now splits at portrait, square and other tall page shapes: an accent
  cover leads in, then each tier gets a page of its own carrying the component's
  own card — the featured flag, the accent border and the tinted fill all
  survive. Every page carries a derived `Option N of M · comparing …` signal, so
  the pages still read as one comparison. The `two` and `four` variants follow
  the same rule, and landscape is unchanged: a wide page still renders every
  tier in one row.
- **Fixes content loss.** At portrait an un-split `pricing` slide showed one tier
  of three with its text cut mid-word and roughly two thirds of the page blank.
  Nothing is lost now. See `examples/split-pricing.md`.
