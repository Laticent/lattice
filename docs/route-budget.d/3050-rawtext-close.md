studio: +360
playground: +350
home: +365
The RAWTEXT close rule (#2052, `tolerateRawtextClose` in `@laticent/markup`) ships with the boundary parser every live preview splits slides with: without it the preview would split `</style >` decks differently from the export, which is the defect being fixed. About 340 gzipped bytes on each route, the rule itself; the package is already `sideEffects: false`, so there is nothing to shake out. CI measured +344, +332 and +349; declared with a little room for gzip variation.
