/**
 * Unit: docs/src/playground/theme-core.generated.js — the browser bundle of the
 * Theme Studio core (built by tools/build-theme-core.js, consumed by the
 * Workbench page). Guards that the bundle (1) loads as valid ESM, (2) exposes
 * the API the Workbench imports, and (3) stays in PARITY with the source
 * lib/theme/* — i.e. it isn't stale. The byte-level freshness gate is
 * `npm run build:check` (build-theme-core --check); this is the behavioral one.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BUNDLE = path.join(__dirname, '..', '..', '..', 'docs', 'src', 'playground', 'theme-core.generated.js');

// Source modules the bundle packages.
const srcDerive = require('../../../lib/theme/derive.js');
const srcContrast = require('../../../lib/theme/contrast.js');
const srcStarters = require('../../../lib/theme/starters.js');

describe('theme-core-bundle', () => {
  test('loads as ESM and exposes the Workbench API', async () => {
    const m = await import(pathToFileURL(BUNDLE).href);
    for (const name of ['deriveTheme', 'validateEssentials', 'serializeTheme', 'auditBoth', 'STARTERS', 'contrastRatio']) {
      assert.ok(name in m, `bundle missing export: ${name}`);
    }
    assert.equal(typeof m.deriveTheme, 'function');
    assert.ok(Array.isArray(m.STARTERS) && m.STARTERS.length > 0);
  });

  test('smoke: derives a contrast-clean theme and serializes it', async () => {
    const m = await import(pathToFileURL(BUNDLE).href);
    const map = m.deriveTheme(m.STARTERS[0].essentials);
    assert.ok(m.auditBoth(map).ok, 'bundle derivation not AA-clean');
    const css = m.serializeTheme(map, { name: 'bundle-smoke' });
    assert.match(css, /@theme bundle-smoke\b/);
  });

  test('parity: bundle output matches the source modules (not stale)', async () => {
    const m = await import(pathToFileURL(BUNDLE).href);
    // Same starter set.
    assert.deepEqual(
      m.STARTERS.map(s => s.name),
      srcStarters.STARTERS.map(s => s.name),
      'bundle STARTERS drifted from source — run `npm run theme-core:build`',
    );
    // Same derivation, byte-for-byte token map, for every starter.
    for (const s of srcStarters.STARTERS) {
      assert.deepEqual(
        m.deriveTheme(s.essentials),
        srcDerive.deriveTheme(s.essentials),
        `bundle deriveTheme(${s.name}) drifted from source — run \`npm run theme-core:build\``,
      );
      // Same audit verdict.
      assert.equal(m.auditBoth(s.essentials && m.deriveTheme(s.essentials)).ok, srcContrast.auditBoth(srcDerive.deriveTheme(s.essentials)).ok);
    }
  });
});
