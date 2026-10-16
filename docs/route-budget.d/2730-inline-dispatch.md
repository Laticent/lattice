playground: +5
home: +13

The inline-code dispatcher's first-character table, Segno's `refuses`, and the plain-record parser
Segno now generates from its grammar (followup 2718-p3) ride the engine code these routes load. Most
of each figure is the playground asset version: the engine's bytes changed, so the
`/playground/v/<hash>/` string every eager chunk carries changed too, and a different string gzips a
few bytes differently (followup 2718-p5). The generated parser itself lives in the engine, which
these routes load lazily (engineJsGz, well under its soft target). Studio measured −5 bytes and owes
nothing. In return, ordinary inline code costs less than half what it did per span.
