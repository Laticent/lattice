/**
 * Segno P5b, Family B: the player's font subsetter (lib/export/player-fonts.js) finds its faces, their families and their
 * woff2 payloads with the one CSS tokenizer (lib/export/css-at-rules.js), against the regexes it replaced (frozen in
 * tools/segno-legacy/player-fonts.js).
 *
 * On every shipped sheet, and on the engine's own embedded font block, the two read the same faces, families and
 * payloads. On a seeded corpus they agree wherever none of the named cases is present; in each named case CSS reads it
 * the new way: a comment or a string holds what the regexes read, a face's block opens a nested `{`, the at-keyword is
 * in capitals, the family is an unquoted list (its first name is the family), or the address is quoted.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/player-fonts.js');
const { cssAtRuleBlocks, faceFamily, cssBase64Urls } = require('../../../lib/export/css-at-rules.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const faces = (css) =>
  cssAtRuleBlocks(css, 'font-face').map(([from, to]) => ({
    text: css.slice(from, to),
    family: faceFamily(css, from, to),
    payloads: cssBase64Urls(css, 'font/woff2', from, to).map((u) => u.payload),
  }));
const same = (css) => JSON.stringify(faces(css)) === JSON.stringify(legacy.faces(css));

test('the same faces, families and payloads on every shipped sheet and on KaTeX', () => {
  const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  files.push('dist/lattice.css', 'node_modules/katex/dist/katex.min.css');
  let withFaces = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (legacy.faces(css).length) withFaces++;
    assert.ok(same(css), f);
  }
  assert.ok(withFaces >= 3, `${withFaces} sheets hold faces`);
});

test("the same on a font block the engine's own face writer makes", () => {
  const { faceRuleCss } = require('../../../lib/fonts/face-rule.js');
  const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
  const b64 = Buffer.from('woff2-bytes').toString('base64');
  const css = TEXT_FACES.map((f) => faceRuleCss(f, 'swap', b64)).join('\n');
  assert.ok(legacy.faces(css).length >= TEXT_FACES.length && legacy.faces(css).every((f) => f.payloads.length === 1));
  assert.ok(same(css));
});

const PIECES = [
  '@font-face{', '@font-face {', '@FONT-FACE{', '}', '{', ';', "font-family:'Inter';", 'font-family:"Noto Emoji";',
  'font-family: Foo, Bar;', 'font-family:Lattice Icons;', 'src:url(data:font/woff2;base64,QUJD)', 'src:url(data:font/woff2;base64,QUJD+/=)',
  "src:url('data:font/woff2;base64,RERE')", ' format("woff2")', '/* } */', "'}'", '"url(data:font/woff2;base64,WFla)"', ' ', '\n',
  'font-weight:400;', '.x{color:red}',
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
const READS = /font-face|[{};]|url\(|font-family/;
const explained = (css) =>
  cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && READS.test(css.slice(t.from, t.to))) ||
  /@font-face\s*\{[^}]*\{/.test(css) ||
  /@FONT-FACE/.test(css) ||
  /font-family:\s*[^'";}]*,/.test(css) ||
  /url\(['"]/.test(css);

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(4, 5000), ...corpus(8, 5000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained, []);
  assert.ok(agree > 2000, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test("failing arm: a '}' in a family string no longer cuts the face and hides its payload", () => {
  const css = "@font-face{font-family:'a}b';src:url(data:font/woff2;base64,QUJD)}";
  assert.deepEqual(legacy.faces(css)[0].payloads, []);
  assert.deepEqual(faces(css)[0].payloads, ['QUJD']);
});

test('failing arm: a face inside a comment is not a face', () => {
  const css = '/* @font-face{font-family:x;src:url(data:font/woff2;base64,QUJD)} */';
  assert.equal(legacy.faces(css).length, 1);
  assert.equal(faces(css).length, 0);
});
