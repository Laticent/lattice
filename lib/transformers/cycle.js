/**
 * Registry adapter for the cycle connector transform. Kernel:
 * lib/components/progression/cycle/cycle.transform.js.
 *
 *   - lattice.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 */

const kernel = require('../components/progression/cycle/cycle.transform');

module.exports = {
  name: 'cycle',
  selector: 'section.cycle',
  applyToHtml(html) {
    return kernel.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    kernel.applyToDom(root);
  },
};
