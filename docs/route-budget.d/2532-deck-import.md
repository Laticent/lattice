studio: +32
The deck switcher's "Import deck…" row, its ⌘K twin, and the file picker's accept list
(every format the new importer reads) are eager Studio chrome. The reader itself
(`deck-import.ts`, `embedded-source.ts`, pdf-lib, JSZip) loads only when a file is picked.
Given back first: the old brand-launcher Import row is gone, and the accept list lives in
StudioShell rather than pulling the reader module onto the eager path.
Measured at +13 bytes on 6fe119f and +20 on 6f6c322 with no eager change between them
(gzip output shifts by a few bytes as the bundle around it moves), so this declares a
ceiling of +32 rather than chasing each run.
