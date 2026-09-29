/**
 * image-adaptive transformer — the RUNTIME (browser) half of the adaptive
 * `image` layout's composition resolver.
 *
 * The build/export path (lattice-emulator.js) reads each asset's intrinsic
 * dimensions from the file header (lib/core/image-dimensions.js, fs-based) and
 * stamps `data-img-bucket` + `data-img-composition` before the PDF is rendered —
 * deterministic, no image load. The browser has no fs, so this DOM walk does the
 * same job by MEASURING the asset (`new Image()` → naturalWidth/Height) and
 * stamping the same two attributes, so the docs-site preview / playground / live
 * marp-preview resolve the identical composition the export does.
 *
 * Single source of truth (HARD RULE #1): the bucketing + resolution table live
 * once in lib/core/image-aspect.js (pure, fs-free), shared by both paths. This
 * module only adapts that brain to a live DOM. An explicit author composition
 * class still wins (resolved synchronously, no measurement needed).
 *
 * applyToDom only — there is no applyToHtml: the engine string path can't
 * measure, and the emulator already stamps on its own fs-based pass.
 * See engineering/decisions/2026-06-19-adaptive-image.md.
 */

const { bucketForAspect, resolveComposition, compositionFromClass } = require('../core/image-aspect');
const { paintUntilDecoded, paintsLoading } = require('../core/image-painting');

// Pull the asset URL out of a `.lattice-bg` panel's inline background-image.
// Prefer the section's OWN direct-child panel; only fall back to a descendant
// (`querySelector` on a selector LIST returns the first matching element in
// document order, not the first selector — so the `:scope >` arm wouldn't win on
// its own if a nested section ever carried its own `.lattice-bg`).
function bgPanel(section) {
  if (!section.querySelector) return null;
  return section.querySelector(':scope > .lattice-bg') || section.querySelector('.lattice-bg');
}
function bgUrl(section) {
  const bg = bgPanel(section);
  if (!bg) return null;
  const inline = bg.style?.backgroundImage;
  const src = inline || (bg.getAttribute?.('style')) || '';
  const m = /url\(\s*['"]?([^'")]+)/i.exec(src);
  return m ? m[1] : null;
}

// A LATE SIZE RE-FADES THE TEXT. The preview reveals on its faces alone (lib/core/preview-font-gate.mjs);
// a section whose photo is still being measured holds its own text back (`data-img-pending`,
// below), so its size landing moves nothing the reader can see. Text the cap already released
// is hidden for the one frame its corrected layout paints in (`data-img-relayout`) and fades
// back in. Nothing waits on the probe itself: the gate used to, for up to 4 s, and that held the
// whole slide blank on a slow photo (followup 2412-p2).
const RELAYOUT = 'data-img-relayout';

function viewOf(root) {
  const doc = root.ownerDocument || root;
  return doc && doc.defaultView ? doc.defaultView : null;
}

// Every size this document measured, by URL (`null` = it would not load), for the host that
// writes the next slide into it: single-slide-render reads the map and stamps a revisited or
// edited slide final before it paints (lib/core/image-aspect.js `stampImageSections`).
const BUCKETS = '__latticeImageBuckets';

// THE TEXT WAITS FOR THE PHOTO. Until the photo's size is known the layout is a guess, and the
// text laid out on a guess moves when the guess is corrected. So a section whose photo is being
// measured carries `data-img-pending`: its panel shows as a loading placeholder and its text is
// hidden (image.styles.css). When the size is known the text fades in once, already in its final
// place; only the placeholder changes size, into the photo. The size is read from the image
// HEADER (`naturalWidth` is set before the download finishes), not from the full load. A photo
// that fails shows its hatch and its text at once; one that hangs shows its text after this cap,
// on the floor, and a late landing then fades through.
const PENDING = 'data-img-pending';
const PENDING_CAP_MS = 4000;
const SIZE_POLL_MS = 16;
function remember(view, url, bucket) {
  if (!view) return;
  try { (view[BUCKETS] || (view[BUCKETS] = Object.create(null)))[url] = bucket; } catch (_e) { /* a frozen realm keeps no memory */ }
}

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const view = viewOf(root);
  // ONLY IN A LIVE PREVIEW: a document with a reveal gate (`__latticeFontsSettled` is a boolean)
  // that ALSO opted in as on-screen (`<html data-lattice-live-media>`: the Studio's slide, the
  // Playground filmstrip, the Stage window; lib/core/image-painting.js). The gate alone is not
  // enough: the Studio's export capture frame and its Print document are built by the same preview
  // builder and carry it, and a held text, a painting or a re-fade caught at capture would be baked
  // into the export. Everything else — those, a player, the fluid viewer — keeps the Clean floor
  // and its bytes stay what they were.
  const live = !!view && typeof view.__latticeFontsSettled === 'boolean' && typeof view.setInterval === 'function' && paintsLoading(view);
  for (const section of root.querySelectorAll('section.image')) {
    // A PROVISIONAL stamp is the Clean floor a host wrote before it knew the photo's size
    // (lib/core/image-aspect.js `stampImageSections`): still to be measured, unlike a final one.
    const provisional = section.hasAttribute('data-img-provisional');
    if (section.getAttribute('data-img-composition') && !provisional) {
      // Stamped final by a host that already knew the size, so there is nothing to measure — but
      // knowing the size is not holding the picture, so the panel still paints until it decodes.
      if (live && !section.hasAttribute('data-img-unloaded')) {
        const u = bgUrl(section);
        if (u) {
          const held = new Image();
          held.src = u;
          paintUntilDecoded(bgPanel(section), held, view);
        }
      }
      continue;
    }
    section.removeAttribute('data-img-provisional');
    // Cleared here, before any path that returns without a probe: a host's pending stamp on a
    // section this pass does not measure (its own panel carries no url) would hide the text
    // for good, since only a probe's settle clears it.
    section.removeAttribute(PENDING);
    const orientation = section.getAttribute('data-orientation') || undefined;
    const forced = compositionFromClass(section.className);
    const url = bgUrl(section);

    // Stamp the Clean floor (or the forced pick) SYNCHRONOUSLY, up front: the
    // section is always styled (no flash of unstyled image), and an asset whose
    // probe never resolves can't get stuck unstamped. The async measure below
    // only UPGRADES it. Once stamped, the guard above skips it on re-walks, so
    // there's never a second probe.
    section.setAttribute('data-img-composition', forced || 'clean');
    if (!url) continue;

    // Measure the asset, then re-resolve (keeping a forced composition, but
    // stamping the bucket so the card aspect / column handling track the photo).
    // Same-origin / CORS assets report naturalWidth/Height; a load failure keeps
    // the floor already set above.
    const probe = new Image();
    if (live) section.setAttribute(PENDING, '');
    let sized = false;
    let poll = null;
    let cap = null;
    const release = () => {
      if (poll) view.clearInterval(poll);
      if (cap) view.clearTimeout(cap);
      poll = null;
      cap = null;
      section.removeAttribute(PENDING);
    };
    // Once per probe, from whichever arrives first: the header's size or the full load.
    const applySize = (w, h) => {
      if (sized) return;
      sized = true;
      // A section whose text was hidden has nothing on screen to move; only a slide whose text
      // was already showing (the cap fired, or a document that does not hold text back) fades.
      const wasShowing = !section.hasAttribute(PENDING);
      const before = `${section.getAttribute('data-img-bucket')}|${section.getAttribute('data-img-composition')}`;
      const bucket = bucketForAspect(w, h);
      if (bucket) section.setAttribute('data-img-bucket', bucket);
      section.setAttribute('data-img-composition', forced || resolveComposition(bucket, orientation));
      remember(view, url, bucket || null);
      release();
      const after = `${section.getAttribute('data-img-bucket')}|${section.getAttribute('data-img-composition')}`;
      // THE TEXT RE-FADES, NOT THE SLIDE. Text already showing (the cap released it on a guess)
      // moves when the guess is corrected, so it is hidden for the frame the new layout paints in
      // and fades back in, already in place. The whole frame used to fade through instead, which
      // blanked the slide and its painting for a beat (the owner's iPhone, PR #2471). Live
      // previews only, and only for a section still on screen: a probe outlives its section when
      // the reader turns the slide, and its landing must not touch the slide that replaced it.
      if (live && wasShowing && section.isConnected !== false && after !== before) {
        section.setAttribute(RELAYOUT, '');
        const back = () => section.removeAttribute(RELAYOUT);
        if (typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(() => view.requestAnimationFrame(back));
        else view.setTimeout(back, 34);
      }
    };
    probe.onload = () => {
      applySize(probe.naturalWidth, probe.naturalHeight);
      section.removeAttribute('data-img-unloaded');
    };
    // The photo will not load here (gone, offline, or refused by the frame's policy, such as a
    // redirect to a site the reader did not allow). Say so on the section, so the panel draws
    // the hatched stand-in a blocked web image gets instead of an empty box that reads as
    // broken (image.styles.css), and show the text: there is no size coming to wait for.
    probe.onerror = () => {
      section.setAttribute('data-img-unloaded', '');
      // Even after a header read: a download cut off after its header errors here, and a size
      // remembered from that header would stamp the next visit final, with an empty panel and
      // no hatch. `null` makes the next visit measure again.
      remember(view, url, null);
      sized = true;
      release();
    };
    probe.src = url;
    // A photo already in the memory cache has its size the moment `src` is set. Apply it in
    // this task, before anything paints, so an edit that re-creates the section never shows
    // the placeholder (the Playground re-creates it on every keystroke).
    if (probe.naturalWidth > 0 && probe.naturalHeight > 0) applySize(probe.naturalWidth, probe.naturalHeight);
    // THE PANEL PAINTS UNTIL THE PICTURE DOES. The size (above) frees the text; the picture
    // itself lands only when the whole file has, seconds later on a phone, and until then the
    // panel shows the Underpainting instead of an empty card (lib/core/image-painting.js).
    if (live) paintUntilDecoded(bgPanel(section), probe, view);
    if (live && !sized) {
      cap = view.setTimeout(() => { cap = null; if (!sized) release(); }, PENDING_CAP_MS);
      poll = view.setInterval(() => {
        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) applySize(probe.naturalWidth, probe.naturalHeight);
      }, SIZE_POLL_MS);
    }
  }
}

module.exports = {
  name: 'image-adaptive',
  layouts: ['image'],
  selector: 'section.image',
  applyToDom,
  // exported for unit testing the URL + stamp helpers without a DOM
  bgUrl,
  RELAYOUT,
  BUCKETS,
  PENDING,
  PENDING_CAP_MS,
};
