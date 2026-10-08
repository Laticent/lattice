studio: +7
No Studio code changed: the CLI rename (lattice-emulator.js -> lattice.js) touched only comments in
Studio sources, which the minifier strips. The 7 gzipped bytes are the content-hashed chunk names
that the comment edits re-hashed, as referenced from the eager bundle.
