/**
 * package → files, with every projection rewritten from the manifest
 * (engineering/decisions/2026-09-23-portable-packages.md §3.2, §3.4).
 *
 * `read.js` finds each file's role by suffix and reports a prefix that disagrees
 * with the manifest's `name`. This writes the package back out with the manifest in
 * charge: every role file becomes `<name>.<role>`, a theme's `@theme` directive says
 * `<name>`, and the manifest carries `type` and `format`, so a loose file (a zip, an
 * IndexedDB record) says what it is without its location.
 *
 * Build outputs are dropped: they don't travel, and the build regenerates them.
 * Assets (a component's gallery images and data files) are kept under their own names.
 *
 * Pure: no fs.
 */

const { FORMAT, MANIFEST_ROLE, kindOf, fileName } = require('./kinds.js');
const { renameThemeDirective } = require('../theme/directive.js');
const { asText } = require('./read.js');

/** The manifest with `name`, `type` and `format` first, then every other field as it was. */
function stampManifest(manifest, pkg) {
  const { name: _n, type: _t, format: _f, ...rest } = manifest;
  return { name: pkg.name, type: pkg.type, format: FORMAT, ...rest };
}

/**
 * @param {{ type: string, name: string, manifest: object, files: Record<string, any>,
 *           roles: Record<string, string>, assets?: string[] }} pkg  a `readPackage` result's `pkg`
 * @returns {Record<string, string|Uint8Array>}  file name → contents
 */
function writePackage(pkg) {
  const kind = kindOf(pkg.type);
  // No prototype: a file literally named `__proto__` is a key like any other.
  const out = Object.create(null);
  for (const [role, from] of Object.entries(pkg.roles)) {
    if (kind.outputs.includes(role)) continue;
    const to = fileName(pkg.name, role);
    if (role === MANIFEST_ROLE) {
      out[to] = `${JSON.stringify(stampManifest(pkg.manifest, pkg), null, 2)}\n`;
      continue;
    }
    let body = pkg.files[from];
    // A zip hands its files over as bytes; the directive is rewritten either way.
    if (pkg.type === 'theme' && role === 'css' && body != null) body = renameThemeDirective(asText(body), pkg.name);
    out[to] = body;
  }
  for (const a of pkg.assets || []) out[a] = pkg.files[a];
  return out;
}

module.exports = { writePackage, stampManifest };
