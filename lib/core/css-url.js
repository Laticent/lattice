/**
 * lib/core/css-url.js — the target of the first `url()` in a CSS text, quote-aware.
 *
 * The runtime's readers used `/url\(\s*['"]?([^'")]+)/`, which ends a URL at its first `)` or `'`.
 * A `data:` URI of an SVG (percent-encoded UTF-8, the encoding every export writes: lib/core/
 * data-uri.js) carries both — `fill="url(%23glow)"` — so the reader handed back a truncated URL and
 * the picture never loaded: an `image` slide lost its size bucket in the CLI's `--html` and `--fluid`
 * exports and in the Studio's Webpage bake (decisions/2026-10-16-player-as-library-audit.md §11.9).
 * A quoted URL now runs to its closing quote, a bare one to the first `)` or space.
 *
 * Pure, dependency-free; the browser runtime bundles it.
 */
const URL_RE = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/i;

/** @returns {string|null} the first `url()` target in `text`, unescaped, or null */
function firstCssUrl(text) {
  const m = URL_RE.exec(String(text ?? ''));
  if (!m) return null;
  const raw = m[1] ?? m[2] ?? m[3] ?? '';
  return raw ? raw.replace(/\\(.)/g, '$1') : null;
}

module.exports = { firstCssUrl };
