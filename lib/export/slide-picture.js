// One slide as a picture: PNG, or JPEG when that is much smaller. A flat slide stays a lossless
// PNG; a photograph, which is 2 to 6 MB per slide as PNG, becomes a q92 JPEG of a fifth the
// size. The rule, its thresholds and the measurements behind them: docs/src/lib/calco/picture.ts.
//
// The ORDER of the two shots is the cost. A PNG of a photograph takes about 1.2 s to encode, its
// JPEG 0.36 s; a flat slide's PNG takes 0.2 s. So a continuous-tone slide (the page says: raster
// images or smooth gradients cover a quarter of it) is shot as a JPEG first and the PNG is never
// taken when the JPEG is large, and any other slide is shot as a PNG first, as before.
//
// Only for an opaque picture. `omitBackground` keeps a rounded corner as transparency, which a
// JPEG would paint black, so that capture stays PNG.

/**
 * @param {import('puppeteer').ElementHandle} handle  the slide's `section` handle.
 * @param {object} shot  the PNG screenshot options the raster path uses.
 * @returns {Promise<Uint8Array>}  PNG or JPEG bytes (`imageMime` tells them apart).
 */
async function shootPicture(handle, shot) {
  const calco = require('@laticent/calco');
  const policy = require('../core/image-policy.js').resolveImagePolicy(pictureSetting || {});
  // `images: original`: every slide stays a lossless PNG. An explicit `images-quality` replaces calco's default.
  const explicit = Number.isFinite(Number.parseInt(String(pictureSetting?.quality ?? ''), 10));
  const quality = explicit ? policy.quality : Math.round(calco.PICTURE_JPEG_QUALITY * 100);
  const png = async () => Buffer.from(await handle.screenshot(shot));
  const jpeg = async () => Buffer.from(await handle.screenshot({ ...shot, type: 'jpeg', quality }));
  if (shot.omitBackground || policy.mode === 'original') return new Uint8Array(await png());
  if (await handle.evaluate(calco.isContinuousTone)) {
    const j = await jpeg();
    if (j.length >= calco.PICTURE_TONE_JPEG_BYTES) return new Uint8Array(j);
    // A small JPEG: not much continuous tone after all, so let the sizes decide.
    const p = await png();
    return new Uint8Array(calco.worthTryingJpeg(p.length) && calco.jpegWins(p.length, j.length) ? j : p);
  }
  const p = await png();
  if (!calco.worthTryingJpeg(p.length)) return new Uint8Array(p);
  const j = await jpeg();
  return new Uint8Array(calco.jpegWins(p.length, j.length) ? j : p);
}

let pictureSetting = null;
/** The deck's `images:` / `images-quality:` (lib/core/image-policy.js) for this run's slide pictures. */
function setPictureSetting(setting) {
  pictureSetting = setting || null;
}

module.exports = { shootPicture, setPictureSetting };
