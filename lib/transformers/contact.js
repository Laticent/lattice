/**
 * Registry adapter for the contact QR-card transform. Kernel:
 * lib/components/connect/contact/contact.transform.js.
 *
 *   - lattice-emulator.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 *
 * Both paths share one kernel: applyToDom rewrites the live section's innerHTML
 * with the same renderCard the HTML path uses. Idempotent on `.qr-card`.
 */

const engine = require('../components/connect/contact/contact.transform');

function transformContactDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll('section.contact')) {
    // ANYWHERE in the section, not just as a DIRECT CHILD. The idempotency guard
    // is asking "has this transform already run", and the answer stops being
    // visible at `:scope >` the moment the Form composition moves the card into
    // `.cell-stage` — which masthead-lift does on the very first pass, before this
    // transform is ever re-run. So the guard never hit, and every content pass
    // re-assigned `sec.innerHTML`. `renderCard` is itself idempotent and returned
    // the identical string, so nothing LOOKED wrong — but assigning innerHTML
    // replaces children regardless, which is a childList mutation, which schedules
    // another content pass. Measured on the 117-slide baseline gallery: a settle
    // signal that never settles, ~5.3 passes per second, forever, on an idle page.
    if (sec.querySelector('.qr-card')) continue; // idempotent
    sec.innerHTML = engine.renderCard(sec.innerHTML);
  }
}

module.exports = {
  name: 'contact',
  selector: 'section.contact',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    transformContactDom(root);
  },
};
