studio: +100
playground: +160
home: +100
`webRefsInCss` (lib/core/remote-ref.js, a chunk every route loads) now remembers its last answer so a keystroke does not rescan the theme sheet, which costs about 34 ms; the playground also carries the preview-collapse reopening in PlaygroundIsland (a held-render flag and a `syncRef.collapsed()` call). Measured in CI against main: studio +76, playground +132 (remote-ref +76, PlaygroundIsland +56), home +76; the declared figures leave room for gzip spread. Given back first: the memo is one slot with no eviction logic, and the pending-render ref it replaced was deleted.
