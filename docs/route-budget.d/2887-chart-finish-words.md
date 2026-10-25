studio: +80
playground: +200
The chart-finish register's words (the default, the three finishes, the two intensities) now live in a small module, `chart-finish-words.ts`, that the editor's completions, the slide drawer and the playground's snapshot cache share; CI read +78 B gz for it in a shared chunk. The playground also gains the snapshot cache's finish-mark test, which drops a finish rule whose marks are absent from the slide, now that every slide wears a finish class (+101 B gz on `PlaygroundIsland`). The figures cover gzip spread on this head.
Given back first: the first cut imported `lib/core/resolve-chart-finish.js` into three eager modules, +994 B gz on the playground and +19 on the studio; the words module replaced all three imports.
