/**
 * Unit: lib/core/front-matter-groups.js keyGroups — the one reader of a front-matter body's top-level keys, shared by
 * the Marp-bundle exporter, the runtime's merge, the settings-block fold, the legend and the Compose paste merge.
 * The cases below each split wrong before 2026-11-16 (PR #3234): a list at the key's own column, a quoted value
 * continued on the next line, a flow map closed at column 0.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { keyGroups } = require('../../../lib/core/front-matter-groups');

const keys = (yaml) => keyGroups(yaml).groups.map((g) => g.key);
const rejoin = (yaml) => {
  const { groups, tail } = keyGroups(yaml);
  return [...groups.map((g) => g.text), ...(tail ? [tail] : [])].join('\n');
};

describe('keyGroups', () => {
  test('a list written at the key’s own column stays with its key', () => {
    const { groups } = keyGroups('class:\n- lead\n- dark\ntheme: x');
    assert.deepEqual(groups, [
      { key: 'class', text: 'class:\n- lead\n- dark' },
      { key: 'theme', text: 'theme: x' },
    ]);
  });

  test('a quoted value continued on the next line stays with its key, whatever the continuation looks like', () => {
    assert.deepEqual(keys('title: "Q3 review\nAgenda, part two: costs"\ntheme: indaco'), ['title', 'theme']);
    assert.deepEqual(keys('t: "a \\" b\nc: d"\nx: 1'), ['t', 'x']);
    assert.deepEqual(keys("t: 'it''s\nok: no'\nx: 1"), ['t', 'x']);
  });

  test('a one-line quoted value opens nothing', () => {
    assert.deepEqual(keys('title: "Q3: review"\ntheme: x'), ['title', 'theme']);
    assert.deepEqual(keys("title: 'it''s'\ntheme: x"), ['title', 'theme']);
  });

  test('a flow map closed at column 0 stays with its key', () => {
    assert.deepEqual(keys('pptx: {\n  a: 1\n}\ntheme: x'), ['pptx', 'theme']);
  });

  test('keys with no space after the colon, dots and a dollar sign are keys; a trailing comment is the tail', () => {
    const { groups, tail } = keyGroups('theme:cuoio\nx.y: 1\n$schema: ./s.json\n# keep me');
    assert.deepEqual(groups.map((g) => g.key), ['theme', 'x.y', '$schema']);
    assert.equal(tail, '# keep me');
  });

  test('joining the groups and the tail gives the input back', () => {
    for (const yaml of [
      'class:\n- lead\n- dark\ntheme: x',
      'title: "Q3 review\nAgenda, part two: costs"\ntheme: indaco',
      'lenses:\n  a:\n    x: 1\n\n  b:\n    y: 2\ntheme: x',
      '# head\ntheme: x\n# between\nstyle: |\n  h1 { color: #111; }\n\n# tail',
    ]) assert.equal(rejoin(yaml), yaml);
  });
});
