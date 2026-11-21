studio: +38

The Studio's backdrop mask menus list the two new `backdrop:` keep-outs, `clear-footer` and
`clear-hero` (lib/core/resolve-backdrop.js). `BACKDROP_MASKS` in slide-provenance.ts gains the two
words (+11) and the deck and slide mask menus their two labels, "Clear the footer" and "Clear
footer and hero" (+27, StudioIsland). The words are the register's vocabulary and the labels are
what a person picks, so neither can be dropped or loaded lazily without losing the option.
