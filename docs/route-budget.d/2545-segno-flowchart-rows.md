studio: +2400
Flowchart and state-chart rows are now read by a parser Segno generates from a grammar
(lib/core/flowchart-row.generated.js, Segno phase 3b), and the Studio's live lint is lint-core,
which reads rows through it, so it ships there by design (HARD RULE #7). It replaces the
hand-written readArrow/splitRow scan, whose bytes are gone. CI measured +2310 against main at
c3a8ff5 and again at 91e71e9: dropping the parser's four unused functions in 91e71e9 gave nothing
back, because the minifier already removed them. The rest is headroom for gzip noise in shared
chunks as main moves.
