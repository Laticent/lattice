/**
 * Registry adapter for the universal CODA kernel. Kernel: lib/core/coda.js.
 *
 *   - lattice-emulator.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 *
 * Runs FIRST in the chain, and that position is load-bearing rather than
 * incidental — see the kernel's header. Three components (contact, wifi, video)
 * rebuild their whole section from the authored list, so a pass that ran later
 * would have nothing left to re-parent; five more sweep the trailing beats into
 * a sub-container they then own. Harvesting into the frame's own cell before any
 * of that runs is what makes the beats survive.
 *
 * Idempotent: guarded on the `.cell-coda` marker in both arms.
 */

const engine = require('../core/coda');

module.exports = {
  name: 'coda',
  selector: 'section',
  applyToHtml(html) {
    return engine.applyToHtml(html);
  },
  applyToDom(root) {
    engine.applyToDom(root);
  },
};
