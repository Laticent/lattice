#!/usr/bin/env node
/**
 * Generate dist/THIRD-PARTY-LICENSES.txt — the verbatim MIT and OFL texts for every third-party
 * file an exported Marp bundle and the Marp kit redistribute (Mermaid, KaTeX fonts, dagre-d3-es,
 * Tabler Icons, Lodash, and the OFL text faces).
 *
 * The text comes from lib/export/third-party-licenses.js, which reads assets/licenses/. Every
 * shipper copies this one file: the CLI export and the Studio export through `STATIC_ASSETS`, and
 * the Marp kit through the same list (#1354).
 *
 * Flags:
 *   --check    Build in memory and diff against dist/THIRD-PARTY-LICENSES.txt. Exits 1 on drift.
 */

const fs = require('node:fs');
const path = require('node:path');
const { thirdPartyLicenses, THIRD_PARTY_LICENSES_FILE } = require('../lib/export/third-party-licenses.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', THIRD_PARTY_LICENSES_FILE);
const text = thirdPartyLicenses((f) => fs.readFileSync(path.join(ROOT, 'assets', 'licenses', f), 'utf8'));

if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (have !== text) {
    console.error(`✗ dist/${THIRD_PARTY_LICENSES_FILE} is stale — run npm run build`);
    process.exit(1);
  }
  console.log(`✓ dist/${THIRD_PARTY_LICENSES_FILE} is current`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`✓ wrote dist/${THIRD_PARTY_LICENSES_FILE}`);
}
