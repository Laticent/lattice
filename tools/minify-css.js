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

module.exports = { minifyCss };
