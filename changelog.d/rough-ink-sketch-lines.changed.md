- **The `sketch` finish now draws its lines with rough.js instead of a tiled CSS wave.** Table
  frames and row rules, the `list-tabular` ledger, `list.principles` rules, the `hr` divider, an
  agenda's active row, and the masthead↔stage divider are all real seeded rough.js strokes,
  painted into one SVG overlay per slide. The old `--sketch-wave` was a single sine path tiled at
  140px — mathematically periodic, and applied per `td`, so a table rule visibly re-phased at
  every column seam while the frame around it stayed a smooth rounded rectangle. Strokes are
  seeded from each structure's key, so two renders of a deck are byte-identical.
- **Breaking (visual): the `sketch` heading underline is retired.** `section.sketch h2` no longer
  draws its own bent `border-bottom`. Every masthead slide carried two rules — that hand-drawn
  one under the words, and the machine-straight `1px solid var(--border)` masthead↔stage hairline
  below it. The band's rule is the structural one, so it is the one that now gets the hand, drawn
  in the sketch ink at a little over half strength. `rule-none` still draws nothing; `rule-short`
  and `rule-accent` get a short drawn segment where they used to get a perfectly straight one.
- **Table frames under `sketch` lost their asymmetric `border-radius` and offset `box-shadow`.**
  At table scale the radius read as a smooth rounded rectangle and the shadow as a material drop
  shadow. rough.js draws the frame now; layering the old fakes under it read as neither. Card,
  blockquote and bordered-row boxes are unchanged and convert in a follow-up.
- **The `thead` `--spectrum-structure` strip is replaced by ink on `sketch` tables.** A hand-ruled
  table now uses one pen throughout; the header row stays distinct through its label-voice type.
- **No-script documents keep the old tiled wave.** The ink is painted after layout settles, so a
  raw `.html` sidecar opened without the runtime falls back to the previous rules rather than
  showing none. PDF, PNG, PPTX and `--player` exports all carry the ink.
