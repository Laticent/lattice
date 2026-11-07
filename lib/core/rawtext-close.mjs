/**
 * The RAWTEXT close rule for the parsers in `lib/core` and the engine — re-exported from
 * `@laticent/markup` (docs/src/lib/markup/rawtext-close.ts), which owns it and says why it exists
 * (#2052: `</style >` swallowed the next slide separator and merged two slides).
 *
 * It lives in the package because the docs site's Compose tokenizer needs it too, and that bundle takes the package
 * rather than `lib/core`.
 * Every parser that places a block installs it, so none disagrees with the render:
 *   · the engine (lib/engine/index.js `buildMd`) and the boundary parser (lib/core/boundary-parser.mjs);
 *   · the plugin fence reader the host hands every bake (lib/core/plugin-fences.mjs), through the boundary parser;
 *   · the live-author-HTML mask (lib/core/live-author-html.js);
 *   · the Compose raw-block tokenizer (docs/src/lib/compose/raw-block.ts).
 * The Segno deck model (docs/src/lib/segno-markdown/block.ts) carries the same close regex in its own
 * `HTML_SEQUENCES` table; test/unit/core/deck-model.test.js holds it to markdown-it token for token.
 */
export { RAWTEXT_CLOSE, tolerateRawtextClose } from '@laticent/markup';
