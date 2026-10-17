/**
 * lib/core/data-uri.js — bytes to a `data:` URI, ONE encoding for every host that embeds a picture.
 *
 * SVG goes in as percent-encoded UTF-8 (`;charset=utf-8,`, spaces left as spaces), which is smaller
 * than base64 for text; everything else as base64. The CLI's file inliner (html-player.js) wrote
 * SVG that way and the Studio's fetcher (inline-url-media.mjs) wrote base64, so the same picture
 * shipped two ways (decisions/2026-10-16-player-as-library-audit.md §11.9). A percent-encoded SVG
 * can carry `'`, `(`, `)` and spaces, so a CSS `url()` around one must be quoted with `"`
 * (`encodeURIComponent` escapes `"`); `isBareSafeDataUri` says which URIs may stand bare.
 *
 * Pure and dependency-free: Node and the browser both have `TextDecoder` and `btoa`.
 */

/**
 * @param {Uint8Array} bytes  a Buffer is a Uint8Array
 * @param {string} mime       a bare type (`image/png`), already validated by the caller
 */
function bytesToDataUri(bytes, mime) {
  if (mime === 'image/svg+xml') {
    // ignoreBOM: keep a leading BOM as Buffer#toString('utf8') does, so the CLI's bytes do not move.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    return `data:${mime};charset=utf-8,${encodeURIComponent(text).replace(/%20/g, ' ')}`;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/** True when `uri` is a base64 `data:` URI, which carries no quote, paren or space and may sit in a bare `url()`. */
function isBareSafeDataUri(uri) {
  return /^data:[^,]*;base64,/.test(uri);
}

module.exports = { bytesToDataUri, isBareSafeDataUri };
