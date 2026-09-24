#!/usr/bin/env node
/**
 * build-packages-index — the ONE generated index of every shipped package
 * (engineering/decisions/2026-09-23-portable-packages.md §3.4).
 *
 * Walks the repo through the package spine (lib/packages/fs.js), reads every package
 * strictly, and writes lib/packages/packages.generated.json: type, name, repo path,
 * the role files present, and whether it carries code. The spine's registry reads its
 * reserved names from this file (§3.7), and later phases replace the hand-kept finish
 * register and theme catalog with it.
 *
 * A package the spine can't read fails the build and names the file, rather than being
 * left out of the index. `checkPackageIdentity` (tools/check-ownership.js) reports the
 * same errors earlier in the build.
 *
 *   node tools/build-packages-index.js           write
 *   node tools/build-packages-index.js --check   exit 1 when the committed file is stale
 */
const fs = require('node:fs');
const path = require('node:path');
const { discoverPackages, ROOT } = require('../lib/packages/fs.js');
const { buildIndex } = require('../lib/packages/index.js');

const OUT = path.join(ROOT, 'lib', 'packages', 'packages.generated.json');

function render() {
  const found = discoverPackages();
  const bad = found.filter((f) => !f.result.ok);
  if (bad.length) {
    throw new Error(`packages-index: unreadable package(s):\n${bad.map((b) => `  ${b.path}: ${b.result.errors.join('; ')}`).join('\n')}`);
  }
  const index = buildIndex(found.map((f) => ({ pkg: f.result.pkg, path: f.path })));
  return `${JSON.stringify({ _generated: 'by tools/build-packages-index.js from the repo packages — DO NOT EDIT', ...index }, null, 2)}\n`;
}

function main(argv) {
  const next = render();
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (argv.includes('--check')) {
    if (prev !== next) {
      process.stderr.write('packages-index STALE — lib/packages/packages.generated.json does not match the repo packages.\nRun `node tools/build-packages-index.js` and commit the result.\n');
      return 1;
    }
    process.stdout.write('packages-index OK — lib/packages/packages.generated.json matches the repo packages.\n');
    return 0;
  }
  fs.writeFileSync(OUT, next);
  const { counts } = JSON.parse(next);
  process.stdout.write(`packages-index: wrote ${path.relative(ROOT, OUT)} (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')})\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { render, OUT };
