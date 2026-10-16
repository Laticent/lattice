studio: +60
playground: +16
home: +24
Two small code changes reach eager chunks, and CI measured +25 / +1 / +11 B gz against main. `rootSpecificity`
in lib/theme/parse.js now blanks comments with `maskCssComments` from lib/core/css-comments.mjs, which the
theme core already bundled, so the new code is the import binding and its call. lib/runtime/index.js
`injectOrientationStyle` now asks the shared classifier `deckOrientation(aspect) === 'square'` instead of
comparing to 0.95, through a binding the runtime already imports. Declared with headroom over the measured
bytes for gzip variation.
Nothing to give back first: both changes replace a private copy of a rule with the shared one, and the
added bytes are the call sites.
