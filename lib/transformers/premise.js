/**
 * premise transformer — registry-shaped adapter around the engine kernel at
 * lib/core/premise.js (HTML-string path).
 *
 * Consumed via the registry two ways:
 *   - applyToHtml — lattice-emulator.js via lib/engine (registry.applyAllToHtml)
 *   - applyToDom  — lattice-runtime.js (registry.applyAllToDom), the route an
 *     Export-to-Marp bundle takes: marp-core renders the deck and never runs our
 *     markdown-it plugins, so without the mirror a premise slide came out of
 *     `npm run pdf` as a loose heading beside a collapsed ordinal rail.
 *
 * Both adapters delegate to the one kernel (lib/core/premise.js) — HARD RULE #1.
 * Sunset: drop the DOM adapter when the export path stops going through
 * marp-core (nothing plans to).
 */

const engine = require('../core/premise');

module.exports = {
  name: 'premise',
  layouts: ['premise'],
  selector: 'section.premise',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    engine.applyToDom(root);
  },
};
