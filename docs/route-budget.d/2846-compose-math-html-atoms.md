studio: +40
playground: +12
home: +12
CI measured studio +23, playground +4 and home +4 bytes of eager JS against main; the declared figures leave room for gzip spread. The growth is a few bytes in `slide-boundaries` (it imports `deck-source`, which now calls `withoutModeledBlocks`) and in the Studio island's `nodeViews` and open-editor wiring for the new math and raw-block nodes. Everything large stays lazy: the raw-block parser rules ride the Compose chunk, and `RawPanel`, `math-draw` and the KaTeX bundle load only when a math or HTML node is drawn or opened.
Given back: the math drawing uses the engine's existing on-demand KaTeX bundle instead of a second copy.
