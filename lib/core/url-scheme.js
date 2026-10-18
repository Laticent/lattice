/**
 * lib/core/url-scheme.js — which URLs a URL-typed slide field may name.
 *
 * Design note 2026-10-17-meta-record.md §5.7 (D11): the host validates every provider value against
 * its declared type at the boundary, and a URL field's guard is a SCHEME ALLOWLIST. Before this,
 * `<!-- _backgroundImage: url(javascript:alert(1)) -->` and a `logo:` of any scheme reached the page
 * as written (the red team on PR #2762 measured both). `javascript:` is inert in a modern
 * browser's `background-image` and `<img src>`, but `file:` reads the viewer's disk path into a
 * request, `data:text/html` is a document, and a scheme nobody listed is a scheme nobody reviewed.
 *
 * ALLOWED
 *   · a relative path (`img/a.png`, `../a.png`, `/a.png`): no scheme, and not protocol-relative
 *   · `https:`
 *   · `data:image/<png|jpeg|jpg|gif|webp|avif|svg+xml>` (the built-in logos are SVG data URIs)
 *   · `sample:<name>` and `asset:<name>`: the host's own references, to a bundled sample
 *     (lib/core/media-sources.js) and to a picture in the Studio's asset map; the engine resolves
 *     each to a real URL before any browser sees it
 * EVERYTHING ELSE IS REFUSED: `javascript:`, `file:`, `http:` (mixed content, and a plain-text
 * beacon), `data:text/*`, `blob:`, `vbscript:`, and a protocol-relative `//host/x`, whose scheme
 * is whatever page opens it (`file:` in an exported file).
 *
 * The scheme is read the way a browser reads it: leading control characters and spaces are
 * dropped, and tab, newline and carriage return are removed anywhere (`java\tscript:` is
 * `javascript:`), so a spelling trick cannot walk around the list.
 *
 * Two refusals worth knowing: a Windows drive path (`C:\\logo.png`) parses as the scheme `c:` and is refused,
 * and so is `http://localhost`; write a relative path or https:. CSS escapes are not decoded here: the
 * declaration sink (`realDeclValueIsSafe`, lib/engine/slides.js) refuses any backslash, and the engine reports
 * that refusal too.
 *
 * Pure and dependency-free: it runs in the engine, the runtime and the linter.
 */

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

/**
 * @param {string} raw  one URL, unquoted
 * @returns {{ ok: boolean, scheme: string, reason?: string }}
 */
function urlVerdict(raw) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are the point.
  const url = String(raw ?? '').replace(/^[\u0000- ]+/, '').replace(/[\t\n\r]/g, '');
  if (url === '') return { ok: false, scheme: '', reason: 'it is empty' };
  if (/^[/\\]{2}/.test(url)) return { ok: false, scheme: '//', reason: 'a protocol-relative URL takes whatever scheme opens the page (file: in an exported deck); write https://' };
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (!m) return { ok: true, scheme: '' };
  const scheme = m[1].toLowerCase();
  if (scheme === 'https' || scheme === 'sample' || scheme === 'asset') return { ok: true, scheme };
  if (scheme === 'data') {
    return DATA_IMAGE.test(url) ? { ok: true, scheme } : { ok: false, scheme, reason: 'a data: URL may only carry an image (data:image/png, jpeg, gif, webp, avif or svg+xml)' };
  }
  return { ok: false, scheme, reason: `the ${scheme}: scheme is not allowed; use a relative path, https:, or a data:image URL` };
}

/**
 * Every `url(…)` a CSS value names, with the first refusal if any. A value with no `url()` (a
 * gradient, `none`) names no URL and passes.
 * @param {string} value
 * @returns {{ ok: boolean, url?: string, reason?: string }}
 */
function cssUrlVerdict(value) {
  // A value may not read another property: the serializer writes every directive (`header:`, `footer:`)
  // as a quoted custom property, and `image-set(var(--header) 1x)` turns that string into a URL of ANY
  // scheme (measured in Chromium: it fetched http://127.0.0.1/…). `var`, `env` and `attr` are the three
  // ways a value reaches such a string, so they are refused outright.
  const reader = /\b(var|env|attr)\s*\(/i.exec(String(value ?? ''));
  if (reader) return { ok: false, url: reader[0], reason: `a background image may not read another value with ${reader[1].toLowerCase()}()` };
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  for (const m of String(value ?? '').matchAll(re)) {
    const url = m[1] ?? m[2] ?? m[3] ?? '';
    const v = urlVerdict(url);
    if (!v.ok) return { ok: false, url, reason: v.reason };
  }
  return { ok: true };
}

module.exports = { urlVerdict, cssUrlVerdict };
