/**
 * Unit: lib/core/front-matter-groups.js keyGroups — the one reader of a front-matter body's top-level keys, shared by
 * the Marp-bundle exporter, the runtime's merge, the settings-block fold, the legend and the Compose paste merge.
 * A list at its key's own column split wrong before 2026-11-16 (PR #3234); an apostrophe must open nothing.
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

  // The checker on 31c16ce9: tracking an open quote let one apostrophe swallow every key after it, in the Marp
  // bundle split and the legend. A quoted value continued at column 0 is a shape Marp rejects anyway.
  test('an apostrophe or an unclosed quote opens nothing: every later key is its own', () => {
    assert.deepEqual(keys("title: 'Tis the season\nmode: dark\nfinish: velvet\nclass: lead"), ['title', 'mode', 'finish', 'class']);
    assert.deepEqual(keys('title: "Q3 review\nclass: no-callout'), ['title', 'class']);
  });

  test('a quoted value continued on an INDENTED line stays with its key', () => {
    assert.deepEqual(keys('title: "Q3 review,\n  agenda part two"\ntheme: indaco'), ['title', 'theme']);
  });

  test('keys with no space after the colon, dots and a dollar sign are keys; a trailing comment is the tail', () => {
    const { groups, tail } = keyGroups('theme:cuoio\nx.y: 1\n$schema: ./s.json\n# keep me');
    assert.deepEqual(groups.map((g) => g.key), ['theme', 'x.y', '$schema']);
    assert.equal(tail, '# keep me');
  });

  test('joining the groups and the tail gives the input back', () => {
    for (const yaml of [
      'class:\n- lead\n- dark\ntheme: x',
      "title: 'Tis the season\nmode: dark",
      'lenses:\n  a:\n    x: 1\n\n  b:\n    y: 2\ntheme: x',
      '# head\ntheme: x\n# between\nstyle: |\n  h1 { color: #111; }\n\n# tail',
    ]) assert.equal(rejoin(yaml), yaml);
  });
});

// The callers the checker on 31c16ce9 measured: an apostrophe in a title must not move other keys out of reach.
describe('keyGroups callers: an apostrophe in a value', () => {
  test('the Marp bundle still moves the Lattice keys into the settings block', () => {
    const { withBundleFrontMatter } = require('../../../lib/export/bundle-front-matter.js');
    const out = withBundleFrontMatter("---\ntitle: 'Tis the season\nmode: dark\nfinish: velvet\nclass: lead\n---\n\n# Hi\n");
    const block = /<script type="application\/lattice-settings">\n([\s\S]*?)<\/script>/.exec(out);
    assert.ok(block, 'a settings block is written');
    assert.match(block[1], /^mode: dark$/m);
    assert.match(block[1], /^class: lead$/m);
  });

  test('the legend reads a `class:` after an unclosed quote, as the engine does', () => {
    const { calloutsOff } = require('../../../lib/core/legend.js');
    assert.equal(calloutsOff({ frontMatter: 'title: "Q3 review\nclass: no-callout' }), true);
  });
});
