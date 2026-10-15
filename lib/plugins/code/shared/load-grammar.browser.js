/**
 * lib/plugins/code/shared/load-grammar.browser.js — the browser half of ./load-grammar.js, swapped
 * in by tools/build-playground.js.
 *
 * A browser cannot require a grammar on demand, so `load` returns nothing and `available` is false:
 * `languages.missing()` then names every fence language that has not arrived, which is the list the
 * preview fetches before it renders (docs/src/lib/ensure-hljs-language.ts → `languages.register`).
 *
 * The 36 grammars of highlight.js's `common` build are registered here, eagerly, onto the same core
 * singleton the highlighter uses; tools/build-hljs-languages.js emits the other 156 as fetchable
 * files. (engineering/decisions/2026-07-19-preview-bundle-hljs-common.md)
 */

require('highlight.js/lib/common');

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
