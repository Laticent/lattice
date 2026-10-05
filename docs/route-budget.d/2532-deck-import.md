studio: +13
The deck switcher's "Import deck…" row, its ⌘K twin, and the file picker's accept list
(every format the new importer reads) are eager Studio chrome. The reader itself
(`deck-import.ts`, `embedded-source.ts`, pdf-lib, JSZip) loads only when a file is picked.
Given back first: the old brand-launcher Import row is gone, and the accept list lives in
StudioShell rather than pulling the reader module onto the eager path.
