// One slide as a picture: PNG, or JPEG when that is much smaller. A flat slide stays a lossless
// PNG; a photograph, which is 2 to 6 MB per slide as PNG, becomes a q92 JPEG of a tenth the
// size. The choice, its thresholds and the measurement behind them: docs/src/lib/calco/picture.ts.
//
// Only for an opaque picture. `omitBackground` keeps a rounded corner as transparency, which a
// JPEG would paint black, so that capture stays PNG.

/**
 * @param {import('puppeteer').ElementHandle} handle  the slide's `section` handle.
 * @param {object} shot  the PNG screenshot options the raster path uses.
 * @returns {Promise<Uint8Array>}  PNG or JPEG bytes (`imageMime` tells them apart).
 */
async function shootPicture(handle, shot) {
  const { PICTURE_JPEG_QUALITY, worthTryingJpeg, jpegWins } = require('@laticent/calco');
  const png = Buffer.from(await handle.screenshot(shot));
  if (shot.omitBackground || !worthTryingJpeg(png.length)) return new Uint8Array(png);
  const jpeg = Buffer.from(await handle.screenshot({ ...shot, type: 'jpeg', quality: Math.round(PICTURE_JPEG_QUALITY * 100) }));
  return new Uint8Array(jpegWins(png.length, jpeg.length) ? jpeg : png);
}

module.exports = { shootPicture };
