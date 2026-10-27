/**
 * lib/export/cli-camera.js — the CLI's half of the slide camera (lib/core/slide-camera.mjs).
 *
 * The camera itself runs in the CLI's Chrome page, the same code the Studio runs in its tab, so a slide is the same
 * pixels from either host. This file does what a page cannot: it injects the camera bundle, and answers the camera's
 * request for a picture's bytes with a confined local read (lib/export/file-confine.js), the same boundary the player
 * and the PDF writer use.
 *
 * Two safeguards. The read hook is exposed to the page, and the page runs the deck's own scripts, so every call must carry a
 * per-run secret that only the camera's own call holds (a deck script cannot read an argument it was never given). And a slide
 * the camera cannot photograph does not fail the export: that one slide falls back to Chrome's own screenshot, with a warning.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { resolveImagePolicy } = require('../core/image-policy.js');
const { PICTURE_WRITER } = require('../core/office-export-policy.js');

const URI_FN = '__latticeCameraUri';
const installed = new WeakSet();
const writers = new WeakMap();
const REMOTE_TIMEOUT_MS = 20_000;

/**
 * @param {import('puppeteer').Page} page
 * @param {{ bundlePath: string, confine?: { allows: (p: string) => boolean }, allowRemote?: boolean, warn?: (message: string) => void }} opts
 * @returns {Promise<null | { shoot: (index: number, o?: { scale?: number, type?: 'png'|'jpeg'|'webp', quality?: number, face?: 'screen'|'export', opaque?: boolean, fastPng?: boolean }) => Promise<Buffer>, failed: () => string[] }>}
 *   null when the bundle is missing: the caller keeps its screenshot path and says so.
 */
async function createCliCamera(page, { bundlePath, confine, allowRemote = false, warn = () => {} }) {
  if (!fs.existsSync(bundlePath)) return null;
  const { fileToDataUri } = require('./html-player.js');
  const failed = [];
  const memo = new Map(); // one read per address for the whole export, however many slides name it (a failure too)
  const token = crypto.randomBytes(16).toString('hex');
  if (!installed.has(page)) {
    installed.add(page);
    // The PDF path has loaded the same bundle already.
    const has = await page.evaluate(() => !!globalThis.LatticePdfCompose?.captureSlide);
    if (!has) await page.addScriptTag({ content: fs.readFileSync(bundlePath, 'utf8') });
    // The shared picture writers, under the name Calco writes its cropped pictures with (lib/core/office-export-policy.js `PICTURE_WRITER`).
    // A bundle built before encodeCanvas existed installs nothing, and the camera says so (`pictureWriter`): Calco then
    // keeps its own encoders rather than fail on a missing writer.
    writers.set(page, await page.evaluate((name) => {
      const fn = globalThis.LatticePdfCompose.encodeCanvas;
      if (typeof fn === 'function') globalThis[name] = fn;
      return typeof fn === 'function';
    }, PICTURE_WRITER));
    await page.exposeFunction(URI_FN, async (secret, url) => {
      if (secret !== token) throw new Error('not the camera');
      if (memo.has(url)) {
        const hit = memo.get(url);
        if (hit === null) throw new Error('not readable');
        return hit;
      }
      let uri = null;
      try {
        if (/^file:/i.test(url)) {
          const abs = fileURLToPath(url.split(/[?#]/)[0]);
          uri = !confine || confine.allows(abs) ? fileToDataUri(abs) : null;
        } else if (allowRemote && /^https?:/i.test(url)) {
          const res = await fetch(url, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
          const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (res.ok && /^image\/[a-z0-9.+-]+$/.test(type)) uri = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
        }
      } catch {
        uri = null;
      }
      memo.set(url, uri);
      if (!uri) {
        failed.push(url);
        warn(`  ⚠ a picture could not be read for the export, so it is left out: ${url}`);
        throw new Error('not readable');
      }
      return uri;
    });
  }

  /** Chrome's own screenshot of one slide: the fallback for a slide the camera could not photograph. */
  async function native(index, { scale, type, quality, opaque }) {
    const handle = (await page.$$('section[data-lattice-slide]'))[index];
    const dsf = page.viewport()?.deviceScaleFactor ?? 1;
    const resize = scale !== dsf;
    if (resize) await page.setViewport({ ...page.viewport(), deviceScaleFactor: scale });
    try {
      await handle.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top));
      const shot = type === 'png' ? { type: 'png', omitBackground: !opaque } : { type, quality, omitBackground: false };
      return Buffer.from(await handle.screenshot(shot));
    } finally {
      if (resize) await page.setViewport({ ...page.viewport(), deviceScaleFactor: dsf });
    }
  }

  return {
    failed: () => [...failed],
    /** The shared picture writers are on the page under `PICTURE_WRITER`, for Calco's cropped pictures. */
    pictureWriter: writers.get(page) === true,
    async shoot(index, { scale, type = 'png', quality = resolveImagePolicy({}).quality, face = 'screen', opaque = false, fastPng = false } = {}) {
      // Default to the page's device scale: the raster paths set it per format (the image set's size, a thumbnail's).
      const dsf = scale ?? page.viewport()?.deviceScaleFactor ?? 1;
      try {
        const b64 = await page.evaluate(
          async (i, o, fn, secret) => {
            const el = document.querySelectorAll('section[data-lattice-slide]')[i];
            const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { ...o, toDataUri: (u) => window[fn](secret, u) });
            let s = '';
            for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
            return btoa(s);
          },
          index,
          { scale: dsf, type, quality, face, opaque, fastPng },
          URI_FN,
          token,
        );
        return Buffer.from(b64, 'base64');
      } catch (e) {
        warn(`  ⚠ slide ${index + 1}: the slide camera failed (${String(e?.message || e).split('\n')[0]}); using Chrome's screenshot for it`);
        return native(index, { scale: dsf, type, quality, opaque });
      }
    },
  };
}

module.exports = { createCliCamera };
