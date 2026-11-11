/**
 * lib/export/bleed-ink-stamp.js — the CLI half of a `bleed` slide's automatic ink (lib/core/bleed-ink.mjs decides).
 *
 * The CLI's export page carries no runtime (lattice.js strips it), so the browser pass (lib/transformers/bleed-ink.js) never runs
 * there. This pass makes the same decision before the page renders: for each `bleed` slide whose own `_class` names no color
 * mode, it reads the photo's file through the CLI's confiner, has the host sample the heading band's pixels, and writes the
 * color-mode class that carries the winning ink onto the section, so every later load of the page, and the exported HTML,
 * carry it. A photo it cannot read (a web address, a refused path, a format the sampler cannot draw) leaves the slide as the
 * author wrote it.
 *
 * The host supplies the two things this module cannot do without a browser or a file system: `readPhoto(url)` returns
 * `{ bytes, mime, width, height }` for a confined local file or null, and `samplePixels(dataUri, rect, w, h)` resolves to the
 * RGBA pixels of `rect` (in the photo's own pixels) drawn at `w` × `h`.
 */
const { mapSections, readAttr, scanTags } = require('@laticent/markup');
const { firstCssUrl } = require('../core/css-url');
const { picksBleedInk, bleedSampleRect, bleedInkOfPixels, classesWithInk } = require('../core/bleed-ink');

const SAMPLE_W = 32;
/** The image plugin's panel open tag inside a slide's HTML (read with the shared tag scanner), or null. */
function panelTag(inner) {
  for (const t of scanTags(inner)) {
    if (t.kind !== 'tag' || t.isClose || t.name !== 'div') continue;
    const tag = inner.slice(t.start, t.end);
    if ((readAttr(tag, 'class') || '').split(/\s+/).includes('lattice-bg') && readAttr(tag, 'data-lattice-media') === 'image') return tag;
  }
  return null;
}

/** The slide's photo address: the image plugin's panel inside it, else a background on the section itself. */
function photoUrlOf(openTag, inner) {
  const panel = panelTag(inner);
  const style = panel ? readAttr(panel, 'style') : readAttr(openTag, 'style');
  return style ? firstCssUrl(style) : null;
}

/** The open tag with the ink applied: its classes, and `data-bleed-ink` for the reader that wants to know why. */
function tagWithInk(openTag, ink) {
  const classes = classesWithInk(readAttr(openTag, 'class') || '', ink).join(' ');
  const withClass = /\sclass="[^"]*"/.test(openTag) ? openTag.replace(/\sclass="[^"]*"/, ` class="${classes}"`) : openTag.replace(/^<section\b/i, `<section class="${classes}"`);
  return withClass.replace(/^<section\b/i, `<section data-bleed-ink="${ink}"`);
}

/**
 * @param {string} html  the export document
 * @param {{ readPhoto: (url: string) => ({ bytes: Buffer, mime: string, width: number, height: number } | null),
 *   samplePixels: (dataUri: string, rect: object, w: number, h: number) => Promise<ArrayLike<number> | null>,
 *   slideW: number, slideH: number }} host
 * @returns {Promise<string>}
 */
async function stampBleedInk(html, host) {
  const wanted = [];
  mapSections(html, (openTag, cls, inner) => {
    if (!picksBleedInk(cls, readAttr(openTag, 'data-class') || '')) return null;
    const url = photoUrlOf(openTag, inner);
    if (url) wanted.push(url);
    return null;
  });
  if (!wanted.length) return html;
  const inkByUrl = new Map();
  for (const url of new Set(wanted)) {
    let ink = null;
    try {
      const photo = host.readPhoto(url);
      const rect = photo ? bleedSampleRect(photo.width, photo.height, host.slideW, host.slideH) : null;
      if (rect) {
        const h = Math.max(1, Math.round((SAMPLE_W * rect.h) / rect.w));
        const px = await host.samplePixels(`data:${photo.mime};base64,${photo.bytes.toString('base64')}`, rect, SAMPLE_W, h);
        ink = px ? bleedInkOfPixels(px) : null;
      }
    } catch {
      ink = null;
    }
    inkByUrl.set(url, ink);
  }
  return mapSections(html, (openTag, cls, inner) => {
    if (!picksBleedInk(cls, readAttr(openTag, 'data-class') || '')) return null;
    const ink = inkByUrl.get(photoUrlOf(openTag, inner));
    return ink ? { openTag: tagWithInk(openTag, ink) } : null;
  });
}

module.exports = { stampBleedInk, photoUrlOf, tagWithInk };
