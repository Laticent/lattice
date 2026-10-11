/**
 * lattice-engine — QR code rendering, as a synchronous SVG encoder.
 *
 * Mirrors the math.js (KaTeX) contract: a pure, synchronous string → SVG
 * renderer that the transform layer calls at build time. Synchronous by
 * design — the headless-Chromium PDF path has raced on async reflow before
 * (see math.js), so every substance renderer resolves to a string before the
 * page is handed to Puppeteer.
 *
 * The output is PALETTE-BLIND: dark modules are stroked with `currentColor`
 * and the light background is `transparent`, so the surrounding theme token
 * drives contrast (HARD RULE #3). A host that needs guaranteed contrast on a
 * dark canvas wraps the returned SVG in a light "quiet card" itself.
 *
 * Render failures degrade to an empty string rather than throwing, so a
 * malformed payload never aborts a whole deck render.
 */

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (_e) {
  /* qrcode unavailable — QR degrades to nothing rather than crashing the deck */
}

// `qrcode`'s SVG renderer is pure computation: with a callback it resolves
// synchronously (no I/O), so we can expose a synchronous API like KaTeX's
// renderToString instead of leaking a Promise into the render pipeline.
function encodeSync(data, opts) {
  let out = '';
  let err = null;
  QRCode.toString(String(data), opts, (e, s) => {
    err = e;
    out = s;
  });
  if (err) throw err;
  return out;
}

/**
 * Render `data` to a palette-blind, single-line SVG string sized to fill its
 * container (width:100%). Returns '' if the encoder is unavailable or the
 * payload can't be encoded.
 *
 * @param {string} data                 the exact payload to encode (verbatim)
 * @param {object} [opts]
 * @param {string} [opts.ecLevel='M']   error-correction level: L | M | Q | H
 * @param {number} [opts.margin=3]      quiet-zone width, in modules
 * @param {string} [opts.label]         accessible name (screen readers / PDF a11y)
 */
function qrSvg(data, opts = {}) {
  if (!QRCode || data == null || data === '') return '';
  const { ecLevel = 'M', margin = 3, label } = opts;
  let raw;
  try {
    raw = encodeSync(data, { type: 'svg', errorCorrectionLevel: ecLevel, margin });
  } catch (_e) {
    return '';
  }
  let out = raw
    .replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="transparent"')
    .replace(/stroke="#[0-9a-fA-F]{3,6}"/g, 'stroke="currentColor"')
    .replace('<svg ', '<svg role="img" style="width:100%;height:auto;display:block" ')
    .replace(/\n/g, ''); // single line — a blank line would break HTML-block embedding
  if (label) {
    const l = String(label)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    out = out
      // Function replacers: the label is author text, and `$&` in a string replacement expands.
      .replace('<svg ', () => `<svg aria-label="${l}" `)
      .replace(/(<svg[^>]*>)/, (_m, open) => `${open}<title>${l}</title>`);
  }
  return out;
}

module.exports = { qrSvg };
