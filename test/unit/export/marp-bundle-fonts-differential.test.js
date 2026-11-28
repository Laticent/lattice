/**
 * Segno P5b, Family B: the Export-to-Marp bundle's two font readers (lib/export/marp-bundle.js `fontAssetsFor`, which
 * copies the woff2 files the bundled sheet asks for, and `withoutEmojiFont`, which drops the emoji faces) on the one CSS
 * tokenizer, against the regexes they replaced (frozen in tools/segno-legacy/marp-bundle-fonts.js).
 *
 * On every built and shipped sheet, dist/lattice.css first, both answer the same. On a seeded corpus they agree wherever
 * none of the named cases is present: a comment or a string holds what the regexes read, a `url(` is spelled with
 * capitals or escapes, or a face names the emoji font somewhere other than its `font-family`. In each, CSS reads it the
 * new way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/marp-bundle-fonts.js');
const now = require('../../../lib/export/marp-bundle.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const answers = (m, css) => JSON.stringify([m.fontAssetsFor(css), m.withoutEmojiFont(css)]);
const same = (css) => answers(now, css) === answers(legacy, css);

const sheets = () => {
  const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const dir of ['dist', 'dist/themes']) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) for (const f of fs.readdirSync(abs)) if (f.endsWith('.css')) files.push(path.join(dir, f));
  }
  files.push('node_modules/katex/dist/katex.min.css');
  return files;
};

test('both readers answer the same on every built and shipped sheet', () => {
  const files = sheets();
  assert.ok(files.includes('dist/lattice.css'), 'npm run build first: dist/lattice.css is the sheet the bundle carries');
  const lattice = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8');
  assert.ok(legacy.fontAssetsFor(lattice).length >= 5, 'the bundled sheet asks for its fonts');
  assert.notEqual(legacy.withoutEmojiFont(lattice), lattice, 'the bundled sheet carries the emoji faces');
  for (const f of files) assert.ok(same(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});

const PIECES = [
  '@font-face{', '}', '{', ';', "font-family:'Noto Color Emoji';", 'font-family:"Inter";', 'src:url(fonts/a.woff2);',
  "src:url('fonts/b.woff2');", 'src:URL(fonts/c.woff2);', 'src:url(fonts/d e.woff2);', 'src:local("Noto Color Emoji");',
  '/* url(fonts/x.woff2) */', '"url(fonts/y.woff2)"', "'}'", ' ', '\n',
];
const corpus = (seed, count) => {
  const rnd = prng(seed);
  return Array.from({ length: count }, (_, n) => {
    let s = '';
    const len = 2 + Math.floor(rnd() * 12);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return [`pieces#${seed}.${n}`, s];
  });
};
const READS = /url\(|font-face|Noto Color Emoji|[{}]/i;
const explained = (css) =>
  cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && READS.test(css.slice(t.from, t.to))) ||
  css.includes('URL(') || // the regex matched case-sensitively; CSS does not
  css.includes('local("Noto Color Emoji")') || // the regex dropped a face that only mentions the emoji font
  /@font-face\{[^}]*\{/.test(css); // a nested `{` inside a face

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(9, 4000), ...corpus(18, 4000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained.slice(0, 5), []);
  assert.ok(agree > 1500, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test('failing arm: a url(fonts/…) inside a string is not a font to copy', () => {
  const css = '.x{content:"url(fonts/ghost.woff2)"}@font-face{src:url(fonts/real.woff2)}';
  assert.deepEqual(legacy.fontAssetsFor(css).map((f) => f.to), ['fonts/ghost.woff2', 'fonts/real.woff2']);
  assert.deepEqual(now.fontAssetsFor(css).map((f) => f.to), ['fonts/real.woff2']);
});

test("failing arm: a '}' in a family string no longer leaves half an emoji face behind", () => {
  const css = "@font-face{font-family:'Noto Color Emoji';src:url('fonts/e}1.woff2')}h1{color:red}";
  assert.equal(legacy.withoutEmojiFont(css), "1.woff2')}h1{color:red}");
  assert.equal(now.withoutEmojiFont(css), 'h1{color:red}');
});
