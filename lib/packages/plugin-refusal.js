/**
 * Why a plugin package is refused, by name, at both doors: `lattice packages add`
 * (lib/packages/gate.js) and the Studio's Library import (docs/src/components/studio/package-zip.ts,
 * `readPackagesFromZip`). Plugins are in-tree only until the zip channel ships (plugin-system §7
 * phase E). One string, so the two doors say the same thing; the Studio once dropped a code-free
 * plugin zip silently.
 *
 * Its own leaf rather than a line in import-gate.js: that module is on the Studio's EAGER path
 * (import-gate.ts), and this string is only read when someone imports a zip, which loads
 * package-zip.ts on demand. A dependency-free CommonJS leaf, so the docs dev server can
 * default-import it.
 */
const PLUGIN_REFUSAL =
  'plugin packages cannot be installed yet — only the plugins that ship with Lattice run until the plugin data layer lands (plugin-system §7 phase E)';

module.exports = { PLUGIN_REFUSAL };
