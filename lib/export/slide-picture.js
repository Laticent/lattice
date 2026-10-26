// One slide as a picture: PNG, or JPEG when that is much smaller. A flat slide stays a lossless
// PNG; a photograph, which is 2 to 6 MB per slide as PNG, becomes a JPEG (quality 90 by default) of a fifth the
// size. The rule, its thresholds and the measurements behind them: lib/core/image-policy.js (`choosePicture`).
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
 * @param {{ png: () => Promise<Uint8Array>, jpeg: (quality: number) => Promise<Uint8Array> } | null} [camera]
 * @returns {Promise<Uint8Array>}  PNG or JPEG bytes (`imageMime` tells them apart).
 */
async function shootPicture(handle, shot, camera = null) {
  const calco = require('@laticent/calco');
  const { choosePicture, resolveImagePolicy } = require('../core/image-policy.js');
  // `camera` is the shared slide camera for this slide (lib/export/cli-camera.js); without one, Chrome's own screenshot.
  const png = async () => Buffer.from(camera ? await camera.png() : await handle.screenshot(shot));
  const jpeg = async (quality) => Buffer.from(camera ? await camera.jpeg(quality) : await handle.screenshot({ ...shot, type: 'jpeg', quality }));
  const opaque = !shot.omitBackground;
  // The rule is the shared kernel's (`choosePicture`), so the Studio chooses the same way. The page is asked about tone only when the rule will use it.
  const tone = opaque && resolveImagePolicy(pictureSetting || {}).mode !== 'original' ? await handle.evaluate(calco.isContinuousTone) : false;
  return new Uint8Array(await choosePicture({ png, jpeg, size: (bytes) => bytes.length }, { tone, opaque }, pictureSetting || {}));
}

let pictureSetting = null;
/** The deck's `images:` line (lib/core/image-policy.js) for this run's slide pictures. */
function setPictureSetting(setting) {
  pictureSetting = setting || null;
}

/** What Calco is told for the pictures it crops out of a slide, from this run's `images:` line (lib/core/image-policy.js `cropRules`). */
function cropEncoding() {
  return require('../core/image-policy.js').cropRules(pictureSetting || {});
}

module.exports = { shootPicture, setPictureSetting, cropEncoding };
