- **Fixed: Cadenza, Suono, Lente and Vetrina now typecheck in a TypeScript consumer using
  `moduleResolution: nodenext`.** Their published types are their source, whose relative imports
  had no file extension, which nodenext rejects (56 TS2835 errors across the four packed
  packages; now 0). Every relative import names its `.js` file, as `@laticent/ltt`'s already
  did, and a test packs all five libraries and typechecks them in a nodenext consumer. The
  Cadenza README no longer says it publishes in lockstep with `@laticent/ltt`: nothing
  publishes the libraries yet.
