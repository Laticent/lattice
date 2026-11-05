studio: +200
playground: +200
home: +200
`isValidUrlToken` (lib/core/css-ref-reader.js) is now a one-pass scan instead of a regex, because JavaScriptCore gave up on a `url()` token of about half a megabyte and answered false, so Safari's picture export dropped an inline photo's drawn-size shrink (#3036, export-photo-size.spec.ts in webkit-tablet). The reader sits in the `remote-ref` chunk every route loads eagerly: measured in CI at +153 B gz on each of the three routes; declared with headroom for gzip spread. Nothing else in the PR grows an eager route: the picture camera's own reader rides the export chunk, and its PNG/JPEG writers moved to their own module so the encode worker stays at its old size.
