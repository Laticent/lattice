// `logo-finish:` and the four keys it retired (lib/core/resolve-logo-finish.js, lint-core
// `findRetiredLogoKeys`): an unknown word warns, and an old deck migrates in one `--fix`.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { applyAllFixes } = require('../../../lib/authoring/lint-core');

const vocab = buildVocab();
const deck = (fm) => `---\n${fm}\n---\n\n## A\n\nText.\n`;
const found = (src, rule) => lintText(src, { vocab }).filter((f) => f.rule === rule);
const fixed = (src) => applyAllFixes(src, vocab);

describe('logo-finish: one line, one word per axis', () => {
  test('known words lint clean, in any order', () => {
    for (const v of ['bottom-center', 'accent-ink lg', 'title brand top-left', 'sm']) {
      assert.equal(found(deck(`logo: lattice\nlogo-finish: ${v}`), 'unknown-logo-finish').length, 0, v);
    }
  });
  test('an unknown word, and a second word on one axis, warn', () => {
    assert.equal(found(deck('logo-finish: neon'), 'unknown-logo-finish').length, 1);
    assert.equal(found(deck('logo-finish: accent ink'), 'unknown-logo-finish').length, 1, 'two color words');
  });
  test('the old two-word values stay valid', () => {
    for (const v of ['auto', 'brand']) assert.equal(found(deck(`logo-finish: ${v}`), 'unknown-logo-finish').length, 0, v);
  });
});

describe('the retired keys warn and fix', () => {
  test('each retired line is reported, and exactly one finding writes the merged line', () => {
    const fs = found(deck('logo: lattice\nlogo-on: title\nlogo-x: 50\nlogo-y: 82\nlogo-scale: 1.5'), 'retired-logo-key');
    assert.deepEqual(fs.map((f) => f.line), ['logo-on: title', 'logo-x: 50', 'logo-y: 82', 'logo-scale: 1.5']);
    assert.deepEqual(fs.filter((f) => f.replaceLine).map((f) => f.replaceLine), ['logo-finish: bottom-center lg title']);
    assert.ok(fs.every((f) => f.shapeChange), 'every one says the render changed');
    // The deletes wait for the merge, so no pass can drop a word it has not yet written.
    assert.deepEqual(fs.filter((f) => f.autofixable).map((f) => f.line), ['logo-on: title']);
  });
  test('the shipped examples\' four keys fold into one line', () => {
    const out = fixed(deck('logo: lattice\nlogo-on: title\nlogo-x: 50\nlogo-y: 82\nlogo-scale: 1.0'));
    assert.match(out, /^logo: lattice\nlogo-finish: bottom-center title\n---/m);
    assert.doesNotMatch(out, /logo-on|logo-x|logo-y|logo-scale/);
    assert.equal(found(out, 'retired-logo-key').length, 0, 'nothing left to report');
  });
  test('scale picks a size word; the default scale adds none', () => {
    assert.match(fixed(deck('logo: lattice\nlogo-scale: 2')), /logo-finish: lg\n/);
    assert.match(fixed(deck('logo: lattice\nlogo-scale: 0.5')), /logo-finish: sm\n/);
    assert.doesNotMatch(fixed(deck('logo: lattice\nlogo-scale: 1')), /logo-finish/);
  });
  test('a free position snaps to the nearest berth; a lone axis is dropped', () => {
    assert.match(fixed(deck('logo: lattice\nlogo-x: 90\nlogo-y: 10')), /logo-finish: top-right\n/);
    assert.match(fixed(deck('logo: lattice\nlogo-x: 10\nlogo-y: 95')), /logo-finish: bottom-left\n/);
    const lone = fixed(deck('logo: lattice\nlogo-x: 30'));
    assert.doesNotMatch(lone, /logo-x|logo-finish/, 'a lone axis never positioned anything');
  });
  test('merges into an existing logo-finish line without losing its words', () => {
    const out = fixed(deck('logo: lattice\nlogo-finish: brand\nlogo-on: title\nlogo-scale: 2'));
    assert.equal((out.match(/logo-finish:/g) || []).length, 1, 'one line, not two');
    assert.match(out, /logo-finish: brand lg title\n/);
    assert.doesNotMatch(out, /logo-on|logo-scale/);
  });
  test('the old `logo-style:` key is renamed, its value carried over', () => {
    assert.match(fixed(deck('logo: lattice\nlogo-style: brand')), /^logo-finish: brand plate\n---/m);
    assert.doesNotMatch(fixed(deck('logo: lattice\nlogo-style: brand')), /logo-style/);
    assert.doesNotMatch(fixed(deck('logo: lattice\nlogo-style: auto')), /logo-style|logo-finish/, '`auto` is the default word');
    const both = fixed(deck('logo: lattice\nlogo-style: brand\nlogo-on: title\nlogo-x: 50\nlogo-y: 82'));
    assert.match(both, /^logo-finish: bottom-center brand plate title\n---/m);
    assert.equal(found(both, 'retired-logo-key').length, 0);
  });
  test('`logo-on: all` is just deleted', () => {
    const out = fixed(deck('logo: lattice\nlogo-on: all'));
    assert.doesNotMatch(out, /logo-on|logo-finish/);
  });

  // When the retired key is the ONLY front-matter key, deleting it used to leave `---\n---`, an empty block that every
  // front-matter reader reads on to the first slide break, so "Fix all" turned the title slide into front matter.
  test('deleting the only front-matter key keeps every slide', () => {
    const { render } = require('../../../lib/engine/index.js');
    const headings = (src) => [...String(render(src).html).matchAll(/<h1[^>]*>(.*?)<\/h1>/g)].map((m) => m[1]);
    const src = '---\nlogo-on: all\n---\n<!-- _class: title -->\n# Q3 Board Review\n\n---\n\n# Agenda\n';
    const out = fixed(src);
    assert.equal(out, '<!-- _class: title -->\n# Q3 Board Review\n\n---\n\n# Agenda\n');
    assert.deepEqual(headings(out), headings(src));
    assert.deepEqual(headings(out), ['Q3 Board Review', 'Agenda']);
  });
  test('the emptied block goes in a CRLF deck too', () => {
    assert.equal(fixed('---\r\nlogo-on: all\r\n---\r\n# Title\r\n'), '# Title\r\n');
  });
  test('a body that starts with its own `---` keeps that line a slide break', () => {
    const { render } = require('../../../lib/engine/index.js');
    const headings = (src) => [...String(render(src).html).matchAll(/<h1[^>]*>(.*?)<\/h1>/g)].map((m) => m[1]);
    for (const src of ['---\nlogo-on: all\n---\n---\n\n# B\n\n---\n\n# C\n', '---\r\nlogo-on: all\r\n---\r\n---\r\n# B\r\n\r\n---\r\n# C\r\n']) {
      const out = fixed(src);
      assert.doesNotMatch(out, /logo-on/);
      assert.deepEqual(headings(out), ['B', 'C'], JSON.stringify(out));
    }
  });
  test('`--- ` with a trailing space opens a slide, not front matter, so nothing is dropped', () => {
    const src = '--- \n<!-- paginate: true -->\n---\n# A\n\n---\n\n# B\n';
    assert.equal(fixed(src).startsWith('--- \n---\n'), true);
  });
  test('a deck that already began with an empty block is left as the author wrote it', () => {
    const src = '---\n---\n\n## A\n\nlogo-on: all\n';
    assert.equal(fixed(src).startsWith('---\n---\n'), true);
  });

  test('a CRLF deck keeps its line endings through the merge', () => {
    const out = fixed('---\r\nlogo: lattice\r\nlogo-scale: 2\r\n---\r\n\r\n## A\r\n');
    assert.match(out, /logo-finish: lg\r\n---/);
    assert.equal(/[^\r]\n/.test(out), false, 'no bare LF crept in');
  });
  test('the author\'s trailing comment on an existing logo-finish line survives', () => {
    const out = fixed(deck('logo: lattice\nlogo-finish: top-left # mine\nlogo-scale: 2'));
    assert.match(out, /logo-finish: top-left lg # mine\n/);
  });
  test('the fix says a named berth now hides chrome the old keys left showing', () => {
    const f = found(deck('logo: lattice\nlogo-x: 50\nlogo-y: 82'), 'retired-logo-key').find((x) => x.replaceLine);
    assert.match(f.fix, /hides the header, footer or page number/);
  });
});
