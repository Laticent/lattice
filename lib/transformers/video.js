/**
 * Registry adapter for the `video` component. Kernel:
 * lib/components/imagery/video/video.transform.js.
 *
 * LAYS OUT the poster figure the video plugin drew (lib/plugins/video): head, lead, coda and, on a `qr`
 * slide, the code. It reads no slide text. The old pass read the authored bullet from the rendered page, and again from the
 * runtime's DOM, which is the attack engineering/decisions/2026-10-16-media-plugins.md § 4.5 closes; the address now
 * comes only from the author's `@video{…}` span, at parse time. Idempotent on `.video-card`. Never an iframe.
 */

const engine = require('../components/imagery/video/video.transform');
const { paintUntilDecoded, paintStill, isBlockedHatch, paintsLoading } = require('../core/image-painting');
const { firstCssUrl } = require('../core/css-url');

const SEL = 'section.video';

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
  // Only the plugin's own figure: a plugin's drawing (`[data-lattice-plugin]`) is hostile text, whatever classes it wears.
  for (const a of root.querySelectorAll(`${SEL} figure[data-lattice-media="video"] a.video-poster`)) {
    if (managed.has(a) || a.closest('[data-lattice-plugin]')) continue;
    managed.add(a);
    // Quote-aware (lib/core/css-url.js): an SVG data URI carries `)` and `'`, which ended the old match.
    const posterUrl = firstCssUrl(a.style?.backgroundImage || '');
    if (!posterUrl) {
      // A web poster the reader has not chosen to load: the painting, muted and still.
      if (isBlockedHatch(a)) paintStill(a);
      continue;
    }
    const probe = new view.Image();
    probe.src = posterUrl;
    paintUntilDecoded(a, probe, view);
  }
}

module.exports = {
  name: 'video',
  selector: SEL,
  applyToHtml(html, ctx) {
    return engine.applyToRenderedHtml(html, ctx);
  },
  // The layout is composed on the HTML path only; the DOM path just paints posters.
  readsText: false,
  applyToDom(root) {
    paintPosters(root);
  },
};
