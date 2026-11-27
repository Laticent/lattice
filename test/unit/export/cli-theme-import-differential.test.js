/**
 * Segno P5b, Family B: `rootsOnBase`'s theme-import test (lib/export/cli-deck-sheet.js `importsTheme`) read by the one
 * CSS tokenizer, against the naive comment strip and regex it replaced (frozen in tools/segno-legacy/cli-theme-import.js).
 *
 * The two must agree on every shipped sheet and on the seeded fuzz corpus, except where the old read was wrong in a way
 * this names: the naive `/\/\*[\s\S]*?\*\//` strip saw a comment the tokenizer does not (a `/*` inside a string, or an
 * unclosed comment); the regex matched an `@import` the tokenizer reads as part of a string, a comment, a url or another
 * rule's prelude; or the `@import` is spelled in a case or with escapes the regex did not read, as CSS reads them.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/cli-theme-import.js');
const { importsTheme } = require('../../../lib/export/cli-deck-sheet.js');
const { cssTokens, cssImports } = require('../../../lib/core/css-tokens.js');
const { fuzzInputs, prng } = require('../../fixtures/web-ref-fuzz.js');

const shipped = () =>
  execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('dist/'))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);

// Fragments that put the cases this reader decides next to each other: imports by name, quoted and not, inside strings,
// comments and urls, comment openers inside strings, escapes and case.
const PIECES = [
  "@import 'lattice';", '@import "indaco";', "@import 'a b';", '@import url(x.css);', '@IMPORT "x";', "@imp\\6frt 'y';",
  "'/*'", '"*/"', '/* @import "z"; */', '/*', '*/', "content: '@import \"q\"';", 'url(@import"w")', ':root{--a:1}',
  "a{b:'c'}", '\n', ' ', ';', '"', "'", '\\', '@import', "'n'", '{', '}',
];
const shuffled = (seed, count) => {
  const rnd = prng(seed);
  const out = [];
  for (let n = 0; n < count; n++) {
    let s = '';
    const len = 1 + Math.floor(rnd() * 8);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    out.push([`pieces#${seed}.${n}`, s]);
  }
  return out;
};

const tokenStrip = (css) => cssTokens(css).filter((t) => t.type !== 'comment').map((t) => css.slice(t.from, t.to)).join('');
// The regex matched text that is not an `@import` rule's target: inside a string, a comment or a url, or a second
// `@import` inside the first one's prelude (CSS reads one rule, `@import @import 'x'`, and drops it).
const matchedNoRule = (css) => {
  const stripped = tokenStrip(css);
  const m = legacy.THEME_IMPORT_RE.exec(stripped);
  if (m && !cssImports(stripped).some((r) => r.from === m.index && r.target?.type === 'string')) return true;
  // A url token holds its `@import "…"` whole, so a comment strip that leaves the url alone still matches inside it.
  return cssTokens(css).some((t) => t.type === 'url' && legacy.THEME_IMPORT_RE.test(css.slice(t.from, t.to)));
};
// The tokenizer read an `@import` the regex cannot spell: CSS matches the name without case and decodes escapes.
const spelledOtherwise = (css) =>
  cssImports(tokenStrip(css)).some((r) => r.target?.type === 'string' && tokenStrip(css).slice(r.from, r.from + 7) !== '@import');
const explained = (css) => css.replace(legacy.COMMENT_RE, '') !== tokenStrip(css) || matchedNoRule(css) || spelledOtherwise(css);

test('the tokenizer read agrees with the naive read on every shipped sheet', () => {
  const sheets = shipped();
  assert.ok(sheets.length > 100, `read ${sheets.length} sheets`);
  for (const [name, css] of sheets) assert.equal(importsTheme(css), legacy.importsTheme(css), name);
});

test('on the seeded corpus, every disagreement is one the naive read got wrong, and it names which', () => {
  const corpus = [
    ...fuzzInputs(7, 3000, 'http://127.0.0.1:9').filter((x) => x.kind === 'css').map((x) => [x.name, x.text]),
    ...shuffled(3, 4000),
    ...shuffled(5, 4000),
  ];
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of corpus) {
    if (importsTheme(css) === legacy.importsTheme(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained, []);
  // The corpus must exercise both sides, or this proves nothing.
  assert.ok(agree > 5000, `agreed on ${agree}`);
  assert.ok(fixed > 50, `fixed ${fixed}`);
});

test('failing arm: a comment opener inside a string no longer hides the import after it', () => {
  const css = ":root{--q:'/*'}\n@import 'indaco';\n/* note */";
  assert.equal(legacy.importsTheme(css), false, 'the naive strip ate the import');
  assert.equal(importsTheme(css), true);
});

test('failing arm: an @import spelled inside a string or a comment is not one', () => {
  assert.equal(legacy.importsTheme("a{content:\"@import 'x'\"}"), true);
  assert.equal(importsTheme("a{content:\"@import 'x'\"}"), false);
  assert.equal(importsTheme("/* @import 'x' */"), false);
  assert.equal(importsTheme("@import 'x';"), true);
  assert.equal(importsTheme('@import "a b";'), false, 'a theme name has no space');
  assert.equal(importsTheme('@import url(x.css);'), false, 'a url is a file, not a theme');
});
