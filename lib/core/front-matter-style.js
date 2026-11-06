/**
 * lib/core/front-matter-style.js — the front matter's `style:` the way the CLI export pastes it, in its own file.
 *
 * Read by the export (lib/export/export-scaffold.js, which pastes it into its stylesheet) and by the linter's `style:`
 * rules (lib/authoring/lint-core.js, security spine S2), so the two agree on WHICH `style:` is pasted. Its own file, not
 * front-matter-key.js, because that module is in the Studio's startup bundle and neither reader is (docs route budget).
 * Requires nothing.
 */
/**
 * The front matter's `style:` value as the CLI export pastes it into its stylesheet (lib/export/export-scaffold.js), read
 * the one way both it and the linter's `style:` rules read it: the FIRST TOP-LEVEL `style:` line (column 0, as the engine's
 * `parseFrontMatter` reads every directive since #2050 — a `style:` nested under another key is not the deck's), quoted on one
 * line or a `|` block; any other form is not pasted, so it is `''` (moved here from export-scaffold.js, security spine S2).
 * @param {string} fmText  the text between the front-matter fences
 */
function readGlobalStyle(fmText) {
  const inline = fmText.match(/^style:[ \t]*(["'])([\s\S]*?)\1\s*$/m);
  if (inline) return inline[2];
  // `(?=^\S|$(?![\s\S]))` — stop at the next top-level YAML key or at the
  // absolute end of the frontmatter string. JS regex has no `\Z` anchor,
  // so we spell end-of-input as `$` with a negative lookahead for any
  // remaining characters.
  const block = fmText.match(/^style:[ \t]*\|\s*\r?\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^ {2}/, '')) // strip the YAML indent (≥2 spaces)
      .join('\n')
      .trimEnd();
  }
  return '';
}

module.exports = { readGlobalStyle };
