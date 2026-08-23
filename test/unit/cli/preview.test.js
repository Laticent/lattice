/**
 * Unit: tools/preview.js — scope detection.
 *
 * The scope detector is pure (no I/O for the file-categorization
 * part), so these tests inject changes directly rather than touching
 * git. The build + diff phases are covered by integration tests.
 *
 * The taxonomy under test (see tools/preview.js header comment):
 *   L0  no visual impact
 *   L1  single deck or example
 *   L2  component-scoped
 *   L3  full
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { detectScope, decksUsingComponent, ALL_DECKS, SCOPE_LEVELS, PATTERNS } = require('../../../tools/preview');

describe('preview scope detector', () => {
  test('empty change set → L0', () => {
    assert.equal(detectScope([]).level, 'L0');
  });

  test('test or docs change only → L0', () => {
    assert.equal(detectScope(['test/unit/something.test.js']).level, 'L0');
    assert.equal(detectScope(['design/design-system.md']).level, 'L0');
    assert.equal(detectScope(['package.json']).level, 'L0');
  });

  // The whole changelog is prose, and only `CHANGELOG.md` itself was listed. The
  // archive (`changelog/`, 1.5 MB) and the per-PR fragments (`changelog.d/`, written
  // by every change under HARD RULE #10) fell through to the "unrecognized file →
  // treat as full" arm, so writing a changelog entry rebuilt and pixel-diffed every deck.
  test('any changelog file → L0 (prose, whichever file it lives in)', () => {
    assert.equal(detectScope(['CHANGELOG.md']).level, 'L0');
    assert.equal(detectScope(['changelog/pre-release-archive.md']).level, 'L0');
    assert.equal(detectScope(['changelog.d/1777-output-extension-closed.fixed.md']).level, 'L0');
    assert.equal(detectScope(['changelog.d/README.md']).level, 'L0');
  });

  test('manifest.json change → L0 (scaffolder-only impact)', () => {
    assert.equal(detectScope(['lib/components/cards-grid/cards-grid.manifest.json']).level, 'L0');
  });

  test('docs.md in component folder → L0 (generated reference)', () => {
    assert.equal(detectScope(['lib/components/quote/quote.docs.md']).level, 'L0');
  });

  test('per-component gallery.md → L2, that component only', () => {
    const s = detectScope(['lib/components/quote/quote.gallery.md']);
    assert.equal(s.level, 'L2');
    assert.deepEqual(s.components, ['quote']);
  });

  test('deck source change → L1', () => {
    const s = detectScope(['examples/gallery-mermaid.md']);
    assert.equal(s.level, 'L1');
    assert.deepEqual(s.decks, ['gallery-mermaid']);
  });

  test('component CSS → L2, scoped to decks using that component', () => {
    const s = detectScope(['lib/components/cards-grid/cards-grid.styles.css']);
    assert.equal(s.level, 'L2');
    assert.deepEqual(s.components, ['cards-grid']);
    assert.ok(s.decks.includes('gallery-jargon'), 'gallery-jargon uses cards-grid');
  });

  test('component transform.js → L2', () => {
    const s = detectScope(['lib/components/radar/radar.transform.js']);
    assert.equal(s.level, 'L2');
    assert.deepEqual(s.components, ['radar']);
  });

  test('shared CSS → L3 (full)', () => {
    assert.equal(detectScope(['lib/_legacy.css']).level, 'L3');
    assert.equal(detectScope(['lib/_universal.css']).level, 'L3');
    assert.equal(detectScope(['lib/_scaffold.css']).level, 'L3');
    assert.equal(detectScope(['dist/lattice.css']).level, 'L3');
  });

  test('theme change → L3', () => {
    assert.equal(detectScope(['themes/indaco.css']).level, 'L3');
  });

  test('renderer (engine) change → L3', () => {
    assert.equal(detectScope(['lattice-emulator.js']).level, 'L3');
    assert.equal(detectScope(['lib/components/chart/_chart-family/chart-family.js']).level, 'L3');
  });

  test('explicit deck override → L1 with that deck', () => {
    const s = detectScope([], { deck: 'gallery-mermaid' });
    assert.equal(s.level, 'L1');
    assert.deepEqual(s.decks, ['gallery-mermaid']);
  });

  test('--full override → L3 with all decks', () => {
    const s = detectScope([], 'full');
    assert.equal(s.level, 'L3');
    assert.deepEqual(s.decks, [...ALL_DECKS]);
  });

  test('mixed change with one full-diff trigger wins (L3)', () => {
    const s = detectScope([
      'lib/_legacy.css',
      'lib/components/cards-grid/cards-grid.gallery.md',
      'examples/gallery-jargon.md',
    ]);
    assert.equal(s.level, 'L3');
  });

  test('component CSS + deck source → L2 (component-scoped includes deck)', () => {
    const s = detectScope([
      'lib/components/cards-grid/cards-grid.styles.css',
      'examples/gallery-jargon.md',
    ]);
    assert.equal(s.level, 'L2');
    assert.ok(s.decks.includes('gallery-jargon'));
  });

  test('unrecognized lib/ file → L3 (conservative default)', () => {
    const s = detectScope(['lib/some-new-thing.js']);
    assert.equal(s.level, 'L3');
    assert.match(s.reason, /unrecognized/);
  });

  test('SCOPE_LEVELS documents all four tiers', () => {
    assert.deepEqual(Object.keys(SCOPE_LEVELS).sort(), ['L0', 'L1', 'L2', 'L3']);
  });

  test('PATTERNS exports the public taxonomy', () => {
    assert.ok(Array.isArray(PATTERNS.noVisualImpact));
    assert.ok(Array.isArray(PATTERNS.fullDiff));
    assert.ok(PATTERNS.componentCss instanceof RegExp);
  });
});

describe('decksUsingComponent', () => {
  test('returns the decks whose source mentions the component class', () => {
    const decks = decksUsingComponent('cards-grid');
    assert.ok(decks.includes('gallery-jargon'), 'gallery-jargon uses cards-grid');
  });

  test('returns empty array for an unused component', () => {
    const decks = decksUsingComponent('totally-fake-component-xyz');
    assert.deepEqual(decks, []);
  });
});
