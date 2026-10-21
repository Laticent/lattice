const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { demandFaces, webExportFaces, webExportByteDrift, cdnRegressions } = require('../../../tools/check-fonts.js');
const { TEXT_FACES, faceKey } = require('../../../lib/fonts/text-faces.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('manifest demand and the web-export supply describe the same faces', () => {
  const demand = demandFaces();
  const missing = [];
  const supply = webExportFaces(missing);
  assert.equal(demand.size, TEXT_FACES.length, 'demand set drops no manifest face');
  assert.deepEqual([...demand].sort(), [...supply].sort(), 'web-export supply == manifest');
  assert.deepEqual(missing, [], 'every web-export woff2 exists on disk');
});

// The set check passed while six vendored files held other bytes than assets/fonts/, so the Studio
// drew Outfit 400/700, Caveat and Shantell from different glyphs than the CLI (§11.9 of
// decisions/2026-10-16-player-as-library-audit.md). Same faces is not enough: same files.
test('every web-export woff2 is the manifest face\'s own file, byte for byte', () => {
  assert.deepEqual(webExportByteDrift(), []);
});

test('zero-network guard: no Google-Fonts CDN URL in the engine CSS or bundle', () => {
  assert.deepEqual(cdnRegressions(), [], 'a CDN URL reappeared — the library must self-host');
});

test('every manifest face has a self-hosted @font-face in dist/lattice.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
  for (const { family, weight, style, file } of TEXT_FACES) {
    const re = new RegExp(
      `@font-face\\{[^}]*font-family:'${family.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'[^}]*` +
        `font-weight:${weight}[^}]*url\\('fonts/${file}\\.woff2'\\)`,
    );
    // font-style ordering varies; assert family+weight+file presence and a fonts/ URL.
    assert.match(css, re, `${faceKey(family, weight, style)} → fonts/${file}.woff2`);
  }
});

test('the shipped woff2 exist in dist/fonts/ for every manifest face', () => {
  for (const { file } of TEXT_FACES) {
    const fp = path.join(ROOT, 'dist', 'fonts', `${file}.woff2`);
    assert.ok(fs.existsSync(fp), `dist/fonts/${file}.woff2 is shipped`);
  }
});
