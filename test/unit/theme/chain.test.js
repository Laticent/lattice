/**
 * The theme chain — declared once in the manifests, resolved by one pure function.
 *
 * The point of this module is that it REPLACED three separate `@import` scanners
 * that had already drifted apart. So the load-bearing test is not "does the walk
 * work" but "does it reproduce, byte for byte, what the flattener it replaced
 * produced" — and that the graph the browser is handed matches the one Node reads.
 * See engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { themeChain, edgesFromManifests } = require('../../../lib/theme/chain.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(ROOT, 'themes');
const manifests = fs.readdirSync(THEMES)
  .filter((f) => f.endsWith('.manifest.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(THEMES, f), 'utf8')));
const edges = edgesFromManifests(manifests);

describe('themeChain', () => {
  test('returns the chain PARENT-FIRST', () => {
    // Parent-first is the cascade contract: concatenated in this order a child's
    // `:root` overrides its parent's at equal specificity. Reversed, every dark
    // variant would lose to the light palette it wraps.
    assert.deepEqual(themeChain('indaco-dark', edges), ['indaco', 'indaco-dark']);
    assert.deepEqual(themeChain('a11y-deuteranopia', edges), ['onyx', 'a11y-base', 'a11y-deuteranopia']);
    assert.deepEqual(themeChain('indaco', edges), ['indaco']);
  });

  test('terminates on a cycle instead of hanging', () => {
    // A malformed manifest pair must degrade to "resolve what we can", not take out
    // the CLI. The gate is what reports it as the authoring error it is.
    assert.deepEqual(themeChain('a', { a: 'b', b: 'a' }), ['b', 'a']);
    assert.deepEqual(themeChain('a', { a: 'a' }), ['a']);
  });

  test('an inherited Object property is not an edge', () => {
    // `edges` is built from JSON, so a theme named `constructor` would otherwise
    // "extend" Object's constructor and walk into nonsense.
    assert.deepEqual(themeChain('constructor', {}), ['constructor']);
    assert.deepEqual(themeChain('toString', edges), ['toString']);
  });

  test('an unknown or empty name is handled', () => {
    assert.deepEqual(themeChain('nope', edges), ['nope']);
    assert.deepEqual(themeChain('', edges), []);
    assert.deepEqual(themeChain(undefined, edges), []);
    assert.deepEqual(themeChain('x', undefined), ['x']);
  });

  test('every declared parent is itself a real theme', () => {
    const known = new Set(manifests.map((m) => m.name));
    const dangling = manifests.filter((m) => m.extends && !known.has(m.extends));
    assert.deepEqual(dangling.map((m) => `${m.name} → ${m.extends}`), []);
  });

  test('no palette chain contains a cycle', () => {
    for (const m of manifests) {
      const chain = themeChain(m.name, edges);
      assert.equal(new Set(chain).size, chain.length, `${m.name} has a cyclic chain: ${chain.join(' → ')}`);
      assert.equal(chain.at(-1), m.name, `${m.name} must be last in its own chain`);
    }
  });
});

describe('the chain reproduces the flattener it replaced', () => {
  // THE regression test for this change. `lattice-emulator.js` used to flatten a
  // palette by regexing `@import` and concatenating imported-first. If the
  // manifest-driven chain is a true drop-in, concatenating its files in order is
  // byte-identical for every palette — which is exactly what was measured before
  // the flattener was deleted.
  const flattenViaImports = (filePath, seen = new Set()) => {
    if (seen.has(filePath)) return '';
    seen.add(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const importRe = /@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g;
    let imported = '';
    let m;
    while ((m = importRe.exec(content)) !== null) {
      if (m[1] === 'lattice') continue;
      const p = path.join(path.dirname(filePath), `${m[1]}.css`);
      if (fs.existsSync(p)) imported += `${flattenViaImports(p, seen)}\n`;
    }
    return imported + content;
  };

  test('every palette flattens identically through the chain', () => {
    const differing = [];
    for (const f of fs.readdirSync(THEMES).filter((x) => x.endsWith('.css')).sort()) {
      const name = f.replace(/\.css$/, '');
      const viaImports = flattenViaImports(path.join(THEMES, f));
      const viaChain = themeChain(name, edges)
        .map((n) => fs.readFileSync(path.join(THEMES, `${n}.css`), 'utf8'))
        .join('\n');
      if (viaImports !== viaChain) differing.push(name);
    }
    assert.deepEqual(differing, []);
  });
});

describe('the browser gets the same graph Node reads', () => {
  test('the generated THEME_EDGES matches the manifests exactly', () => {
    // The browser can't read manifests at runtime, so the edge map is baked. It lives
    // in lib/ rather than the docs bundle precisely so the CLI, the unit suite and the
    // browser import the SAME file — a docs-only home is unreachable from the first two,
    // which is how a second copy would start. If this drifts, the browser resolves a
    // different chain than the CLI: the exact bug class this change removes.
    const { THEME_EDGES } = require('../../../lib/theme/edges.generated.js');
    const fromManifests = Object.fromEntries(
      manifests.filter((m) => m.extends).map((m) => [m.name, m.extends]),
    );
    assert.deepEqual({ ...THEME_EDGES }, fromManifests);
  });
});
