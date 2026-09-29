/**
 * Registry adapter for the `video` component. Kernel:
 * lib/components/imagery/video/video.transform.js.
 *
 * Turns a `section.video`'s authored video-URL bullet into a static poster +
 * play badge + provider label + scannable QR (never an iframe). Idempotent on
 * `.video-embed`.
 */

const engine = require('../components/imagery/video/video.transform');
const { paintUntilDecoded, paintsLoading } = require('../core/image-painting');

const SEL = 'section.video';

function transformDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(SEL)) {
    if (sec.querySelector(':scope .video-embed')) continue; // idempotent
    sec.innerHTML = engine.renderSection(sec.innerHTML, sec.className);
  }
}

// THE POSTER PAINTS UNTIL IT DECODES, in a live preview. The poster is the anchor's own inline
// background-image, so until the file has landed the tile is empty, and a light poster on a dark
// slide stepped from the dark tile to light when it did (followup 2412-p3). A poster the browser
// does not already hold shows the Underpainting over the tile until it has decoded, then the
// painting fades away over it (lib/core/image-painting.js, drawn by base.modifiers.css); a cached
// poster paints at once. ONLY IN A DOCUMENT THAT OPTED IN AS A LIVE PREVIEW
// (`data-lattice-live-media`, lib/core/image-painting.js): an export capture, the Print document, a
// player and the fluid viewer keep painting the poster as before.
const managed = new WeakSet();

function paintPosters(root) {
  const doc = root.ownerDocument || root;
  const view = doc?.defaultView;
  if (!view || typeof view.Image !== 'function' || !paintsLoading(view)) return;
  for (const a of root.querySelectorAll(`${SEL} a.video-poster`)) {
    if (managed.has(a)) continue;
    managed.add(a);
    const m = /url\(\s*['"]?([^'")]+)/i.exec(a.style?.backgroundImage || '');
    if (!m) continue;
    const probe = new view.Image();
    probe.src = m[1];
    paintUntilDecoded(a, probe, view);
  }
}

module.exports = {
  name: 'video',
  selector: SEL,
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    transformDom(root);
    paintPosters(root);
  },
};
