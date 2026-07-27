/**
 * premise transformer — registry-shaped adapter around the engine kernel at
 * lib/core/premise.js (HTML-string path).
 *
 * Consumed via the registry by lattice-emulator.js (via lib/engine —
 * registry.applyAllToHtml). No applyToDom mirror yet (the Two-renderer rule
 * is opt-in, engineering/decisions/2026-07-09-marp-legacy-audit.md §5(a)) —
 * see engineering/gotchas.md "Known preview gaps" for the VS Code Marp
 * preview symptom this leaves.
 */

const engine = require('../core/premise');

module.exports = {
  name: 'premise',
  layouts: ['premise'],
  selector: 'section.premise',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
};
