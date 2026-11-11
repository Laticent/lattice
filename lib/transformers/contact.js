/**
 * Registry adapter for the contact QR-card transform. Kernel:
 * lib/components/connect/contact/contact.transform.js.
 *
 *   - lattice.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 *
 * Both paths share one kernel: applyToDom rewrites the live section's innerHTML
 * with the same renderCard the HTML path uses. Idempotent on `.qr-card`.
 */

const { rebuildCardsInDom } = require('./qr-card-dom');
const engine = require('../components/connect/contact/contact.transform');

function transformContactDom(root) {
  // The `.qr-card` guard and the write-only-on-change rule live in the shared kernel: an unconditional `innerHTML`
  // write is a childList mutation that schedules the next content pass, so a slide whose card the kernel leaves as
  // it was (already built, or no fields yet) re-ran the runtime forever.
  rebuildCardsInDom(root, 'contact', engine.renderCard);
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
