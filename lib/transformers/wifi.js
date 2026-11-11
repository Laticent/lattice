/**
 * Registry adapter for the wifi QR-card transform. Kernel:
 * lib/components/connect/wifi/wifi.transform.js.
 *
 *   - lattice.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 *
 * Both paths share one kernel: applyToDom rewrites the live section's innerHTML
 * with the same renderCard the HTML path uses. Idempotent on `.qr-card`.
 */

const { rebuildCardsInDom } = require('./qr-card-dom');
const engine = require('../components/connect/wifi/wifi.transform');

function transformWifiDom(root) {
  // The `.qr-card` guard and the write-only-on-change rule live in the shared kernel: an unconditional `innerHTML`
  // write is a childList mutation that schedules the next content pass, so a slide whose card the kernel leaves as
  // it was (already built, or no fields yet) re-ran the runtime forever.
  rebuildCardsInDom(root, 'wifi', engine.renderCard);
}

module.exports = {
  name: 'wifi',
  selector: 'section.wifi',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    transformWifiDom(root);
  },
};
