/**
 * lib/export/cli-camera.js — the CLI's half of the slide camera (lib/core/slide-camera.mjs).
 *
 * The camera itself runs in the CLI's Chrome page, the same code the Studio runs in its tab, so a slide is the same
 * pixels from either host. This file does what a page cannot: it injects the camera bundle, and answers the camera's
 * request for a picture's or a font's bytes with a confined local read (lib/core/file-confine.js), the same boundary the player
 * and the PDF writer use.
 *
 * Two safeguards. The page runs the deck's own scripts, so the camera does not run beside them: it runs in an ISOLATED
 * WORLD (Chrome's name for a second JavaScript context over the same DOM, the one extensions use). The deck's scripts
 * cannot see its globals, so they cannot stand in for `captureSlide`, and the read hook is bound into that world only, so
 * they cannot call it. Before #2904's follow-up the camera shared the deck's world and guarded the hook with a per-run
 * secret, which a deck that predefined `LatticePdfCompose` received with the camera's first call. What the deck can still do is
 * SEE a picture once the camera has inlined it: a custom element on the slide runs its callbacks in the deck's world even in the
 * camera's clone, so it can read the `data:` URI of a confined picture the slide names. That is no more than the PDF path's
 * `__latticePdfAsset` already answers the deck. And a slide the camera
 * cannot photograph does not fail the export: that one slide falls back to Chrome's own screenshot, with a warning.
 */
const fs = require('node:fs');
const { localPathOfFileUrl } = require('../core/file-confine');
const { resolveImagePolicy } = require('../core/image-policy.js');
const { PICTURE_WRITER } = require('../core/office-export-policy.js');
const { assetKind, MAX_BYTES } = require('./pdf-asset-reader.js');

const WORLD = '__latticeCamera';
const URI_FN = '__latticeCameraUri';
const REMOTE_TIMEOUT_MS = 20_000;
const worlds = new WeakMap(); // page -> Promise<{ call, read, src, pictureWriter? }>, one world per page

/** Run `fn(...args)` in the camera's world and return its value; a thrown error comes back as an Error. */
async function callIn(client, contextId, fn, ...args) {
  const r = await client.send('Runtime.callFunctionOn', {
    functionDeclaration: String(fn),
    executionContextId: contextId,
    arguments: args.map((value) => ({ value })),
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'camera error');
  return r.result.value;
}

/**
 * The camera's world on `page`: the bundle loaded into it, and the read hook bound to it alone. Every Chrome page is one
 * frame here (the CLI renders the deck as the top document), so the world is made on the main frame. The returned `read`
 * answers the hook; each export swaps in its own.
 */
async function openWorld(page, bundleSrc) {
  const world = { src: bundleSrc, read: async () => null, call: null };
  const client = await page.createCDPSession();
  // The binding is named for the world, so Chrome installs it there and nowhere else. Runtime must be on, and the binding
  // added, before the world exists: measured, a named binding added in any other order never reaches the world.
  await client.send('Runtime.enable');
  await client.send('Runtime.addBinding', { name: URI_FN, executionContextName: WORLD });
  const { frameTree } = await client.send('Page.getFrameTree');
  const { executionContextId: contextId } = await client.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: WORLD });
  client.on('Runtime.bindingCalled', async (e) => {
    if (e.name !== URI_FN || e.executionContextId !== contextId) return;
    let id, url;
    try {
      ({ id, url } = JSON.parse(e.payload));
    } catch {
      return;
    }
    const uri = await world.read(String(url));
    await callIn(client, contextId, (i, u) => globalThis.__latticeCameraSettle(i, u), id, uri).catch(() => {});
  });
  const loaded = await client.send('Runtime.evaluate', { expression: bundleSrc, contextId });
  if (loaded.exceptionDetails) throw new Error(`the camera bundle did not load: ${loaded.exceptionDetails.text}`);
  // The page-side half of the read: a promise per request, settled by Node through `__latticeCameraSettle`.
  await callIn(client, contextId, (fnName) => {
    const pending = new Map();
    let seq = 0;
    const bind = globalThis[fnName];
    delete globalThis[fnName];
    globalThis.__latticeCameraRead = (url) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      bind(JSON.stringify({ id, url }));
    });
    globalThis.__latticeCameraSettle = (id, uri) => {
      const p = pending.get(id);
      pending.delete(id);
      if (p) uri ? p.resolve(uri) : p.reject(new Error('not readable'));
    };
  }, URI_FN);
  world.call = (fn, ...args) => callIn(client, contextId, fn, ...args);
  return world;
}

// A font address, by its extension: the camera asks for the faces a deck's own `@font-face` rules name (its `style:` block, a
// `--css` sheet) as well as for pictures, because a face the SVG cannot carry as data draws in the machine's fallback.
const FONT_URL = /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i;
// The MIME a font's magic number says it is (the same five signatures `assetKind` in pdf-asset-reader.js accepts).
const FONT_MIME = new Map([
  [0x774f4646, 'font/woff'], // wOFF
  [0x774f4632, 'font/woff2'], // wOF2
  [0x00010000, 'font/ttf'],
  [0x74727565, 'font/ttf'], // true
  [0x4f54544f, 'font/otf'], // OTTO
]);

/**
 * A local font file as a `data:` URI, or null. The file must be regular, under the PDF reader's size cap, and its bytes must be a
 * font (by magic number, not by the name the deck gave it), so a renamed `notes.txt.woff2` crosses back as nothing.
 * @param {string} absPath
 */
function fontFileToDataUri(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    const buf = fs.readFileSync(absPath);
    if (assetKind(buf) !== 'font') return null;
    return `data:${FONT_MIME.get(buf.readUInt32BE(0))};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * The camera's read hook, without a page: a picture or font address to a `data:` URI, or null and a warning that names it.
 * Local files are read only inside `confine` (lib/core/file-confine.js: the deck's folder, Lattice's install, a named stylesheet's
 * folder), the same roots the PDF writer's reader (pdf-asset-reader.js) reads its fonts from, so a PNG and a PDF of one deck draw the
 * same faces. Pictures go through the player's picture-only reader (html-player.js `fileToDataUri`); fonts through `fontFileToDataUri`.
 * A remote font is never fetched, `--allow-remote` or not: that flag admits remote PICTURES only.
 * @param {{ confine?: { allows: (p: string) => boolean }, allowRemote?: boolean, warn?: (message: string) => void }} [opts]
 * @returns {{ read: (url: string) => Promise<string|null>, failed: () => string[] }}
 */
function createCameraReader({ confine, allowRemote = false, warn = () => {} } = {}) {
  const { fileToDataUri } = require('./html-player.js');
  const failed = [];
  const memo = new Map(); // one read per address for the whole export, however many slides name it (a failure too)

  async function read(url) {
    if (memo.has(url)) return memo.get(url);
    const font = FONT_URL.test(url);
    let uri = null;
    try {
      if (/^file:/i.test(url)) {
        // `localPathOfFileUrl` refuses a host-qualified address (`file://server/share/…`) BEFORE any
        // file-system call: on Windows `fileURLToPath` would turn it into a UNC path, and resolving that
        // opens a network connection to the named host.
        const abs = localPathOfFileUrl(url);
        if (abs && (!confine || confine.allows(abs))) uri = font ? fontFileToDataUri(abs) : fileToDataUri(abs);
      } else if (allowRemote && !font && /^https?:/i.test(url)) {
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
      warn(
        font
          ? `  ⚠ a font could not be read for the export, so text set in it draws in a fallback face: ${url}` +
              (/^file:/i.test(url) ? ' (a local font loads only from inside the deck folder)' : ' (remote fonts are not fetched; put the file in the deck folder)')
          : `  ⚠ a picture could not be read for the export, so it is left out: ${url}`,
      );
    }
    return uri;
  }

  return { read, failed: () => [...failed] };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {{ bundlePath: string, confine?: { allows: (p: string) => boolean }, allowRemote?: boolean, warn?: (message: string) => void }} opts
 * @returns {Promise<null | { shoot: (index: number, o?: { scale?: number, type?: 'png'|'jpeg'|'webp', quality?: number, face?: 'screen'|'export', opaque?: boolean, fastPng?: boolean }) => Promise<Buffer>, failed: () => string[], installPictureWriter: () => Promise<boolean> }>}
 *   null when the bundle is missing: the caller keeps its screenshot path and says so.
 */
async function createCliCamera(page, { bundlePath, confine, allowRemote = false, warn = () => {} }) {
  if (!fs.existsSync(bundlePath)) return null;
  const { read, failed } = createCameraReader({ confine, allowRemote, warn });

  if (!worlds.has(page)) worlds.set(page, openWorld(page, fs.readFileSync(bundlePath, 'utf8')));
  const world = await worlds.get(page);
  // Each export answers reads with its own confinement and memo; the world outlives one createCliCamera call.
  world.read = read;

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
    failed,
    /**
     * Install the shared picture writers under the name Calco writes its cropped pictures with (lib/core/office-export-policy.js
     * `PICTURE_WRITER`), and say whether they are there. Calco runs in the deck's world, so they go there; they encode pixels
     * Calco hands them and read nothing, so a deck that swaps them spoils only its own pictures. Only an editable office
     * export asks, so no other export parses the bundle a second time (about 0.2 s). The PDF path may have loaded it already.
     * A bundle built before encodeCanvas existed installs nothing and this says false: Calco then keeps its own encoders.
     */
    async installPictureWriter() {
      world.pictureWriter ??= (async () => {
        const has = await page.evaluate(() => typeof globalThis.LatticePdfCompose?.encodeCanvas === 'function');
        if (!has) await page.addScriptTag({ content: world.src });
        return page.evaluate((name) => {
          const fn = globalThis.LatticePdfCompose?.encodeCanvas;
          if (typeof fn === 'function') globalThis[name] = fn;
          return typeof fn === 'function';
        }, PICTURE_WRITER);
      })();
      return world.pictureWriter;
    },
    async shoot(index, { scale, type = 'png', quality = resolveImagePolicy({}).quality, face = 'screen', opaque = false, fastPng = false } = {}) {
      // Default to the page's device scale: the raster paths set it per format (the image set's size, a thumbnail's).
      const dsf = scale ?? page.viewport()?.deviceScaleFactor ?? 1;
      try {
        const b64 = await world.call(
          async (i, o) => {
            const el = document.querySelectorAll('section[data-lattice-slide]')[i];
            const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { ...o, toDataUri: globalThis.__latticeCameraRead });
            let s = '';
            for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
            return btoa(s);
          },
          index,
          { scale: dsf, type, quality, face, opaque, fastPng },
        );
        return Buffer.from(b64, 'base64');
      } catch (e) {
        warn(`  ⚠ slide ${index + 1}: the slide camera failed (${String(e?.message || e).split('\n')[0]}); using Chrome's screenshot for it`);
        return native(index, { scale: dsf, type, quality, opaque });
      }
    },
  };
}

module.exports = { createCliCamera, createCameraReader, fontFileToDataUri };
