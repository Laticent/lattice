studio: +830
playground: +4
home: +8
The Studio reads a `split: headings` slide part by part: the photo check reads the heading part on screen (StudioShell,
`partText` and `partStart`), and the slide strip and the map name each engine slide by the class it inherits (`slideClasses`,
docs/src/lib/deck-lint.ts, +405: the scan and the per-slide cut of pasted photos that keeps it from reading a
photo deck on every keystroke). `resolve-split` now ships as a chunk of its own rather than inside `deck-outline` (+694 and
-510). The part reader itself (lib/slide-carried.ts and the heading cut) loads with the photo verdict, not at startup: a first cut
imported it into the shell and cost 3,711 bytes, given back by moving the fix's part edit into photo-verdict.ts
(`applyFixToSlide`). The 4 bytes on the playground route, and 4 of home's 8, are the engine's `holdLongSrc`, which keeps a pasted photo's
address out of the picture shortcut's record. The other 4 on home are DeckPreview's parked-preview key, which now follows a move between heading parts.
Measured with docs/scripts/measure-route-base.sh against origin/main: studio +809 here, and CI has read a dozen bytes more than
a local build of the same tree, so the line carries +830.
