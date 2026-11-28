playground: +1

The Playground's deck sheet writes the renamed `drawing:` key (renames Q5) where it wrote `mode:`; the longer
word in `deck-config.js` costs 1 gzip byte. Studio gives 7 bytes back. Measured by CI's docs-build on #3639.
