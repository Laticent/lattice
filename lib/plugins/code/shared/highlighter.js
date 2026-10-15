/**
 * lib/plugins/code/shared/highlighter.js — the code plugin's highlight.js, loaded by the
 * language rather than all at once.
 *
 * ONE INSTANCE PER PROCESS. `highlight.js/lib/core` is a singleton, so every engine shares it,
 * and a grammar registered once (a fetched one in the Studio, Mermaid's from the plugin host)
 * reaches every render after it. The engine's `languages` capability (lib/engine/index.js) is a
 * thin door onto this module.
 *
 * LAZY. The engine used to `require('highlight.js')` — all 192 grammars, ~105 ms per process,
 * paid by every deck whether it had a fence or not (engineering/decisions/2026-10-15-code-plugin.md
 * §2). Here a grammar loads the first time a fence names it, through `load-grammar.js`: Node
 * requires the one module; the browser bundle swaps that file for `load-grammar.browser.js`, which
 * loads nothing and leaves the preview to fetch grammars before it renders
 * (docs/src/lib/ensure-hljs-language.ts → `register`).
 *
 * WHAT LOADS WITH A GRAMMAR. The ones it hands part of a block to (`requires` in
 * languages.generated.js — HTML's `<script>` to JavaScript), so a lazy load colors exactly what the
 * full build colored. `bash` (and `sh`, `zsh`) is Lattice's augmented shell grammar
 * (./shell.hljs.js), registered at load and never replaced by the stock one.
 */

const hljs = require('highlight.js/lib/core');
const loader = require('./load-grammar.js');
const { LANGUAGES, ALIASES } = loader;
const shellLanguage = require('./shell.hljs.js');
const fenceLanguages = require('../../../core/fence-languages.js');
const { spansFromHighlightHtml } = require('../../../core/highlight-spans.js');

// Lattice's shell grammar owns `bash`. Asserted now, ahead of any lazy load, and again whenever
// `bash` is asked for: `highlight.js/lib/core` is a process-wide singleton, so anything that loads
// the FULL build into the same process (a bundle's eager set, a tool listing language names)
// re-registers the stock bash over it, and `registerLanguage` replaces silently.
function ownShell() {
  if (hljs.getLanguage('bash')?.name !== shellLanguage.GRAMMAR_NAME) hljs.registerLanguage('bash', shellLanguage);
  return true;
}
ownShell();

/** The canonical highlight.js name a fence tag stands for, or null. Case-insensitive, as hljs is. */
function canonical(name) {
  if (typeof name !== 'string' || !name) return null;
  const key = name.toLowerCase();
  return Object.hasOwn(ALIASES, key) ? ALIASES[key] : null;
}

/** Register one canonical grammar from the loader; false when this surface cannot load it. */
function loadOne(name) {
  if (name === 'bash') return ownShell();
  if (hljs.getLanguage(name)) return true;
  const definition = loader.load(name);
  if (typeof definition !== 'function') return false;
  try {
    hljs.registerLanguage(name, definition);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make `name` colorable, loading its grammar and the ones it embeds. Returns whether it can now be
 * highlighted. A name highlight.js does not know may still be registered (a plugin's grammar,
 * Mermaid's), so the registry is asked before the table.
 */
function ensure(name) {
  if (!name) return false;
  const canon = canonical(name);
  if (!canon) return Boolean(hljs.getLanguage(name));
  if (!loadOne(canon)) return false;
  for (const dep of LANGUAGES[canon]) loadOne(dep);
  return true;
}

/** Can this surface color `name` — registered already, or loadable here? Loads nothing. */
function canColor(name) {
  if (!name) return false;
  if (hljs.getLanguage(name)) return true;
  return loader.available && canonical(name) !== null;
}

/**
 * The highlighted HTML for `code` as `name`, or '' when it cannot be colored (the renderer then
 * escapes it as plain text, which is what a fence with an unknown language has always shown).
 */
function highlight(code, name) {
  if (!ensure(name)) return '';
  try {
    // By the canonical name, never the alias: two grammars can claim one alias, and highlight.js
    // gives it to whichever registered last, which per-language loading makes a matter of order.
    return hljs.highlight(code, { language: canonical(name) || name, ignoreIllegals: true }).value;
  } catch {
    return '';
  }
}

/**
 * The capability the engine exposes as `engine.languages` (lib/engine/index.js documents each
 * door; the Studio's Compose editor and preview are its callers).
 */
const languages = Object.freeze({
  has: canColor,
  list() {
    const names = new Set(hljs.listLanguages());
    if (loader.available) for (const n of Object.keys(LANGUAGES)) names.add(n);
    return [...names].sort();
  },
  needed(markdown) {
    return fenceLanguages.fenceLanguages(markdown);
  },
  missing(markdown) {
    return fenceLanguages.missingLanguages(markdown, { getLanguage: canColor });
  },
  spans(code, name) {
    if (typeof code !== 'string' || !code || !name || !ensure(name)) return [];
    try {
      return spansFromHighlightHtml(hljs.highlight(code, { language: canonical(name) || name, ignoreIllegals: true }).value);
    } catch {
      return [];
    }
  },
  register(name, definition) {
    if (!name || typeof definition !== 'function' || hljs.getLanguage(name)) return false;
    try {
      hljs.registerLanguage(name, definition);
      return true;
    } catch {
      return false;
    }
  },
});

module.exports = { hljs, highlight, ensure, canColor, canonical, languages };
