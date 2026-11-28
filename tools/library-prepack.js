#!/usr/bin/env node
/**
 * `prepack` for every workspace library under docs/src/lib/<name>/. npm runs it in the
 * library's folder before `npm pack` or `npm publish`, so a published tarball always carries:
 *
 * - a `dist/` built from the source being packed, never a stale or missing one. `dist/` is
 *   gitignored and `npm publish` ships whatever is on disk, so without this a publish from a
 *   fresh checkout would ship no JavaScript at all;
 * - the license its package.json names, which the license requires to travel with the code:
 *   - `Apache-2.0`: the library's own tracked LICENSE (the Apache text, checked byte for byte)
 *     and NOTICE. Nothing is copied, so the root AGPL LICENSE can never ride along;
 *   - `AGPL-3.0-only`: the repo's LICENSE, copied in. The copy is gitignored (docs/.gitignore)
 *     so the text lives once, at the repo root.
 *   Any other value fails the pack. Which part is which: LICENSING.md.
 *
 * Usage, from a library's package.json: "prepack": "node ../../../../tools/library-prepack.js"
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// The SHA-256 of https://www.apache.org/licenses/LICENSE-2.0.txt, as fetched 2026-11-28.
const APACHE_2_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';

/**
 * Put the right license beside the code, or say why it cannot. Returns an error message, or
 * null when the folder is ready. Exported for test/unit/tools/library-prepack.test.js.
 */
function stageLicense(libDir, root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(libDir, 'package.json'), 'utf8'));
  const own = path.join(libDir, 'LICENSE');
  if (pkg.license === 'Apache-2.0') {
    if (!fs.existsSync(own)) return `${pkg.name} says Apache-2.0 but has no LICENSE in its folder`;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(own)).digest('hex');
    if (sha !== APACHE_2_SHA256) return `${pkg.name} says Apache-2.0 but its LICENSE is not the Apache-2.0 text (sha256 ${sha})`;
    if (!fs.existsSync(path.join(libDir, 'NOTICE'))) return `${pkg.name} says Apache-2.0 but has no NOTICE in its folder`;
    for (const f of ['LICENSE', 'NOTICE']) {
      if (!(pkg.files || []).includes(f)) return `${pkg.name} says Apache-2.0 but its package.json "files" leaves out ${f}`;
    }
    return null;
  }
  if (pkg.license === 'AGPL-3.0-only') {
    fs.copyFileSync(path.join(root, 'LICENSE'), own);
    return null;
  }
  return `${pkg.name} names license "${pkg.license}"; a library is Apache-2.0 or AGPL-3.0-only (LICENSING.md)`;
}

function main() {
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
  const problem = stageLicense(LIB_DIR);
  if (problem) {
    console.error(`[library-prepack] ${problem}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { APACHE_2_SHA256, stageLicense };
