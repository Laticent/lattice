playground: +40
The playground's eager JS grows 16 B gz against main (CI's docs-build on 938a888): `buildVocabSets` in
docs/src/playground/editor-diagnostics.js now forwards the lint vocab's `pluginRegisters`. Without that one
line the browser linter never sees the plugin-declared registers (`icon:`, `avatar:`), so their value rule was
silently dead in the editor while `lint:deck` fired it. Declared +40 to cover gzip variation as `main` moves.
The Studio comes out 221 B under main: its front-matter key list and reference rows are now derived from
lib/core/deck-settings.js instead of being two hand-written tables.
