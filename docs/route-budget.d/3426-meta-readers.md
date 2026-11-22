studio: +1672
playground: +511
home: +880
Slice A of the clean break to `@meta` (engineering/decisions/2026-10-17-meta-record.md §15): the Studio's Coach, Present's step wait and the map rail now read a slide's class through the shared reader (`scanMetaSource`, `readMetaField`, `classEntries`) instead of a `_class` regex, so a deck written in `@meta{…}` records reads as one in comments; the shared reader was already in the Studio's eager graph, and what grew is its chunking plus the Present and Coach call sites. Given back first: the Playground's and the home page's class reader is a dynamic import (`loadClassReader`, it was +21 KB gz as a static one), and the picker's prefix read moved into that lazy chunk, so the numbers above are the measured upper bound before that last move.
