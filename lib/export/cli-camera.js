/**
 * lib/export/cli-camera.js — the CLI's half of the slide camera (lib/core/slide-camera.mjs).
 *
 * The camera itself runs in the CLI's Chrome page, the same code the Studio runs in its tab, so a slide is the same
 * pixels from either host. This file does what a page cannot: it injects the camera bundle, and answers the camera's
 * request for a picture's bytes with a confined local read (lib/export/file-confine.js), the same boundary the player
 * and the PDF writer use.
 */
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const URI_FN = '__latticeCameraUri';
const installed = new WeakSet();

/**
 * @param {import('puppeteer').Page} page
 * @param {{ bundlePath: string, confine?: { allows: (p: string) => boolean }, allowRemote?: boolean }} opts
 * @returns {Promise<null | { shoot: (index: number, o?: { scale?: number, type?: 'png'|'jpeg', quality?: number, face?: 'screen'|'export', opaque?: boolean }) => Promise<Buffer>, failed: () => string[] }>}
 *   null when the bundle is missing: the caller keeps its screenshot path and says so.
 */
async function createCliCamera(page, { bundlePath, confine, allowRemote = false }) {
  if (!fs.existsSync(bundlePath)) return null;
  const { fileToDataUri } = require('./html-player.js');
  const failed = [];
  const memo = new Map(); // one read per address for the whole export, however many slides name it
  if (!installed.has(page)) {
    installed.add(page);
    await page.addScriptTag({ content: fs.readFileSync(bundlePath, 'utf8') });
    await page.exposeFunction(URI_FN, async (url) => {
      if (memo.has(url)) return memo.get(url);
      let uri = null;
      if (/^file:/i.test(url)) {
        const abs = fileURLToPath(url.split(/[?#]/)[0]);
        uri = !confine || confine.allows(abs) ? fileToDataUri(abs) : null;
      } else if (allowRemote && /^https?:/i.test(url)) {
        const res = await fetch(url);
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (res.ok && /^image\/[a-z0-9.+-]+$/.test(type)) uri = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      }
      if (!uri) {
        failed.push(url);
        throw new Error('not readable');
      }
      memo.set(url, uri);
      return uri;
    });
  }
  return {
    failed: () => [...failed],
    async shoot(index, { scale, type = 'png', quality = 90, face = 'screen', opaque = false } = {}) {
      // Default to the page's device scale: the raster paths set it per format (the image set's size, a thumbnail's).
      const dsf = scale ?? page.viewport()?.deviceScaleFactor ?? 1;
      const b64 = await page.evaluate(
        async (i, o, fn) => {
          const el = document.querySelectorAll('section[data-lattice-slide]')[i];
          const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { ...o, toDataUri: window[fn] });
          let s = '';
          for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
          return btoa(s);
        },
        index,
        { scale: dsf, type, quality, face, opaque },
        URI_FN,
      );
      return Buffer.from(b64, 'base64');
    },
  };
}

module.exports = { createCliCamera };
