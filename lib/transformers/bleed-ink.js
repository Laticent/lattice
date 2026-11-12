/**
 * bleed-ink transformer: the RUNTIME (browser) half of a `bleed` slide's automatic ink.
 *
 * A `bleed` slide whose own `_class` names no color mode picks its ink from its photo (lib/core/bleed-ink.mjs decides): this
 * pass finds the photo, draws the band under the heading into a small canvas, and puts the color-mode class that carries the
 * winning ink on the slide. It serves the hosts that run the runtime: the Studio, the Playground, the fluid viewer and a Marp
 * bundle. The CLI does the same before its page renders, from the file itself (lattice.js `stampBleedInk`), because its export
 * page carries no runtime.
 *
 * Where the photo is, by host: the image plugin's panel inside the slide (`.lattice-bg[data-lattice-media="image"]`, outside any
 * plugin's drawing), a `![bg]` the engine set as the section's own background, or, in a Marp bundle, Marp's background layer:
 * Marp renders such a slide as sibling sections (`data-marpit-advanced-background` = background, content, pseudo) sharing its
 * classes, so the ink goes on all of them.
 *
 * A photo that will not load, or whose pixels the page may not read (a picture from another site without CORS), leaves the
 * slide as the author wrote it: the safe failure. applyToDom only: the engine's string path has no pixels.
 */
const { picksBleedInk, bleedBandFor, bleedSampleRect, bleedInkOfPixels, classesWithInk } = require('../core/bleed-ink');
const { firstCssUrl } = require('../core/css-url');

const DONE = 'data-bleed-ink';
const PENDING = 'data-bleed-ink-pending';
const SAMPLE_W = 32;
// The ink each photo gave, by band and URL, for the life of the page: a slide re-rendered by a live edit asks again for free.
const inkByKey = new Map();

/** The sections that make up one slide: in a Marp bundle its advanced-background siblings, else the section alone. */
function slideLayers(section) {
  if (!section.hasAttribute('data-marpit-advanced-background')) return [section];
  const svg = section.closest('svg');
  return svg ? [...svg.querySelectorAll('section[data-marpit-advanced-background]')] : [section];
}

/** The slide's photo address, or null. */
function photoUrl(section) {
  for (const layer of slideLayers(section)) {
    const panel = [...layer.querySelectorAll('.lattice-bg[data-lattice-media="image"]')].find((el) => !el.closest('[data-lattice-plugin]'));
    const fig = layer.getAttribute('data-marpit-advanced-background') === 'background' ? layer.querySelector('figure') : null;
    for (const el of [panel, fig, layer]) {
      const url = el ? firstCssUrl(el.getAttribute('style') || '') : null;
      if (url) return url;
    }
  }
  return null;
}

/** Put the ink on every layer of the slide. */
function applyInk(section, ink) {
  for (const layer of slideLayers(section)) {
    const next = classesWithInk([...layer.classList], ink);
    layer.className = next.join(' ');
    layer.setAttribute(DONE, ink);
    layer.removeAttribute(PENDING);
  }
}

/** Read the photo's heading band in a canvas and resolve to its ink, or null when the pixels cannot be read. */
function sampleInk(doc, url, slideW, slideH, band) {
  return new Promise((resolve) => {
    const img = new (doc.defaultView.Image)();
    // Asked for with CORS, as the Studio's own photo sampler asks (docs/src/components/studio/card-ink-sampler.ts): the preview is
    // a sandboxed frame whose origin is opaque, so a site picture is cross-origin there, and a canvas may read it only when it was
    // fetched with CORS. A `data:` or `blob:` picture is the page's own.
    if (!/^(?:data|blob):/i.test(url)) img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const rect = bleedSampleRect(img.naturalWidth, img.naturalHeight, slideW, slideH, band);
        if (!rect) return resolve(null);
        const canvas = doc.createElement('canvas');
        canvas.width = SAMPLE_W;
        canvas.height = Math.max(1, Math.round((SAMPLE_W * rect.h) / rect.w));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
        resolve(bleedInkOfPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch {
        resolve(null); // a tainted canvas: the page may not read this picture
      }
    };
    img.src = url;
  });
}

function applyToDom(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : null;
  const doc = scope ? (scope.ownerDocument || scope) : null;
  if (!doc?.defaultView?.Image) return;
  for (const section of scope.querySelectorAll('section.bleed:not(section section)')) {
    if (section.hasAttribute(DONE) || section.hasAttribute(PENDING)) continue;
    const marp = section.getAttribute('data-marpit-advanced-background');
    if (marp && marp !== 'content') continue; // the content layer decides for the slide
    if (!picksBleedInk([...section.classList], section.getAttribute('data-class') || '')) continue;
    const url = photoUrl(section);
    if (!url) continue;
    // The band the slide's words sit in (the top, or the middle for a layout that centers them) is part of the question.
    const band = bleedBandFor([...section.classList]);
    const key = `${band.top}|${url}`;
    if (inkByKey.has(key)) {
      const ink = inkByKey.get(key);
      if (ink) applyInk(section, ink);
      continue;
    }
    section.setAttribute(PENDING, '');
    const w = section.clientWidth || 16;
    const h = section.clientHeight || 9;
    sampleInk(doc, url, w, h, band).then((ink) => {
      inkByKey.set(key, ink);
      if (ink) applyInk(section, ink);
      else section.removeAttribute(PENDING);
    });
  }
}

module.exports = {
  name: 'bleed-ink',
  layouts: ['bleed'],
  selector: 'section.bleed',
  applyToDom,
  // exported for unit tests
  photoUrl,
  slideLayers,
};
