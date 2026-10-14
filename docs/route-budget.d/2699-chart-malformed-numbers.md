studio: +1500
playground: +50
home: +50
CI measured, on 1d7964a against main: Studio +1439 B of eager JS, gzipped; Playground +1 B and Home +2 B (the lenient reader's U+2212 line, which every route that renders a chart carries).
- **The Studio's lint.** The live lint is lint-core itself, and it now carries `chart-value-malformed` (a chart value shaped like a number but not one) and the `VALUE_CHARTS` list it is scoped to.
- **The number reader.** Segno's `readNumber` gained the strict `NUMERIC` shape and `malformedNumber`, which says why a value is refused; lint-core and the chart kernel share it, so it ships once.
Given back first: nothing was cheaper to move. The rule must live in lint-core (HARD RULE #7, one lint kernel for the CLI, `validate()` and the Studio), and the reader is the one both lint and the charts read (HARD RULE #1), so neither can be split off the Studio's startup path.
