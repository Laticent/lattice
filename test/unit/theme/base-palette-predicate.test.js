/**
 * Unit: "is this a BASE palette?" — the one question `tools/build-docs-portal.js`
 * used to ask the stylesheet and now asks the manifest.
 *
 * `listBasePalettes()` decides which palettes the docs site offers in its picker
 * (and, through `tools/build-landing-tokens.js`, which ones get a landing-page
 * token block). It used to test the CSS for `@import 'lattice'`; it now asks
 * whether the theme sits at the ROOT of its chain. Two properties have to hold
 * for that swap to be safe, and neither had a test:
 *
 *  1. The two encodings agree. `checkThemeRoles` gates `@import 'lattice'` ⟺ no
 *     `extends`, so this is gate-MAINTAINED rather than a coincidence of today's
 *     32 palettes — but the gate lives in `build:check` and this is the consumer
 *     that would silently ship an empty picker if it ever broke.
 *
 *  2. The predicate is representation-agnostic. There are TWO shapes of the same
 *     edge map: `edgesFromManifests()` writes `{ indaco: undefined }` — key
 *     PRESENT, value undefined — while the generated `THEME_EDGES` omits root
 *     keys entirely (`build-theme-catalog.js` filters on `m.extends`). A
 *     predicate written as `Object.hasOwn(edges, name)` reads "has a parent"
 *     correctly for the generated map and BACKWARDS for the builder's: every
 *     base palette would be dropped and the picker would come back empty.
 *     Routing through `themeChain` reconciles them — this test is what says so.
 *
 * See engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { themeChain, edgesFromManifests } = require('../../../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../../../lib/theme/edges.generated.mjs');
const { listBasePalettes } = require('../../../tools/build-docs-portal');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const themeNames = fs
  .readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

/** The rule the tool applies: a chain of one is a root palette. */
const isRoot = (name, edges) => themeChain(name, edges).length === 1;

describe('base-palette predicate', () => {
  test('every theme has a manifest, and both edge encodings exist', () => {
    assert.ok(themeNames.length >= 32, `expected the full palette set, saw ${themeNames.length}`);
    for (const n of themeNames) {
      assert.ok(
        fs.existsSync(path.join(THEMES_DIR, `${n}.manifest.json`)),
        `${n}.css has no manifest — the edge map cannot see it`,
      );
    }
  });

  test('the manifest answer matches the stylesheet answer for every palette', () => {
    // The CSS side is deliberately re-derived here rather than imported: this is a
    // CROSS-ENCODING check, the same shape as `checkThemeRoles`, and it is only
    // worth anything if the two sides are computed independently.
    for (const n of themeNames) {
      const css = fs.readFileSync(path.join(THEMES_DIR, `${n}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const importsLattice = /@import\s*['"]lattice['"]/.test(css);
      assert.equal(
        isRoot(n, THEME_EDGES),
        importsLattice,
        `${n}: manifest says root=${isRoot(n, THEME_EDGES)}, CSS says @import 'lattice'=${importsLattice}`,
      );
    }
  });

  test('the predicate does not depend on which edge encoding it is handed', () => {
    // `edgesFromManifests` keeps root keys with an undefined value; the generated
    // map omits them. Same answer, or the docs picker is a coin flip on which
    // module happened to build the map.
    const manifests = themeNames.map((n) =>
      JSON.parse(fs.readFileSync(path.join(THEMES_DIR, `${n}.manifest.json`), 'utf8')),
    );
    const built = edgesFromManifests(manifests);

    const rootKeys = themeNames.filter((n) => Object.hasOwn(built, n) && built[n] === undefined);
    assert.ok(rootKeys.length > 0, 'expected edgesFromManifests to carry root keys with an undefined value');
    for (const n of rootKeys) {
      assert.ok(!Object.hasOwn(THEME_EDGES, n), `${n}: the generated map should omit root keys, not carry them`);
    }

    for (const n of themeNames) {
      assert.equal(isRoot(n, built), isRoot(n, THEME_EDGES), `${n}: the two edge encodings disagree on root-ness`);
    }

    // And the same, through the SHIPPED consumer rather than a restatement of its
    // rule. This is the arm that fires on a predicate written as
    // `Object.hasOwn(edges, name)`: it returns the full picker against the
    // generated map and an EMPTY one against the builder's.
    assert.deepEqual(listBasePalettes(built), listBasePalettes(THEME_EDGES));
  });

  test('listBasePalettes returns exactly the roots plus the selectable a11y palettes', () => {
    const expected = themeNames.filter((n) => {
      const a11ySelectable = n.startsWith('a11y-') && n !== 'a11y-base' && !n.endsWith('-dark');
      return isRoot(n, THEME_EDGES) || a11ySelectable;
    });
    const actual = listBasePalettes();
    assert.deepEqual([...actual].sort(), [...expected].sort());
    // The two canonical palettes lead the picker; everything else is alphabetical.
    assert.deepEqual(actual.slice(0, 2), ['indaco', 'cuoio']);
    // An empty or near-empty list is the failure mode this whole file guards, so
    // assert a floor rather than trusting deepEqual against a same-bug expectation.
    assert.ok(actual.length >= 18, `expected at least 18 selectable palettes, got ${actual.length}`);
  });
});
