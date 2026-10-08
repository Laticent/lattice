studio: +16
No Studio code changed: the CLI rename (lattice-emulator.js -> lattice.js) touched only comments in
Studio sources, which the minifier strips. The 7-8 gzipped bytes measured are the content-hashed
chunk names that the comment edits re-hashed, as referenced from the eager bundle; +16 leaves room
for gzip's byte-level variation between builds after a rebase.
