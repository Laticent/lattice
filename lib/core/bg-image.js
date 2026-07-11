/**
 * Universal `![bg …]` background-image handling for half-canvas image layouts.
 *
 * Lattice renders the `image` layout as its OWN `lattice-bg` / `image-text`
 * structure (NOT Marpit's inline-SVG advanced background): an absolutely-
 * positioned `.lattice-bg` panel carrying the image as a CSS `background-image`
 * (no `<img>`), beside a `.image-text` wrapper that constrains the prose to the
 * other half. The asset URL is resolved to an absolute file:// URL against the
 * deck directory so it renders regardless of the output location.
 *
 * lib/engine, by contract, matches marp-core's WEB mode, which collapses
 * `bg left/right` to a single full-bleed CSS background with no `<img>` — so the
 * emulator's engine-backed path (which renders PDFs, where the split panel is
 * wanted) would lose the layout. This kernel lifts the lattice-bg handling out so
 * that path can reproduce it without touching lib/engine's web↔marp parity
 * contract:
 *
 *   - `liftBgImages(md)` — markdown pre-pass: rewrite each `![bg side](url)` into
 *     the raw `.lattice-bg` div BEFORE engine.render, so the engine's basic-mode
 *     background ruler never consumes (and collapses) the directive.
 *   - `wrapImageText(sectionHtml)` — HTML post-pass: wrap a half-canvas image
 *     section's prose in `.image-text`, leaving header / footer / the lattice-bg
 *     div as siblings (header · lattice-bg · image-text · footer order).
 *
 * `bgDiv` / `bgSide` / `isHalfCanvasImage` give the directive grammar + the panel
 * markup a single home. See
 * engineering/decisions/2026-06-11-emulator-on-engine-p2.md (P2 step c→d).
 */

// No Node built-ins here: this kernel is bundled into the BROWSER playground
// engine too, so URL resolution uses the WHATWG `URL` (global in Node AND
// browsers), not node:path/node:url.

// Marp background-image directive, anchored to line start so an inline `![bg…]`
// inside backtick code is not consumed.
// The keyword run after `bg` (e.g. " right", " cover blur") — a leading HORIZONTAL space
// then any run of horizontal-space/word chars. Written as an OPTIONAL single-star
// `(?:H(?:H|\w)*)?` (H = `[^\S\r\n]`, one unbounded star over the DISJOINT pair H|\w)
// rather than the nested `(?:\s+\w+)*`: no nested unbounded quantifier for a static
// analyzer to flag as polynomial-ReDoS, and the two star branches share no character so
// it's provably linear. `[^\S\r\n]` is "any whitespace EXCEPT CR/LF", chosen deliberately:
//   (1) it still requires a leading space, so `![bgleft]` stays a normal image;
//   (2) excluding CR/LF keeps the run single-line — the old `\s`-based form could swallow
//       whole lines of punctuation-free prose up to a later `](url)` (a real over-run);
//   (3) INCLUDING nbsp / narrow-nbsp / other Unicode horizontal spaces keeps it a genuine
//       superset of the old `\s`-run — a `![bg` + non-breaking-space + `right](x)` pasted
//       from Word/Docs still lifts, as it did before (a plain `[ \t]` silently dropped it).
// It also tolerates a trailing space before `]` (`![bg right ](x)`), which the old form
// rejected — a leniency win; bgSide() keys on `\bright\b`/`\bleft\b`, so extra space is inert.
const BG_RE = /^!\[bg((?:[^\S\r\n](?:[^\S\r\n]|\w)*)?)\]\(([^)]+)\)/gm;

// `bg right` / `bg left` choose the split side; anything else is full-bleed.
function bgSide(keywords = '') {
  if (/\bright\b/.test(keywords)) return 'right';
  if (/\bleft\b/.test(keywords)) return 'left';
  return 'full';
}

// Resolve a deck-relative asset URL against `baseUrl` — a URL string ending in
// `/`: a `file://` deck directory for the CLI/emulator, an http(s) asset base
// for the web playground. Remote/absolute-scheme/protocol-relative URLs and the
// no-base case pass through untouched. This is the fix for the path bug: a
// `![bg](relative.svg)` rendered to a PDF in any directory but the deck's used
// to resolve against the output dir and 404. WHATWG `URL` keeps this browser-
// safe (and won't throw on a literal `%`, unlike decodeURI). See
// engineering/decisions/2026-06-17-image-rearchitecture.md.
function resolveAssetUrl(url, baseUrl) {
  if (!baseUrl || /^(?:[a-z]+:|\/\/)/i.test(url)) return url;
  try { return new URL(url, baseUrl).href; } catch { return url; }
}

// Inline `<img src="…">` in rendered HTML — a `logo-wall` mark, any prose image.
// Captures the `src="` prefix, the URL, and the closing quote so a replacement
// only rewrites the URL. Double-quoted only — markdown-it always emits double
// quotes for attributes.
const IMG_SRC_RE = /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi;

/**
 * Resolve every relative inline `<img>` src against `baseUrl`, the same way
 * `![bg]` backgrounds are resolved (resolveAssetUrl). The engine emits prose
 * images with the author's deck-relative src verbatim; in a preview iframe
 * (srcdoc, no deck-dir base) a relative `acme.svg` 404s. The CLI/emulator never
 * passes a baseUrl (it renders against the on-disk deck dir), so this is a no-op
 * there — exported bytes are untouched. Remote / absolute-scheme / data URLs and
 * the no-base case pass through (resolveAssetUrl guards them); idempotent, since
 * an already-absolute src re-resolves to itself.
 *
 * Scope: engine-rendered HTML, where markdown-it always emits double-quoted
 * `src="…"`. A future caller feeding single-quoted `src='…'` would be skipped
 * (the regex requires a double quote) — fine for every current caller.
 */
function resolveInlineImageSrcs(html, baseUrl) {
  if (!baseUrl || typeof html !== 'string' || html.indexOf('<img') === -1) return html;
  return html.replace(IMG_SRC_RE, (_whole, pre, src, post) =>
    `${pre}${resolveAssetUrl(src, baseUrl)}${post}`);
}

// The canonical panel markup. The image rides as a CSS `background-image` on the
// `.lattice-bg` div (no `<img>`) — so image.styles.css needs no `!important` to
// beat Marpit's `section img` catch-all (that contract no longer applies).
function bgDiv(keywords, url, baseUrl) {
  const resolved = resolveAssetUrl(url.trim(), baseUrl).replace(/'/g, '%27');
  return `<div class="lattice-bg lattice-bg-${bgSide(keywords)}" style="background-image:url('${resolved}')"></div>`;
}

// Markdown pre-pass for the engine path: `![bg side](url)` → the lattice-bg div.
// `baseDir` (the deck's directory) resolves deck-relative asset URLs to absolute.
function liftBgImages(md, baseDir) {
  if (typeof md !== 'string' || md.indexOf('![bg') === -1) return md;
  return md.replace(BG_RE, (_whole, keywords, url) => bgDiv(keywords, url, baseDir));
}

// Class-aware lift for the shared engine: lift `![bg]` to the lattice-bg div ONLY
// inside `image`-class slides, so a non-image full-bleed `![bg]` keeps the
// engine's marp-web section-background behavior. Splits on horizontal-rule slide
// separators (the body is already front-matter-stripped) and lifts per image
// slide. Idempotent: a slide whose `![bg]` is already lifted (the emulator
// pre-lifts) has no `![bg]` left, so this is a no-op there.
const SLIDE_SPLIT = /(^---[ \t]*$)/m;
const IMAGE_CLASS = /<!--\s*_class:\s*[^>]*\bimage\b/;
function liftImageBgImages(md, baseDir) {
  if (typeof md !== 'string' || md.indexOf('![bg') === -1) return md;
  return md.split(SLIDE_SPLIT).map((part) =>
    IMAGE_CLASS.test(part)
      ? part.replace(BG_RE, (_w, kw, url) => bgDiv(kw, url, baseDir))
      : part,
  ).join('');
}

// Half-canvas image = the `image` class minus the full-bleed variants (full /
// contain / museum), which fill the canvas edge-to-edge and carry no text panel.
function isHalfCanvasImage(cls = '') {
  return /\bimage\b/.test(cls) && !/\b(?:full|contain|museum)\b/.test(cls);
}

// HTML post-pass: wrap an image section's prose in `.image-text`, keeping header
// / footer / the lattice-bg div as siblings (the bg panel and the chrome are
// absolutely positioned, not text-slot content). Idempotent.
//
// EVERY `image` section is wrapped, not just the half-canvas ones: the adaptive
// layout picks its composition (clean / split / spotlight / …) AFTER authoring,
// from the photo's aspect, so the DOM must be composition-agnostic — a stable
// `.image-text` panel the CSS can reposition into a side panel, a band, or a
// floating card per composition. (A section with no prose stays unwrapped.)
function wrapImageText(sectionHtml) {
  if (typeof sectionHtml !== 'string') return sectionHtml;
  const open = sectionHtml.match(/^<section\b[^>]*>/i);
  if (!open) return sectionHtml;
  const clsMatch = open[0].match(/class="([^"]*)"/);
  if (!/\bimage\b/.test(clsMatch ? clsMatch[1] : '')) return sectionHtml;
  if (sectionHtml.indexOf('class="image-text"') !== -1) return sectionHtml; // idempotent
  const closeIdx = sectionHtml.lastIndexOf('</section>');
  if (closeIdx === -1) return sectionHtml;
  const inner = sectionHtml.slice(open[0].length, closeIdx);
  const header = (inner.match(/<header[\s\S]*?<\/header>/) || [''])[0];
  const bg = (inner.match(/<div class="lattice-bg[\s\S]*?<\/div>/) || [''])[0];
  const footer = (inner.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  let body = inner;
  for (const part of [header, bg, footer]) if (part) body = body.replace(part, '');
  body = body.trim();
  // No prose (image-only slide) → leave the section as-is; an empty panel would
  // steal grid space from the photo in every composition.
  if (!body || !/[^\s]/.test(body.replace(/<[^>]+>/g, ''))) return sectionHtml;
  return `${open[0]}${header}${bg}<div class="image-text">${body}</div>${footer}</section>`;
}

module.exports = { BG_RE, bgSide, bgDiv, resolveAssetUrl, resolveInlineImageSrcs, liftBgImages, liftImageBgImages, isHalfCanvasImage, wrapImageText };
