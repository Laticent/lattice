#!/usr/bin/env node
/**
 * `prepack` for every workspace library under docs/src/lib/<name>/. npm runs it in the
 * library's folder before `npm pack` or `npm publish`, so a published tarball always carries:
 *
 * - a `dist/` built from the source being packed, never a stale or missing one. `dist/` is
 *   gitignored and `npm publish` ships whatever is on disk, so without this a publish from a
 *   fresh checkout would ship no JavaScript at all;
 * - the repo's LICENSE (AGPL-3.0-only), which the license requires to travel with the code.
 *   The copy is gitignored (docs/.gitignore) so the text lives once, at the repo root.
 *
 * Usage, from a library's package.json: "prepack": "node ../../../../tools/library-prepack.js"
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = process.cwd();
const name = path.basename(LIB_DIR);
const libRoot = path.join(ROOT, 'docs', 'src', 'lib');

if (path.dirname(LIB_DIR) !== libRoot) {
  console.error(`[library-prepack] run from a library folder under ${path.relative(process.cwd(), libRoot)}/, not ${LIB_DIR}`);
  process.exit(1);
}
const builder = path.join(ROOT, 'tools', `build-${name}-lib.js`);
if (!fs.existsSync(builder)) {
  console.error(`[library-prepack] no builder for "${name}": expected ${path.relative(ROOT, builder)}`);
  process.exit(1);
}

execFileSync(process.execPath, [builder, '--silent'], { cwd: ROOT, stdio: 'inherit' });
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(LIB_DIR, 'LICENSE'));
