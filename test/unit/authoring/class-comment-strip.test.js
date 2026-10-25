/**
 * stripClassComments (lib/authoring/prose-budgets.js) replaced a regex that backtracked in cubic
 * time on an unterminated `<!-- class:` (#1890: 4000 spaces took 24 s and froze the Studio). The
 * scan must remove exactly what the old regex removed, so this file pins it to the old regex on a
 * seeded corpus and on every Markdown file the repo ships, and bounds the time on the inputs that
 * used to freeze it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripClassComments } = require('../../../lib/authoring/prose-budgets.js');
const { reviewText } = require('../../../lib/authoring/review-core.js');

// The regex as it stood before #1890. Only ever run on short inputs here: it is cubic.
const OLD = /<!--\s*_?class:\s*[^>]*?\s*-->/g;
const viaOld = (s) => s.replace(OLD, '');

const ROOT = path.join(__dirname, '../../..');

function markdownFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) markdownFiles(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

describe('stripClassComments matches the old regex', () => {
  test('hand-picked edges', () => {
    for (const s of [
      '<!-- class: a -->', '<!--_class: a b-->', '<!-- class:-->', '<!--class:->', '<!-- class: a > b -->',
      'x<!-- class: a -->y<!-- _class: b -->z', '<!--<!-- class: a -->', '<!-- class: a --->', '<!-- class: --!>-->',
      '<!-- class: a\n b -->', '<!-- _ class: a -->', '<!-- class: a', '<!-- class: a --> -->', ' <!-- class: x -->',
      '<!-- class: a -- > -->', '<!-- class: <!-- class: x -->', '<!-- note --><!-- class: a -->',
    ]) {
      assert.equal(stripClassComments(s), viaOld(s), JSON.stringify(s));
    }
  });

  test('a seeded fuzz of 20,000 short strings over the characters the pattern cares about', () => {
    let seed = 1890;
    const rnd = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const parts = ['<!--', '-->', ' ', '\t', '\n', '_', 'class:', 'class', ':', '-', '>', '<', '!', 'a', '--', '<!-- class:', '<!--_class:'];
    for (let i = 0; i < 20000; i++) {
      let s = '';
      for (let n = rnd(12); n >= 0; n--) s += parts[rnd(parts.length)];
      assert.equal(stripClassComments(s), viaOld(s), JSON.stringify(s));
    }
  });

  test('every Markdown file in the repo strips to the same text', () => {
    const files = [
      ...markdownFiles(path.join(ROOT, 'examples')),
      ...markdownFiles(path.join(ROOT, 'test/integration/baseline-decks')),
      ...markdownFiles(path.join(ROOT, 'lib/components')),
      ...markdownFiles(path.join(ROOT, 'design')),
    ];
    assert.ok(files.length > 50, `found ${files.length} files`);
    let directives = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      directives += (src.match(OLD) || []).length;
      assert.equal(stripClassComments(src), viaOld(src), path.relative(ROOT, f));
    }
    assert.ok(directives > 100, `the corpus carries real directives (${directives})`);
  });
});

describe('stripClassComments is linear', () => {
  // The old regex took 381 ms, 3.1 s and 23.9 s on 1000, 2000 and 4000 spaces (cubic).
  const time = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

  test('an unterminated directive followed by 4000 spaces takes under 50 ms, in the strip and in reviewText', () => {
    const src = `# Title\n\n<!-- class: ${' '.repeat(4000)}\n\nwords here`;
    assert.ok(time(() => stripClassComments(src)) < 50);
    assert.ok(time(() => reviewText(src)) < 50 * 20, 'the whole review stays far from a freeze');
  });

  test("the issue's own input: '<!-- _class: ' and 3000 spaces, tabs or newlines, under 50 ms each", () => {
    for (const ws of [' ', '\t', '\n', '\n\n']) {
      const src = `<!-- _class: ${ws.repeat(3000)}`;
      assert.ok(time(() => stripClassComments(src)) < 50, JSON.stringify(ws));
      assert.equal(stripClassComments(src), src);
    }
  });

  test('20,000 unterminated directives (240 KB), quadratic for a `[^>]*-->` regex, take under 50 ms', () => {
    const src = '<!-- class: '.repeat(20000);
    assert.ok(time(() => stripClassComments(src)) < 50);
    assert.equal(stripClassComments(src), src);
  });
});
