/**
 * icon-bind.js — keep an inline icon on the same line as the word after it. THE RULE, shared by both render paths
 * (HARD RULE #1); each path's adapter is its own file so neither bundle carries the other's (the engine and the
 * runtime sit at their route-budget ceiling).
 *
 * THE DEFECT. `^{warehouse} Snowflake holds the model` broke between the icon and "Snowflake" when the line ran out:
 * the icon closed one line and its word opened the next, so the icon labeled nothing. A browser may break on either
 * side of an inline-block, and a no-break space does not stop it (Chromium breaks after an atomic inline before a
 * U+00A0 or a U+2060 alike, measured), so the only hold is an element around both with `white-space: nowrap`.
 *
 * THE RULE. When the text right after an icon is ONE space and a word, the icon, that space and that word go in a
 * `lat-icon-bind` span. Anything else stays as written: two icons in a row (`^{lock} ^{key}`, the space holds no word),
 * punctuation (`^{bucket}.`, which no browser breaks before anyway) or a line end.
 *
 * Adapters, each beside its one user: lib/integrations/markdown-it/icon-bind.js (plugins.js, after the inline-code pass) and
 * lib/runtime/icon-bind.js (index.js, the DOM mirror for a render where that pass never ran).
 */


module.exports = {
  BIND_CLASS: 'lat-icon-bind',
  /** One space (or no-break space) and the word after it, at the start of the text that follows an icon. */
  BIND_WORD: /^[  ]\S+/,
};
