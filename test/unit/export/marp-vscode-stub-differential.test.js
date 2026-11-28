/**
 * Segno P5b, Family B: the VS Code theme stub (lib/export/marp-vscode-stub.js `stubOf`) on the one CSS tokenizer, against
 * the character walk and the `@import` regex it replaced (frozen in tools/segno-legacy/marp-vscode-stub.js).
 *
 * On every shipped theme and palette sheet the two write the same stub. On a seeded corpus they agree wherever none of
 * the named cases is present: a comment or a string holds an `@import`, an `@import` is spelled with capitals, or a
 * comment sits between the name and its `;`. In each, CSS reads it the new way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/marp-vscode-stub.js');
const now = require('../../../lib/export/marp-vscode-stub.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const run = (m, css) => {
  try {
    return m.stubOf(css);
  } catch (e) {
    return `throws: ${e.message}`;
  }
};
const same = (css) => run(now, css) === run(legacy, css);

test('the two write the same stub for every shipped sheet', () => {
  const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  let stubs = 0;
  let imports = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const old = run(legacy, css);
    if (!old.startsWith('throws')) stubs++;
    if (old.includes('@import')) imports++;
    assert.equal(run(now, css), old, f);
  }
  assert.ok(stubs >= 10, `sheets with a @theme directive: ${stubs}`);
  assert.ok(imports >= 5, `stubs with an @import: ${imports}`);
});

const PIECES = [
  '/* @theme onyx */', '/* @size 16:9 */', '/* note */', '/**/', '@import "lattice";', "@import 'onyx' ;", '@IMPORT "x";',
  '@import "a b";', '@import "q"/**/;', '@import "r"', '"@import \'s\';"', '/* @import "t"; */', 'section{}', ' ', '\n',
];
const corpus = (seed, count) => {
  const rnd = prng(seed);
  return Array.from({ length: count }, (_, n) => {
    let s = '';
    const len = 1 + Math.floor(rnd() * 10);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return [`pieces#${seed}.${n}`, s];
  });
};
const explained = (css) =>
  cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && /@import/i.test(css.slice(t.from, t.to))) ||
  css.includes('@IMPORT') || // the regex matched case-sensitively; CSS does not
  css.includes('"q"/**/;'); // a comment between the name and its `;`

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(10, 4000), ...corpus(20, 4000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained.slice(0, 5), []);
  assert.ok(agree > 1500, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test('failing arm: an @import inside a string or a later comment is not registered', () => {
  const css = '/* @theme brand */\n@import "lattice";\n.x{content:"@import \'ghost\';"}\n/* @import "old"; */';
  assert.equal(legacy.stubOf(css), "/* @theme brand */\n@import 'lattice';\n@import 'ghost';\n@import 'old';\n");
  assert.equal(now.stubOf(css), "/* @theme brand */\n@import 'lattice';\n");
});
