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

// Pull the asset URL out of a `.lattice-bg` panel's inline background-image.
// Prefer the section's OWN direct-child panel; only fall back to a descendant
// (`querySelector` on a selector LIST returns the first matching element in
// document order, not the first selector — so the `:scope >` arm wouldn't win on
// its own if a nested section ever carried its own `.lattice-bg`).
function bgUrl(section) {
  if (!section.querySelector) return null;
  const bg = section.querySelector(':scope > .lattice-bg') || section.querySelector('.lattice-bg');
  if (!bg) return null;
  const inline = bg.style?.backgroundImage;
  const src = inline || (bg.getAttribute?.('style')) || '';
  const m = /url\(\s*['"]?([^'")]+)/i.exec(src);
  return m ? m[1] : null;
}

// THE REVEAL WAITS FOR THE PROBE. Until the photo loads, its aspect is a guess (the Clean floor,
// no bucket), and the bucket sizes the card: measured in the Studio with the picture held 2.5 s,
// the preview appeared with the panel 605x504, then re-laid out to 552x345 and moved the heading
// 18px when the photo landed (followup 2358-p2). So each probe is published on the document's
// window as a promise that always settles, and the preview's reveal gate
// (lib/core/preview-font-gate.mjs) holds the first reveal until they have, within its own cap.
// A probe that lands AFTER the reveal and changes the composition says so with
// `lattice:layout-late`, which a revealer answers by fading through the relayout.
const PROBES = '__latticeImageProbes';
const LATE_EVENT = 'lattice:layout-late';

function viewOf(root) {
  const doc = root.ownerDocument || root;
  return doc && doc.defaultView ? doc.defaultView : null;
}

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const view = viewOf(root);
  for (const section of root.querySelectorAll('section.image')) {
    if (section.getAttribute('data-img-composition')) continue;
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
    // Only a probe that STARTED before the reveal can move a slide the reader was already shown.
    // One started after it belongs to a patch render (an edit re-creates the section, and the
    // cached photo lands a frame later) — announcing that would fade the preview on every keystroke.
    const beforeReveal = !!view && view.__latticeFontsSettled === false;
    const settled = new Promise((resolve) => {
      probe.onload = () => {
        const before = `${section.getAttribute('data-img-bucket')}|${section.getAttribute('data-img-composition')}`;
        const bucket = bucketForAspect(probe.naturalWidth, probe.naturalHeight);
        if (bucket) section.setAttribute('data-img-bucket', bucket);
        section.setAttribute('data-img-composition', forced || resolveComposition(bucket, orientation));
        const after = `${section.getAttribute('data-img-bucket')}|${section.getAttribute('data-img-composition')}`;
        // `__latticeFontsSettled` is the gate's "revealed" flag; a document with no gate has none.
        if (after !== before && beforeReveal && view.__latticeFontsSettled === true) {
          try { view.dispatchEvent(new view.Event(LATE_EVENT)); } catch (_e) { /* nothing to mask */ }
        }
        resolve();
      };
      probe.onerror = () => resolve();
    });
    // Published only while the first reveal is still pending: after it, nothing reads the list,
    // and a live document that patches sections on every edit would grow it without bound.
    if (beforeReveal) (view[PROBES] || (view[PROBES] = [])).push(settled);
    probe.src = url;
  }
}

module.exports = {
  name: 'image-adaptive',
  layouts: ['image'],
  selector: 'section.image',
  applyToDom,
  // exported for unit testing the URL + stamp helpers without a DOM
  bgUrl,
  PROBES,
  LATE_EVENT,
};
