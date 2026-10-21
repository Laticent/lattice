/**
 * Registry adapter for the cycle connector transform. The kernel
 * (lib/components/progression/cycle/cycle.transform.js) already has the registry
 * shape — `name`, `selector`, `applyToHtml`, `applyToDom` — so this is a re-export,
 * kept so every registry entry still lives under lib/transformers/.
 */
module.exports = require('../components/progression/cycle/cycle.transform');
