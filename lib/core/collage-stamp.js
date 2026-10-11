/**
 * Node-only half of the `collage` build step: read each photo's size from its file header and
 * stamp the packed grid on a structured `section.collage`.
 *
 * The structure step (lib/components/imagery/collage/collage.transform.js) runs inside the
 * engine render and needs no image sizes. This runs afterward, in the CLI's per-section fixup
 * beside `stampImageBucket`, because only the CLI can read files. The browser preview measures
 * `naturalWidth` instead and calls the same `planStamp`, so both paths pick one layout.
 *
 * A photo that cannot be read (remote, data URL, exotic format) reports `null`; the kernel then
 * uses that photo's `3:2`-style ratio hint, or falls back to the even grid.
 */

const { readDimensions, urlToLocalPath } = require('./image-dimensions');
const { readAttr, readClassAttr } = require('./section-walk');
const collage = require('../components/imagery/collage/collage.transform');

const ENTITY = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" };
const unescapeUrl = (s) => s.replace(/&(amp|quot|lt|gt|#39);/g, (m) => ENTITY[m]);

/**
 * @param {string} sectionHtml  one `<section …>…</section>`
 * @returns {string} the section with the packed grid stamped, or unchanged
 */
function stampCollage(sectionHtml) {
  if (typeof sectionHtml !== 'string' || sectionHtml.indexOf('data-collage="pending"') === -1) return sectionHtml;
  const open = sectionHtml.match(/^<section\b[^>]*>/i);
  if (!open) return sectionHtml;
  const cls = readClassAttr(open[0]);
  if (!/(?:^|\s)collage(?:\s|$)/.test(cls || '')) return sectionHtml;
  const aspects = [];
  const tileRe = /<li class="collage-tile"[^>]*>\s*<img\b[^>]*?\ssrc="([^"]*)"/g;
  let m;
  while ((m = tileRe.exec(sectionHtml))) {
    const local = urlToLocalPath(unescapeUrl(m[1]));
    const dims = local ? readDimensions(local) : null;
    aspects.push(dims && dims.w > 0 && dims.h > 0 ? dims.w / dims.h : null);
  }
  return collage.stampSection(sectionHtml, aspects, collage.optionsFromClass(cls), readAttr(open[0], 'data-orientation') || 'landscape');
}

module.exports = { stampCollage };
