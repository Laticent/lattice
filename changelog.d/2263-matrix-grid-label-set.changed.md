- **`matrix-grid` draws its cell key on the slide.** Its shape vocabulary shipped in a
  `STATE_LABELS` map rendered into a visually-hidden span — the words existed for a screen
  reader and for nobody looking at the slide, while a sighted reader got an unparsed prose
  sentence the author wrote by hand. The grid now names the shapes its cells actually carry,
  and draws no key at all when there is nothing to decode.
- **`[x]` is deliberately NOT keyed, and the manifest says why.** A filled cell's own
  trailing text is its label (`[x] Senior`), so the shape has no general name; a key row
  reading "filled" would repeat on every slide what the cell already says better. That
  refusal is declared in `labelSet.unkeyed` with its reason rather than left as an absence,
  so `lint:deck` can tell an author who keys `[x]` what is actually wrong instead of calling
  the key unknown.
- **The two keyable shapes can be renamed.** `reachable` / `not applicable` suit a
  capability rubric and not a coverage or eligibility grid, so they are now defaults,
  overridable with `` `[{[-], within reach}, {[ ], out of band}]` ``. The TWO-code axis
  eyebrow is untouched — two code spans in one paragraph is still the axis discriminator,
  and a one-code paragraph that is not a label set is left alone. Demo deck:
  `examples/matrix-grid-label-sets.md`.
- **The key's swatch shows the border treatment without asserting a row.** A matrix-grid
  cell is colored by its ROW's category rather than by its state, so a key cannot borrow a
  cell's color. The outlined swatch takes `--accent`, which is the cell rule's own fallback
  when no row hue is set; an earlier cut neutralized both swatches and, measured on the
  rendered gallery, the two read as the same box.
  (`lib/components/chart/matrix-grid/matrix-grid.styles.css`)
