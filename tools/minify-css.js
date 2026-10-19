#!/usr/bin/env node
/**
 * Shared CSS minifier for the dist `-min.css` variants.
 *
 * esbuild's CSS minifier strips ALL comments — but Marp reads its theme
 * registration from CSS *comments* (`/* @theme name *​/`, `@size …`). A
 * naively-minified bundle would therefore render with NO palette (white
 * background, var() fallbacks) because Marp can no longer find the theme
 * name. So we lift every directive-bearing comment block out of the
 * source, minify the body, and re-prepend the directives verbatim.
 *
 * Used by tools/build-css.js (lattice-min.css) and
 * tools/build-default-bundle.js (lattice-default-min.css). Kept in one
 * place because the @theme-preservation rule is correctness-critical and
 * subtle — duplicating it invites fixing one copy and missing the other.
 */

const esbuild = require('esbuild');
// The shared comment/string/url() walk. A comment regex can't tell `/*` inside a
// string from a real opener, and fuses everything up to the next closer into one
// "comment" (lib/core/css-comments.mjs states the defect once for all callers).
const { eachCssRun } = require('../lib/core/css-comments.mjs');

// Marp directive tokens that MUST survive minification.
const DIRECTIVE_RE = /@(?:theme|size)\b/;

/**
 * Minify `css`, preserving any comment block that carries a Marp `@theme`
 * / `@size` directive so the output still registers as a Marp theme.
 *
 * @param {string} css   the source bundle
 * @param {string} [banner]  optional one-line provenance comment prepended first
 * @returns {string} minified CSS, directive comments intact
 */
function minifyCss(css, banner) {
  const directives = [];
  eachCssRun(css, (type, text) => { if (type === 'comment' && DIRECTIVE_RE.test(text)) directives.push(text); });
  const { code } = esbuild.transformSync(css, { loader: 'css', minify: true });
  const head = [];
  if (banner) head.push(banner);
  head.push(...directives);
  // Directives end with `*​/`; the minified body follows with no needed
  // separator, but a newline keeps the head human-skimmable.
  return head.join('\n') + (head.length ? '\n' : '') + code;
}

/**
 * Minify an ordered list of CSS pieces so that concatenating the results ("" between them) is exactly
 * `minifyCss(pieces.join('\n'), banner) + '\n'` (what dist/lattice-min.css holds). The head (banner, then
 * every directive comment, in order) rides on the first piece and the closing newline on the last, so
 * the pieces stay plain files with no join rule beyond concatenation. esbuild minifies each piece alone
 * to the same bytes it gives the whole (checked for the whole Lattice bundle by
 * test/unit/cli/css-modules.test.js); a piece that minifies to nothing stays in the list as ''.
 *
 * @param {string[]} pieces
 * @param {string} [banner]
 * @returns {string[]}
 */
function minifyCssPieces(pieces, banner) {
  const head = banner ? [banner] : [];
  const bodies = pieces.map((css) => {
    eachCssRun(css, (type, text) => { if (type === 'comment' && DIRECTIVE_RE.test(text)) head.push(text); });
    return esbuild.transformSync(css, { loader: 'css', minify: true }).code.replace(/\n$/, '');
  });
  const out = [...bodies];
  if (out.length) {
    out[0] = head.join('\n') + (head.length ? '\n' : '') + out[0];
    // esbuild ends its output with one newline, and build-css.js appends a second after `minifyCss`.
    out[out.length - 1] += '\n\n';
  }
  return out;
}

module.exports = { minifyCss, minifyCssPieces };
