/**
 * lib/export/chrome-recode.js — the CLI's JPEG encoder for the player: the Studio's own function, run in a blank Chrome page.
 *
 * The shared image policy (lib/core/image-policy.js) decides what to shrink; `encodeJpegInPage`
 * (lib/core/image-recode.mjs) decodes and scales with the browser's canvas and writes with the shared JPEG encoder
 * (lib/core/jpeg-encode.mjs). The Studio calls it in the user's tab. The CLI has no canvas in Node, so it sends both
 * functions' source into a page of the browser it already launched, and both produce the same bytes.
 */

/**
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<{ encode: (bytes: Uint8Array, mime: string, plan: object) => Promise<Uint8Array|null>, close: () => Promise<void> }>}
 */
async function createChromeEncoder(browser) {
  const { encodeJpegInPage } = await import('../core/image-recode.mjs');
  const { createJpegEncoder } = await import('../core/jpeg-encode.mjs');
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>recode</title>');
  await page.evaluate(`window.__latticeEncode = ${encodeJpegInPage.toString()}; window.__latticeJpeg = ${createJpegEncoder.toString()}; window.__latticeUnb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));`);
  return {
    async encode(bytes, mime, plan) {
      const b64 = await page.evaluate(
        async (data, type, p) => {
          const out = await window.__latticeEncode(window.__latticeUnb64(data), type, p, window.__latticeJpeg);
          if (!out) return null;
          let s = '';
          for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
          return btoa(s);
        },
        Buffer.from(bytes).toString('base64'),
        mime,
        plan,
      );
      return b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : null;
    },
    close: () => page.close().catch(() => {}),
  };
}

module.exports = { createChromeEncoder };
