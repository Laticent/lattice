/**
 * Segno P5b, Family B: the PDF writer's `@font-face` read (lib/export/pdf-asset-reader.js `fontFaceRules`, through
 * `fontFaceBlocks`) on the one CSS tokenizer (lib/export/css-at-rules.js), against the regex it replaced (frozen in
 * tools/segno-legacy/pdf-font-faces.js).
 *
 * On every shipped sheet the two hand back the same text. On a seeded corpus they agree wherever none of the named
 * cases is present: a comment or a string holds what the regex reads, the at-rule is written in another case or with a
 * comment before its `{`, or a face's block opens a nested `{`. In each, CSS reads it the new way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/pdf-font-faces.js');
const { fontFaceBlocks, createAssetReader } = require('../../../lib/export/pdf-asset-reader.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const same = (css) => fontFaceBlocks(css) === legacy.fontFaceBlocks(css);

test('the two read every shipped sheet the same', () => {
  const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  files.push('node_modules/katex/dist/katex.min.css');
  let faces = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (legacy.fontFaceBlocks(css)) faces++;
    assert.ok(same(css), f);
  }
  assert.ok(faces >= 3, `sheets with faces: ${faces}`);
});

const PIECES = [
  '@font-face{', '@font-face {', '@FONT-FACE{', '@font-face/**/{', '@media print{', '}', '{', ';',
  "font-family:'Outfit';", 'src:url(a.woff2);', 'font-weight:400;', '/* } */', '/* @font-face{x:y} */', "'}'",
  '"@font-face{"', ' ', '\n',
];
const corpus = (seed, count) => {
  const rnd = prng(seed);
  return Array.from({ length: count }, (_, n) => {
    let s = '';
    const len = 2 + Math.floor(rnd() * 14);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return [`pieces#${seed}.${n}`, s];
  });
};
const READS = /font-face|[{}]/i;
const explained = (css) =>
  cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && READS.test(css.slice(t.from, t.to))) ||
  /@FONT-FACE/.test(css) || // the regex matched case-sensitively; CSS does not
  /@font-face\s*\/\*/.test(css) || // a comment between the name and its `{`
  /@font-face\s*\{[^}]*\{/i.test(css); // a nested `{` inside a face

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(7, 4000), ...corpus(14, 4000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained.slice(0, 5), []);
  assert.ok(agree > 1500, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test("failing arm: a '}' in a family string no longer cuts the face short", () => {
  const css = "@font-face{font-family:'Out}fit';src:url(a.woff2)}";
  assert.equal(legacy.fontFaceBlocks(css), "@font-face{font-family:'Out}");
  assert.equal(fontFaceBlocks(css), css);
});

test('failing arm: a commented-out face is not handed to the PDF writer', () => {
  const css = '/* @font-face{font-family:Ghost;src:url(g.woff2)} */@font-face{font-family:Inter;src:url(i.woff2)}';
  assert.equal(legacy.fontFaceBlocks(css).includes('Ghost'), true);
  assert.equal(fontFaceBlocks(css), '@font-face{font-family:Inter;src:url(i.woff2)}');
});

test('fontFaceRules reads a confined local sheet through the new reader', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-faces-'));
  const sheet = path.join(dir, 'deck.css');
  fs.writeFileSync(sheet, "h1{color:red}/* @font-face{font-family:Ghost} */@font-face{font-family:'A}B';src:url(a.woff2)}");
  try {
    const reader = createAssetReader([dir]);
    assert.equal(reader.fontFaceRules(pathToFileURL(sheet).href), "@font-face{font-family:'A}B';src:url(a.woff2)}");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
