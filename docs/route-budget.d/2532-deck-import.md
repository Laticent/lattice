studio: +48
The deck switcher's "Import deck…" row, its ⌘K command (the `import-deck` entry in the
command registry, with search keywords such as "pdf" and "powerpoint"), and the file
picker's accept list (every format the new importer reads) are eager Studio chrome. The
reader itself (`deck-import.ts`, `embedded-source.ts`, pdf-lib, JSZip) loads only when a
file is picked. Given back first: the old brand-launcher Import row is gone, and the accept
list lives in StudioShell rather than pulling the reader module onto the eager path.
Measured at +13 and +20 bytes before the rebase onto #2529 (gzip output shifts by a few bytes
as the bundle around it moves, with no eager change between those runs), and +33 after it,
when Import deck… became a registry command. This declares +48: the measured +33 plus room
for that drift.
