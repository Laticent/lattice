studio: +400
playground: +400
home: +400
`remote-ref.js`, which these routes load on their eager path, now reads its URL table from the new `lib/core/media-sources.js` (six source rows, the `classify` and `isRemoteRef` functions, and `resolveRelative`), so its one predicate cannot drift from the resolver. CI measured +365, +366 and +366 bytes gzipped against main; 400 leaves room for gzip spread.
Given back first: nothing. The table replaced the `sample:` and `asset:` regexes in `remote-ref.js` and `bg-image.js`, which saved a few dozen bytes; the rest is the table itself, and a second table row costs about 40 bytes.
