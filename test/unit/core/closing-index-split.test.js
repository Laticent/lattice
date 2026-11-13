/**
 * Unit: `split.onlyVariant` — a recipe scoped to one variant (lib/core/carousel.js carouselize).
 *
 * `closing` splits its `index` see-also list into a cover and its rows, and no other closing
 * (owner, 2026-11-13; engineering/decisions/2026-10-28-fit-everywhere-model.md §21). The gate
 * declines in carouselize, before the strategy runs, and `cover-paginate` is not on auto-split's
 * shape-reader fallthrough list, so a declined plain closing stays whole instead of being handed
 * to a derived axis. Rendered through the real engine, so the section shapes are the ones it emits.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { carouselize } = require('../../../lib/core/carousel');
const { SHAPE_READER_STRATEGIES } = require('../../../lib/core/auto-split');
const { loadAll } = require('../../../lib/components');

const closing = loadAll().find((m) => m.name === 'closing');
const recipe = closing.split;

const ROWS = ['- `a` — one', '- `b` — two', '- `c` — three', '- `d` — four', '- `e` — five'].join('\n');
const sectionOf = (cls, body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`, 'indaco');
  const [s] = splitSections(html).filter((p) => p.type === 'section');
  return s;
};

describe('split.onlyVariant: only a closing index splits', () => {
  test('the closing manifest scopes its recipe to `index`, with a strategy that vetoes on decline', () => {
    assert.equal(recipe.onlyVariant, 'index');
    assert.equal(recipe.strategy, 'cover-paginate');
    assert.ok(!SHAPE_READER_STRATEGIES.has(recipe.strategy), 'a declined recipe must not fall through to a derived axis');
  });

  test('a closing index with a list splits into a cover and its rows', () => {
    const s = sectionOf('closing silent index', `## See also.\n\n\`Related components\`\n\n${ROWS}`);
    const parts = carouselize(s.openTag, s.inner, recipe, 1, 'closing');
    assert.ok(Array.isArray(parts) && parts.length >= 2, `expected a split, got ${parts && parts.length}`);
  });

  test('a closing with the same list but no `index` class stays whole', () => {
    const s = sectionOf('closing silent', `## See also.\n\n\`Related components\`\n\n${ROWS}`);
    assert.equal(carouselize(s.openTag, s.inner, recipe, 1, 'closing'), null);
  });

  test('a one-line closing stays whole', () => {
    const s = sectionOf('closing', '## Ship the plan on Monday.');
    assert.equal(carouselize(s.openTag, s.inner, recipe, 1, 'closing'), null);
  });

  test('the manifest check rejects an onlyVariant that names no variant', () => {
    const { validate } = require('../../../lib/components');
    assert.deepEqual(validate(closing, 'closing.manifest.json').filter((e) => /onlyVariant/.test(e)), []);
    const errors = validate({ ...closing, split: { ...closing.split, onlyVariant: 'nope' } }, 'closing.manifest.json');
    assert.ok(errors.some((e) => /onlyVariant 'nope'/.test(e)), errors.join('\n'));
  });
});
