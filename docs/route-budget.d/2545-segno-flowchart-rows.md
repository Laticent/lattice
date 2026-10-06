studio: +2310
Flowchart and state-chart rows are now read by a parser Segno generates from a grammar
(lib/core/flowchart-row.generated.js, Segno phase 3b), and the Studio's live lint is lint-core,
which reads rows through it, so it ships there by design (HARD RULE #7). It replaces the
hand-written readArrow/splitRow scan, whose bytes are gone. Given back first: Segno's code
generator no longer writes an attempt's failure explanation where nothing calls it (four
functions in this parser, 91e71e9). The figure is CI's measure at c3a8ff5, before that.
