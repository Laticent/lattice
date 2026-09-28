/**
 * Registry adapter for the `video` component. Kernel:
 * lib/components/imagery/video/video.transform.js.
 *
 * Turns a `section.video`'s authored video-URL bullet into a static poster +
 * play badge + provider label + scannable QR (never an iframe). Idempotent on
 * `.video-embed`.
 */

const engine = require('../components/imagery/video/video.transform');

const SEL = 'section.video';

function transformDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(SEL)) {
    if (sec.querySelector(':scope .video-embed')) continue; // idempotent
    sec.innerHTML = engine.renderSection(sec.innerHTML, sec.className);
  }
}

// THE POSTER FADES IN, in a live preview. The poster is the anchor's own inline
// background-image, painted over the tile's surface (`--bg-alt`) when it lands. On a dark
// slide that surface is dark, so a light poster STEPPED from dark to light (tile luminance
// ~26 to ~232, followup 2412-p3), and no tile color avoids it. So while a poster the browser
// does not already hold is loading, `data-poster-pending` takes the image off the anchor and
// draws it on the anchor's `::before` (video.styles.css), transparent; once it has decoded,
// `"in"` fades that layer up, and after the fade the anchor paints the same image itself
// again. A cached poster has its size the moment `src` is set and is left alone: no fade.
// ONLY IN A LIVE PREVIEW, keyed as lib/transformers/image-adaptive.js keys its placeholder
// (`__latticeFontsSettled` is a boolean only in a document with a reveal gate), so an
// export capture, a player and the fluid viewer keep painting the poster as before.
const POSTER_PENDING = 'data-poster-pending';
const POSTER_FADE_MS = 280; // matches the `::before` transition in video.styles.css
const POSTER_CAP_MS = 8000; // a poster that never loads stops being managed; the anchor shows whatever lands
const managed = new WeakSet();

function fadePosters(root) {
  const doc = root.ownerDocument || root;
  const view = doc?.defaultView;
  if (!view || typeof view.__latticeFontsSettled !== 'boolean' || typeof view.Image !== 'function' || typeof view.setTimeout !== 'function') return;
  for (const a of root.querySelectorAll(`${SEL} a.video-poster`)) {
    if (managed.has(a)) continue;
    managed.add(a);
    const bg = a.style?.backgroundImage || '';
    const m = /url\(\s*['"]?([^'")]+)/i.exec(bg);
    if (!m) continue;
    const probe = new view.Image();
    probe.src = m[1];
    if (probe.complete && probe.naturalWidth > 0) continue; // already held: it paints at once
    a.style.setProperty('--video-poster', bg);
    a.setAttribute(POSTER_PENDING, '');
    let done = false;
    const clear = () => {
      a.removeAttribute(POSTER_PENDING);
      a.style.removeProperty('--video-poster');
    };
    const cap = view.setTimeout(() => { if (!done) { done = true; clear(); } }, POSTER_CAP_MS);
    const show = () => {
      if (done) return;
      done = true;
      view.clearTimeout(cap);
      a.setAttribute(POSTER_PENDING, 'in');
      view.setTimeout(clear, POSTER_FADE_MS + 40);
    };
    // A poster that will not load shows the tile, as the anchor would have: nothing to fade in.
    const fail = () => { if (!done) { done = true; view.clearTimeout(cap); clear(); } };
    if (typeof probe.decode === 'function') probe.decode().then(show, () => (probe.complete && probe.naturalWidth > 0 ? show() : fail()));
    else { probe.onload = show; probe.onerror = fail; }
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
    fadePosters(root);
  },
  POSTER_PENDING,
};
