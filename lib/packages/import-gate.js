/**
 * Which CSS gate findings REFUSE an imported package — ONE list for the Studio's Library
 * import (docs/src/components/studio/import-gate.ts) and the CLI's `lattice packages add`.
 *
 * The gates report many things (hex literals, margins, unscoped selectors) that make a
 * stylesheet worse but not dangerous. An import refuses only what reaches OFF THE DEVICE
 * or runs script, because the stylesheet lands in a preview and in every export: a
 * remote url() is a beacon in every copy the recipient opens (HARD RULE #22).
 *
 * A dependency-free leaf, so the docs dev server can default-import it.
 */
const REFUSING_RULES = new Set([
  'css-url-remote', // a remote url() — the beacon
  'css-import', // a remote or unresolvable @import (the theme gate allowlists the legit one)
  'theme-import', // the theme gate's own verdict on a non-allowlisted import target
  'css-expression', // legacy IE script-in-CSS
  'css-binding', // -moz-binding
]);

/**
 * The first refusing finding, as `{ name, why }`, or null when the stylesheet may import.
 * @param {Array<{rule?: string, message?: string}>|undefined} findings
 * @param {string} name  the package name, for the message
 */
function firstRefusal(findings, name) {
  const hit = (findings || []).find((f) => f?.rule && REFUSING_RULES.has(f.rule));
  return hit ? { name, why: hit.message || 'it reaches off the device.' } : null;
}

module.exports = { REFUSING_RULES, firstRefusal };
