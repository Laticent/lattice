/**
 * parse-root-vars — extract the raw custom-property map from a CSS cascade.
 *
 * Walks every `:root { … }` block in the given CSS text and returns a flat
 * `{ name: rawValue }` map of its `--custom-property` declarations, RAW (values
 * are the verbatim expressions — `light-dark(…)`, `color-mix(…)`, `var(…)` — not
 * yet resolved). Pair with `resolve-token-expr.js` to collapse a value to a
 * literal against this map.
 *
 * This is the pure, reusable twin of the extraction `lattice-emulator.js`'s
 * `parsePaletteVars` performs inline for the offline Mermaid bridge. It is
 * lifted here so the CSS build generator, the emulator, and the palette tests
 * can share ONE extractor instead of the four hand-copied variants that exist
 * today (`lattice-emulator.js`, `test/helpers/palette.js`,
 * `test/unit/palette/theme-serialize.test.js`, `contrast.test.js`) — those
 * predate this module and are a tracked de-duplication follow-up, not touched
 * here. Pure: no fs, no other repo requires.
 *
 * Later `:root` blocks override earlier ones (source-order cascade), so pass the
 * concatenation base-first, theme-last — mirroring the real browser cascade
 * where every theme `@import 'lattice'` loads the base tokens before its own.
 *
 * @param {string} cssText  concatenated CSS (base tokens first, theme last)
 * @returns {Object} flat { name: rawValue } map
 */
function parseRootVars(cssText) {
  // Strip comments first so a doc block containing an example like
  // `:root{color-scheme:dark}` can't break the brace matcher.
  const stripped = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  const rootBlocks = stripped.match(/:root\s*\{[^}]*\}/g) || [];
  for (const block of rootBlocks) {
    const decls = block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || [];
    for (const d of decls) {
      const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

/**
 * Whether a palette's `:root` declares `color-scheme: dark` — i.e. the deck is
 * authored dark, so `light-dark()` should collapse to its dark branch. Mirrors
 * the emulator's `isDark` detection.
 * @param {string} cssText  concatenated CSS
 * @returns {boolean}
 */
function isDarkScheme(cssText) {
  const stripped = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  // Match `color-scheme: dark` in ANY :root-anchored block, including a wrapped
  // `:where(:root)` / `:is(:root)` / `:root:root` prelude (carbone declares its
  // dark scheme as `:where(:root){color-scheme:dark}` for zero-specificity, so a
  // literal `:root {` match mis-classified it as light). `[^{}]*` keeps the match
  // inside one prelude. The value regex requires `dark` to be the FIRST keyword after
  // the colon, so `color-scheme: light dark` (scheme-flexible) correctly stays light.
  // The `\b` after `:root` rejects `:rooted{…}`; a `:root-suffix{…}` selector would
  // false-match, but no theme uses one.
  return /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/.test(stripped);
}

module.exports = { parseRootVars, isDarkScheme };
