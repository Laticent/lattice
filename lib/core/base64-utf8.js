/**
 * base64-utf8 — the ONE encode/decode pair for a text payload packed into markup
 * (HARD RULE #1). A `functionplot` fence's config rides `data-fp-config` this way, an
 * `anima` fence's spec rides `data-scene-spec`, and the `--player` envelope (`lattice-doc.js`)
 * packs the whole manifest.
 *
 * WHY A PAIR AND NOT `btoa` / `atob`. Both work on BYTES spelled as one char per byte, not
 * on text. The encoder packs UTF-8, so the decoder has to read those bytes back as UTF-8. A
 * bare `atob` hands each byte back as its own character instead, and `x²` (bytes C2 B2)
 * comes back as `Â²`. That is exactly what the runtime's function-plot inflater did: every
 * live slide and every bake that captured it (`--player`, `--read`, the Studio export)
 * showed the axis label `XÂ²` (function-plot upper-cases it). Keeping both halves in one
 * file is what stops the two from disagreeing again.
 *
 * Node takes the Buffer path; a browser takes TextEncoder/TextDecoder. The chunked
 * `fromCharCode` dodges the argument-count limit on a long payload.
 */

/** UTF-8 text → base64. */
function toBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** base64 → UTF-8 text. */
function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

module.exports = { toBase64, fromBase64 };
