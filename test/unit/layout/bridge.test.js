/**
 * Unit: lib/layout/bridge.js — the Workbench component bridge core.
 *
 * A CSS-only local component reaches a deck two ways, and ONE pure scan must
 * feed both so they can't drift: detect which library components a deck
 * references, then embed only those as Marp global <style> blocks (live render
 * AND export, identical). Plus the save-time collision guard.
 *
 * See engineering/decisions/2026-06-12-workbench-component-bridge.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  referencedComponents,
  embedComponentsInMarkdown,
  stripEmbeddedComponents,
  collidesWithShipped,
} = require('../../../lib/layout/bridge.js');

const LIB = ['split-ledger', 'wide-quote', 'corner-stat'];

describe('referencedComponents — detection', () => {
  test('finds a slide _class directive that names a library component', () => {
    const src = '# A\n\n<!-- _class: split-ledger -->\n\n## B';
    assert.deepEqual(referencedComponents(src, LIB), ['split-ledger']);
  });

  test('ignores modifiers and shipped names, keeps only library tokens', () => {
    // `dark` is a modifier, `cards-grid` is shipped (not in LIB) — neither counts.
    const src = '<!-- _class: cards-grid dark split-ledger numbered -->';
    assert.deepEqual(referencedComponents(src, LIB), ['split-ledger']);
  });

  test('dedups across slides, first-appearance order', () => {
    const src = [
      '<!-- _class: wide-quote -->',
      '<!-- _class: split-ledger -->',
      '<!-- _class: wide-quote -->', // repeat
    ].join('\n\n');
    assert.deepEqual(referencedComponents(src, LIB), ['wide-quote', 'split-ledger']);
  });

  test('reads a deck-wide class: from front matter', () => {
    const src = '---\ntheme: indaco\nclass: corner-stat\n---\n\n# A';
    assert.deepEqual(referencedComponents(src, LIB), ['corner-stat']);
  });

  test('handles the no-space `_class:foo` form', () => {
    assert.deepEqual(referencedComponents('<!-- _class:wide-quote -->', LIB), ['wide-quote']);
  });

  test('empty library or no matches → []', () => {
    assert.deepEqual(referencedComponents('<!-- _class: split-ledger -->', []), []);
    assert.deepEqual(referencedComponents('<!-- _class: cards-grid -->', LIB), []);
  });
});

describe('embedComponentsInMarkdown — embedding', () => {
  const COMPS = [
    { name: 'split-ledger', css: 'section.split-ledger { display: grid; color: var(--text-body); }' },
    { name: 'wide-quote', css: 'section.wide-quote { font-size: var(--fs-message); }' },
  ];

  test('places blocks after front matter, keeping the directive', () => {
    const src = '---\ntheme: indaco\n---\n\n<!-- _class: split-ledger -->\n\n# Hi';
    const out = embedComponentsInMarkdown(src, COMPS);
    const fmEnd = out.indexOf('---', 3) + 3;
    assert.ok(out.startsWith('---\ntheme: indaco\n---'), 'front matter preserved');
    assert.ok(out.indexOf('<style>') > fmEnd, 'style block sits after front matter');
    assert.ok(out.includes('section.split-ledger'), 'component css embedded');
    assert.ok(out.includes('# Hi'), 'body preserved');
  });

  test('embeds at the top when there is no front matter', () => {
    const out = embedComponentsInMarkdown('<!-- _class: wide-quote -->\n', COMPS);
    assert.ok(out.startsWith('<style>'), 'block leads when no front matter');
  });

  test('blocks are sorted by name for stable diffs', () => {
    const out = embedComponentsInMarkdown('# x', COMPS);
    assert.ok(out.indexOf('section.split-ledger') < out.indexOf('section.wide-quote'));
  });

  test('skips components with no css; no-op on empty list', () => {
    assert.ok(!embedComponentsInMarkdown('# x', [{ name: 'empty', css: '' }]).includes('<style>'));
    assert.equal(embedComponentsInMarkdown('# x', []), '# x');
  });

  test('is idempotent — a re-embed never double-defines a class', () => {
    const once = embedComponentsInMarkdown('# x', COMPS);
    const twice = embedComponentsInMarkdown(once, COMPS);
    assert.equal(twice, once, 're-embedding the same set is a fixed point');
    assert.equal((twice.match(/section\.split-ledger/g) || []).length, 1);
  });

  test('a changed css re-embeds cleanly (strip-then-write)', () => {
    const once = embedComponentsInMarkdown('# x', COMPS);
    const changed = [{ ...COMPS[0], css: 'section.split-ledger { gap: var(--sp-lg); }' }, COMPS[1]];
    const out = embedComponentsInMarkdown(once, changed);
    assert.ok(out.includes('gap: var(--sp-lg)'));
    assert.ok(!out.includes('display: grid'), 'old definition stripped');
    assert.equal((out.match(/section\.split-ledger/g) || []).length, 1);
  });

  test('does NOT strip an embedded THEME block (different marker)', () => {
    const themed =
      '---\nx: 1\n---\n\n<style>\n/* Lattice Workbench — embedded theme "dusk" */\n:root{--bg:var(--x)}\n</style>\n\n# x';
    const out = embedComponentsInMarkdown(themed, COMPS);
    assert.ok(out.includes('embedded theme "dusk"'), 'theme block survives');
    assert.ok(out.includes('section.split-ledger'), 'component block added');
  });
});

describe('stripEmbeddedComponents', () => {
  test('removes embedded component blocks, leaves the rest', () => {
    const out = embedComponentsInMarkdown('# body', [{ name: 'a', css: 'section.a{color:var(--x)}' }]);
    assert.equal(stripEmbeddedComponents(out).trim(), '# body');
  });
});

describe('collidesWithShipped — save-time guard', () => {
  const SHIPPED = ['cards-grid', 'kpi', 'split-ledger'];
  test('true when the name matches a shipped class', () => {
    assert.equal(collidesWithShipped('cards-grid', SHIPPED), true);
    assert.equal(collidesWithShipped(' split-ledger ', SHIPPED), true);
  });
  test('false for a fresh name or empty inputs', () => {
    assert.equal(collidesWithShipped('my-rail', SHIPPED), false);
    assert.equal(collidesWithShipped('cards-grid', []), false);
    assert.equal(collidesWithShipped('', SHIPPED), false);
  });
});

// A component used ONLY in a pane is used: its CSS has to ship with the deck, or the pane renders
// unstyled. The Studio's saved components and the CLI's installed packages both go through here.
test('referencedComponents counts a component a pane marker names', () => {
  const src = '## T\n\n<!-- pane: corner-stat -->\n\n- 4\n\n<!-- pane: list -->\n\n- x\n';
  assert.deepEqual(referencedComponents(src, LIB), ['corner-stat']);
  // A marker for a component the library does not hold is not a reference.
  assert.deepEqual(referencedComponents('<!-- pane: nothing -->', LIB), []);
});
