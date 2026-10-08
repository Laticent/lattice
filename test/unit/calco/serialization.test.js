/**
 * Unit: Calco's reader ships as SOURCE. The CLI hands `readSlide` and `restoreSlide` to a
 * headless page with `elementHandle.evaluate(fn)`, which serializes `fn.toString()`; so each
 * must close over nothing, and the bundler must not have injected a module-scope helper the
 * body reaches for. Only the BUILT dist/ can show the second, which is what this reads
 * (engineering/decisions/2026-10-06-calco-office-export-library.md).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const calco = require('@laticent/calco');

const DIST = path.join(__dirname, '../../../docs/src/lib/calco/dist/index.cjs');

describe('calco — serialization', () => {
  test('the package resolves to the built dist/, not the TypeScript source', () => {
    assert.equal(require.resolve('@laticent/calco'), fs.realpathSync(DIST));
  });

  test('readSlide and restoreSlide compile from their own source', () => {
    for (const fn of [calco.readSlide, calco.restoreSlide]) {
      assert.doesNotThrow(() => new Function(`return (${fn.toString()})`), fn.name);
    }
  });

  test('neither reaches a module-scope name', () => {
    const src = fs.readFileSync(DIST, 'utf8');
    const helpers = [...src.matchAll(/^var (__\w+) = /gm)].map((m) => m[1]).filter((h) => !['__defProp', '__getOwnPropDesc', '__getOwnPropNames', '__hasOwnProp', '__export', '__copyProps', '__toCommonJS'].includes(h));
    assert.deepEqual(helpers, [], 'a helper the shipped functions could reach');
    // Every top-level binding in the bundle, by name: none may appear inside the reader.
    const topLevel = [...src.matchAll(/^(?:var|let|const|function|async function) (\w+)/gm)].map((m) => m[1]).filter((n) => !['readSlide', 'restoreSlide'].includes(n));
    for (const fn of [calco.readSlide, calco.restoreSlide]) {
      const body = fn.toString();
      for (const name of topLevel) assert.ok(!new RegExp(`\\b${name}\\b`).test(body), `${fn.name} references the module-scope ${name}`);
    }
  });

  test('the published CLI bundle carries Calco inline, not as a runtime require', (t) => {
    const bundle = path.join(__dirname, '../../../dist/lattice.js');
    if (!fs.existsSync(bundle)) return t.skip('dist/lattice.js not built');
    const src = fs.readFileSync(bundle, 'utf8');
    // Substring checks: a regex assertion would print the whole 16 MB bundle on failure.
    assert.ok(!/require\(["']@laticent\/calco["']\)/.test(src), 'the bundle requires @laticent/calco at runtime');
    assert.ok(src.includes('data-calco-freeze'), 'the reader is not inlined in the bundle (rebuild: npm run cli:build)');
  });
});
