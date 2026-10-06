studio: +785
The Studio's live lint carries the flowchart grammar and lint-core, and both grew: the grammar
resolves and coaches a shape's `icon=` and `icon-only` (four diagnostics), and lint-core's
`pill-literal` now names a pill with two problems and a state-marker label (`reservedLabel` in
inline-pills). Nothing was given back: the icon drawings themselves stay out of every bundle and
load only for a deck that writes an icon.
