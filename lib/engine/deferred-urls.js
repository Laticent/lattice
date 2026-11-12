/**
 * lib/engine/deferred-urls.js — carry a large `data:` picture through the render as a short stand-in,
 * and put the bytes back once, at the end.
 *
 * WHY. The engine's HTML stage is a chain of about forty passes, and most of them walk the whole
 * document (`splitSections`, `mapSections`, the collage and QR walkers). That is cheap on a deck's
 * own markup, a few hundred kilobytes. A host that hands the engine its Library photos as `data:`
 * URIs (the Studio's exports and its Stage, docs/src/components/studio/media-urls.ts `dataUrlsFor`)
 * makes the document the size of the photos instead: 18 phone photos are a 32.8 MB string, every
 * pass walks all of it, and one render took 7.8 s and 1.1 GB in Node, ~26 s in the Studio, where a
 * render with short URLs takes 0.12 s. engineering/decisions/2026-11-11-deferred-asset-bytes.md.
 *
 * HOW. `deferAssetUrls` swaps each large `data:` value in the host's `assetUrls` map for a stand-in
 * that keeps the value's own header (`data:image/png;base64,`), so every pass that asks "what kind of
 * URL is this" (media-sources.js `classify`, a mime check) gets the same answer, followed by a short
 * lowercase-alphanumeric token. Lowercase alphanumerics survive HTML, attribute, CSS and JSON escaping
 * and lowercasing unchanged. `restore` swaps every stand-in back in one pass over each string.
 *
 * ONLY CANONICAL BASE64. A value is deferred only when its header ends `;base64` and its body is the base64
 * alphabet with end padding: no pass escapes, validates or refuses such a body, so hiding it changes nothing a
 * pass decides. Any other `data:` body (raw SVG markup, line breaks, parentheses) passes through untouched.
 *
 * THE OUTPUT CANNOT DIFFER. A stand-in that a pass copied verbatim restores to exactly the bytes the
 * pass would have copied. A pass that did anything else to it (percent-encoded its header, cut it,
 * hashed it into an id) leaves the token somewhere other than right after its own header, and
 * `restore` reports that by returning null; the engine then renders again with the bytes in place
 * (lib/engine/index.js `render`). The fallback costs one render; it never costs a wrong one.
 * test/unit/core/deferred-urls.test.js holds the engine's output byte-identical either way.
 *
 * Pure and dependency-free, for the engine in Node and in the browser.
 */

/** Below this a `data:` value costs the passes nothing worth a stand-in; the stand-in is ~60 characters. */
const DEFER_MIN_LENGTH = 1024;

/** Is `s` from `from` to its end the base64 alphabet, with at most two `=` at the very end? One pass, no regex. */
function isCanonicalBase64(s, from) {
  let end = s.length;
  if (end > from && s.charCodeAt(end - 1) === 61) end--;
  if (end > from && s.charCodeAt(end - 1) === 61) end--;
  for (let i = from; i < end; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47)) return false;
  }
  return true;
}

/** A per-render nonce, so a deck that happens to contain a token's text cannot be mistaken for one. */
function nonce() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(8));
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // No Web Crypto (a very old host): the nonce only has to differ from what an author typed.
  return `${Date.now().toString(16)}${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

/**
 * @param {Record<string,string>|null|undefined} assetUrls  the host's name → URL map
 * @param {{ minLength?: number }} [o]
 * @returns {null | {
 *   map: Record<string,string>,
 *   realOf: (url: string) => string | undefined,
 *   restore: (s: string) => string | null,
 * }}  null when nothing in the map is worth deferring (render exactly as before)
 */
function deferAssetUrls(assetUrls, o = {}) {
  if (!assetUrls || typeof assetUrls !== 'object' || Array.isArray(assetUrls)) return null;
  const min = o.minLength ?? DEFER_MIN_LENGTH;
  const id = `lattice${nonce()}`;
  /** stand-in → the value it stands for */
  const real = new Map();
  const map = {};
  let n = 0;
  for (const [name, url] of Object.entries(assetUrls)) {
    const comma = typeof url === 'string' && url.length >= min && /^data:/i.test(url) ? url.indexOf(',') : -1;
    // ONLY A CANONICAL BASE64 BODY IS DEFERRED. A stand-in hides the body from every pass, so it is only safe for a
    // body no pass would escape, validate or refuse: the base64 alphabet, padded at the end, under a `;base64`
    // header. A raw `utf8,<svg …>` body (HTML-escaped by a pass), one with parentheses (refused in a `url()`) or
    // with line breaks (escaped in a custom property) passes through and renders exactly as before (the checker's
    // finding, 2026-11-11; test/unit/core/deferred-urls.test.js). The Studio's photos are always canonical base64.
    if (comma < 0 || !/;base64$/i.test(url.slice(0, comma)) || !isCanonicalBase64(url, comma + 1)) {
      map[name] = url;
      continue;
    }
    const stand = `${url.slice(0, comma + 1)}${id}u${n++}z`;
    real.set(stand, url);
    map[name] = stand;
  }
  if (!real.size) return null;
  // One alternation over the stand-ins, header included, longest first so `u1z` never wins over `u12z`
  // (the `z` terminator already prevents that; the order is belt and braces at no cost).
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = new RegExp([...real.keys()].sort((a, b) => b.length - a.length).map(esc).join('|'), 'g');
  return {
    map,
    realOf: (url) => real.get(url),
    restore(s) {
      if (typeof s !== 'string' || !s.includes(id)) return s;
      const out = s.replace(whole, (m) => real.get(m));
      // A token left anywhere else means a pass changed a stand-in instead of copying it.
      return out.includes(id) ? null : out;
    },
  };
}

module.exports = { deferAssetUrls, DEFER_MIN_LENGTH };
