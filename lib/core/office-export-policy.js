/**
 * lib/core/office-export-policy.js: what an Office export (.pptx, .odp) does with its fonts and pictures, decided ONCE for the command line and the Studio.
 *
 * Calco, the Office writer, holds none of this: it lists the faces and characters a deck uses, crops, and writes the file, and is handed finished fonts
 * and plain picture instructions. The tier words and the image words are read in `font-policy.js` and `image-policy.js`; this module is what an Office
 * host does with them. It is its own file, and not part of those two, because the deck linter bundles those (route budget `lintCoreGz`) and has no use
 * for these rules.
 *
 * A LEAF but for `image-policy.js`, so the docs dev server can serve it to the browser. Pure.
 */

const { resolveImagePolicy } = require('./image-policy.js');

/**
 * The sizes rule for a picture an Office export writes (a whole slide, or a photograph cropped out of one): a flat picture is a lossless PNG, a
 * photograph is a JPEG when that is much smaller. Measured on a 35-slide deck of mostly photographs (2026-10-21): 76.6 MB as PNG, 15.1 MB choosing
 * per slide, and every one of the 35 was smaller as JPEG. Calco (the Office writer) is told these numbers and the policy; it holds none.
 */
const PICTURE = Object.freeze({
  /** A PNG at or under this many bytes is a flat picture: keep it, lossless, with no JPEG tried. */
  flatBytes: 600 * 1024,
  /** A JPEG must be under this share of its PNG to win; a marginal saving is not worth a lossy picture. */
  share: 0.7,
  /** A continuous-tone picture's JPEG at or over this many bytes is kept without ever taking the PNG (the smallest photo or wash in the deck was 158 KB). */
  toneBytes: 100 * 1024,
});

/**
 * ONE slide picture, chosen the same way by the command line and the Studio. The host supplies how to take each shot and how big one is.
 * `tone` is whether the slide is continuous tone (a host asks Calco's `isContinuousTone`); `opaque` is false for a picture with transparency, which a
 * JPEG would paint black. The ORDER of the shots is the cost: a continuous-tone slide is a JPEG first, and the PNG is never taken when the JPEG is large;
 * any other slide is a PNG first.
 * @template T
 * @param {{ png: () => Promise<T>, jpeg: (quality: number) => Promise<T | null>, size: (picture: T) => number }} shooter  `jpeg` takes a quality from 1 to 100 and may return null when the host cannot encode one
 * @param {{ tone: boolean, opaque?: boolean }} slide
 * @param {unknown} [setting]  the `images:` value, a flag's value, or `{ mode, quality }`
 * @returns {Promise<T>}
 */
async function choosePicture(shooter, { tone, opaque = true }, setting = {}) {
  const policy = resolveImagePolicy(setting);
  if (!opaque || policy.mode === 'original') return shooter.png();
  const size = shooter.size;
  if (tone) {
    const jpeg = await shooter.jpeg(policy.quality);
    if (jpeg && size(jpeg) >= PICTURE.toneBytes) return jpeg;
    // A small JPEG: not much continuous tone after all, so let the sizes decide.
    const png = await shooter.png();
    return jpeg && size(png) > PICTURE.flatBytes && size(jpeg) < size(png) * PICTURE.share ? jpeg : png;
  }
  const png = await shooter.png();
  if (size(png) <= PICTURE.flatBytes) return png;
  const jpeg = await shooter.jpeg(policy.quality);
  return jpeg && size(jpeg) < size(png) * PICTURE.share ? jpeg : png;
}

/**
 * The page global a host installs for Calco to write cropped pictures with: lib/core/slide-camera.mjs `encodeCanvas`, or
 * the Studio's worker pool around it. Named in `cropRules`, so Calco uses the shared PNG and JPEG writers, not the
 * browser's own encoders, whose bytes differ by engine.
 */
const PICTURE_WRITER = 'latticeEncodePicture';

/**
 * What Calco is told for the pictures it crops out of a slide (a photo, an icon): lossless under `images: original`, else a JPEG when it wins, by this
 * policy's quality (0 to 1, a canvas's scale) and the sizes rule above.
 * @param {unknown} [setting]  see `choosePicture`
 * @param {{ writer?: boolean }} [host]  `writer`: the host installed `PICTURE_WRITER` on the page, so Calco writes with it
 * @returns {{ lossless: boolean, quality: number, toneBytes: number, flatBytes: number, share: number, encoder?: string }}
 */
function cropRules(setting = {}, { writer = false } = {}) {
  const policy = resolveImagePolicy(setting);
  const rules = { lossless: policy.mode === 'original', quality: policy.quality / 100, toneBytes: PICTURE.toneBytes, flatBytes: PICTURE.flatBytes, share: PICTURE.share };
  return writer ? { ...rules, encoder: PICTURE_WRITER } : rules;
}

/**
 * What an Office export does with one face of a class, from that class's tier: `undefined` embeds nothing (`system`), a string is the characters
 * to keep (`exact`: the ones the deck draws in the face), `null` keeps the whole face (`used`, `full`: we ship no script beyond Latin, so they are
 * the same file). Calco (the Office writer) lists the faces and their characters and is handed the finished font; this is the one place that decides.
 * @param {'exact'|'used'|'full'|'system'} tier
 * @param {string} chars  the characters the deck draws in the face
 * @returns {string|null|undefined}
 */
function faceCut(tier, chars) {
  if (tier === 'system') return undefined;
  return tier === 'exact' ? chars : null;
}

module.exports = { PICTURE, PICTURE_WRITER, choosePicture, cropRules, faceCut };
