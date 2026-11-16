studio: +499
playground: +4
home: +4
The Studio reads a `split: headings` slide part by part: the photo check reads the heading part on screen at its engine slide
(StudioShell, `flatPart`), and the slide strip and the map name each engine slide by the class it inherits (`slideClasses`,
docs/src/lib/deck-lint.ts, +135). `resolve-split` now ships as a chunk of its own rather than inside `deck-outline` (+694 and
-510). The part reader itself (lib/slide-carried.ts and the heading cut) loads with the photo verdict, not at startup: a first cut
imported it into the shell and cost 3,711 bytes, given back by moving the fix's part edit into photo-verdict.ts
(`applyFixInPart`). The 4 bytes on the playground and home routes are the engine's `holdLongSrc`, which keeps a pasted photo's
address out of the picture shortcut's record.
