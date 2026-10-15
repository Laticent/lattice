/**
 * lib/plugins/code/shared/load-grammar.browser.js — the browser half of ./load-grammar.js, swapped
 * in by tools/build-playground.js.
 *
 * A browser cannot require a grammar on demand, so it loads none: the bundle carries highlight.js
 * core and Lattice's shell grammar (which ./highlighter.js registers as `bash`), and nothing else.
 * `available` is false, so `languages.missing()` names every fence language that has not arrived;
 * the preview fetches those, and the grammars they embed, before it renders
 * (docs/src/lib/ensure-hljs-language.ts → `languages.register`). A deck with no code fetches
 * nothing. (engineering/decisions/2026-10-15-code-plugin.md §4.3)
 */

module.exports = {
  // No table: nothing here can be loaded on demand, and highlight.js resolves the aliases of the
  // grammars that are registered on its own.
  LANGUAGES: Object.freeze({}),
  ALIASES: Object.freeze({}),
  available: false,
  load() {
    return null;
  },
};
