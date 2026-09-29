/**
 * image-painting — the Underpainting: what a LIVE PREVIEW shows where a picture has not painted yet.
 *
 * A photo panel or a video poster is an element whose picture is its own CSS background. Until the
 * file has downloaded and decoded, that background paints nothing, so the slide shows an empty card
 * beside finished text (the owner's iPhone, PR #2471: ~3 s of empty panel on a real link). The size
 * arrives long before the picture — `naturalWidth` is set from the file's header — so the text can
 * be final early while the picture is still seconds away.
 *
 * So until the picture has DECODED, the element carries `data-lattice-painting`, and
 * lib/base/base.modifiers.css draws the Underpainting over it: the house Nacre loader's variant for
 * images, a canvas laid down in one brush sweep with soft brushwork drifting across it, all in the
 * deck's own tokens. When the picture has decoded the attribute turns `"done"`, the painting fades
 * away over the real picture beneath it, and then the attribute goes. A picture the browser already
 * holds (a revisit, an edit re-creating the section) has decoded the moment `src` is set and never
 * shows the painting. One that fails turns the painting muted and still (`paintStill`); so does one
 * still hanging at PAINTING_CAP_MS, which then fades away over the picture if it lands after all.
 *
 * LIVE PREVIEWS ONLY, BY OPT-IN: a document paints only when its <html> carries
 * `data-lattice-live-media`, which the three live builders set (the Studio slide in
 * single-slide-render, the Playground filmstrip in deck-render, the Stage window). NOT the reveal
 * gate's flag: the Studio's export capture frame and its Print document are built by the same
 * preview builder, gate and all, and a painting still fading at capture time would be baked into a
 * PDF, a PPTX or a shared player (the checker's reproduction on PR #2471). Default off, so a new
 * builder is an export until it says otherwise.
 */
const LIVE_MEDIA = 'data-lattice-live-media';

/** Does this window's document paint loading pictures? */
function paintsLoading(view) {
  try {
    const root = view?.document?.documentElement;
    return !!root && typeof root.hasAttribute === 'function' && root.hasAttribute(LIVE_MEDIA);
  } catch (_e) {
    return false;
  }
}

const PAINTING = 'data-lattice-painting';
const PAINTING_FADE_MS = 450; // matches the pseudo-elements' opacity transition in base.modifiers.css
const PAINTING_CAP_MS = 12000;

/**
 * Hold `el`'s Underpainting until `probe` (an Image whose `src` is already set to the picture `el`
 * paints) has decoded. Returns whether the painting was shown.
 * @param {Element} el the element whose background is the picture.
 * @param {HTMLImageElement} probe
 * @param {Window} view the element's window, for its timers.
 */
function paintUntilDecoded(el, probe, view) {
  if (!el || typeof el.setAttribute !== 'function' || !probe || !view || typeof view.setTimeout !== 'function') return false;
  // Already held (or already failed): it paints at once, or its stand-in does. `complete` alone,
  // not `naturalWidth`: an SVG with no intrinsic size reports 0 even when cached, and would
  // flash the painting on every re-render.
  if (probe.complete) return false;
  // A later pass over the same element (a patch re-walks the document) leaves a painting in
  // flight alone: setting it again would bring a painting back while it fades away.
  if (el.hasAttribute(PAINTING) && el.getAttribute(PAINTING) !== 'still') return true;
  const canDecode = typeof probe.decode === 'function';
  if (!canDecode && typeof probe.addEventListener !== 'function') return false;
  // The canvas is laid down in one sweep the FIRST time a picture paints in this document. A
  // section re-created while the same picture is still loading (the Playground rebuilds it on
  // every keystroke) resumes the painting without replaying the sweep: `"again"`.
  let again = false;
  try {
    const seen = view.__latticePaintSeen || (view.__latticePaintSeen = new Set());
    again = seen.has(probe.src);
    seen.add(probe.src);
  } catch (_e) { /* a frozen realm just replays the sweep */ }
  el.setAttribute(PAINTING, again ? 'again' : '');
  let done = false;
  const clear = () => el.removeAttribute(PAINTING);
  // A picture that has not decoded by the cap is not claimed to be loading any more: the painting
  // goes muted and still, and it still gives way (`show`) if the picture lands after all. An empty
  // card is never shown in its place.
  const cap = view.setTimeout(() => {
    if (!done) paintStill(el);
  }, PAINTING_CAP_MS);
  const show = () => {
    if (done) return;
    done = true;
    view.clearTimeout(cap);
    el.setAttribute(PAINTING, 'done');
    view.setTimeout(clear, PAINTING_FADE_MS + 50);
  };
  // A picture that will not come keeps the painting, muted and still (`paintStill`).
  const fail = () => {
    if (done) return;
    done = true;
    view.clearTimeout(cap);
    paintStill(el);
  };
  if (canDecode) probe.decode().then(show, () => (probe.complete && probe.naturalWidth > 0 ? show() : fail()));
  else {
    probe.addEventListener('load', show);
    probe.addEventListener('error', fail);
  }
  return true;
}

/**
 * The Underpainting's OTHER MOOD: a picture that is not coming. A web picture the reader has not
 * chosen to load (lib/core/remote-ref.js swaps its `url()` for a hatch) or one that failed shows the
 * same painting, muted and still, instead of a second placeholder with a look of its own: ONE
 * placeholder, the owner's call (PR #2471). Still, so it never claims to be loading. Live previews
 * only (callers gate on `paintsLoading`); an export keeps the hatch it always had.
 * @param {Element} el the element whose background is (or would be) the picture.
 */
function paintStill(el) {
  if (!el || typeof el.setAttribute !== 'function') return;
  el.setAttribute(PAINTING, 'still');
}

/** Is this element's picture the blocked-web-image hatch (remote-ref's `WEB_BG_PLACEHOLDER`)? */
function isBlockedHatch(el) {
  const bg = (el && el.style && el.style.backgroundImage) || '';
  return /repeating-linear-gradient/i.test(bg) && !/url\(/i.test(bg);
}

module.exports = { paintUntilDecoded, paintStill, isBlockedHatch, paintsLoading, PAINTING, LIVE_MEDIA, PAINTING_FADE_MS, PAINTING_CAP_MS };
