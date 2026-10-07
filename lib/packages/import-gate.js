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
  'skeleton-remote', // a component's sample slide (gallery.md) that fetches when it renders
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

/**
 * Why a plugin package is refused, by name, at both doors (`lattice packages add` in
 * lib/packages/gate.js and the Studio's Library import in docs/src/components/studio/asset-bundle.ts).
 * Plugins are in-tree only until the zip channel ships (plugin-system §7 phase E). One string,
 * so the two doors say the same thing; the Studio once dropped a code-free plugin zip silently.
 */
const PLUGIN_REFUSAL =
  'plugin packages cannot be installed yet — only the plugins that ship with Lattice run until the plugin data layer lands (plugin-system §7 phase E)';

module.exports = { REFUSING_RULES, firstRefusal, PLUGIN_REFUSAL };
