- The last three chart labels that stayed machine-faced under `mode: sketch` now
  render in the hand face: the gantt date-axis tick (`.gantt-tick`) and the
  word-cloud key's heading and its more/less ends (`.wc-key-label`,
  `.wc-key-edge`). Re-scanned the computed `font-family` of every text run in
  every chart SVG across the chart gallery under sketch: **12 mono runs before,
  0 after** — the chart family is now hand-faced end to end.
- The gantt tick's layout math follows the face it paints. Its wrap budget and
  its collision cull are computed from a static per-character advance, and one
  constant cannot describe two faces — mono sets 0.720 per character whatever the
  string says, while the hand sans runs 0.561 to 0.889 over the same labels. The
  builder now selects `ADVANCE_HAND_TRACKED` (0.90) or `ADVANCE_MONO_TRACKED`
  (0.75) from the slide's `sketch` class, so the CSS and the measurement can no
  longer name different faces. Both constants were measured in a real browser over
  the closed set of labels `buildGanttTicks` can emit, none longer than `Jan '26`.
- A sketch gantt thins a crowded monthly axis one step further than the same
  chart off sketch. That is the hand face genuinely setting wider, not a padded
  constant: at ~24 units of tick spacing the hand's painted `Mar` leaves 1.7
  units of air, under the two the cull requires, so alternate months drop and
  the survivors keep their spacing. No label is ever ellipsized on either face.
- **The browser runtime now stamps the deck's `mode:`/`class:` registers before its
  first transform pass**, not one promise-tick after it, whenever the front matter
  is baked into the document (every Export-to-Marp bundle). It resolved the tokens
  inside a promise continuation, so the first pass read every section without them
  and leaned on a later re-run to converge — but that re-run is gated on the
  default-component rule reporting a change, so a deck whose slides all name their
  own component never got one. Latent until a transform's *geometry* keyed on a
  deck-wide token: a `mode: sketch` export built its gantt axis with mono advances
  and then painted it in the hand face. Marp stamps a native `class:` itself, which
  is why `mode:` was the register that broke.
- No visual change off `sketch`. The mono path is a strict no-op — the rendered
  body of the chart gallery is byte-identical before and after, and the
  word-cloud key needed no math change at all: both faces paint its tracked
  uppercase heading to the same width (mono 0.680 per character, the hand 0.675),
  so the existing bound still covers the wrap width and the divider rule.
