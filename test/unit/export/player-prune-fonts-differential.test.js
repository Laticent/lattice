/**
 * Segno P5b, Family B: the player prune's three `@font-face` readers (lib/export/player-prune.js `prunePlayerFontFaces`,
 * `fontFaceFamilies`, `mergeIdenticalFontFaces`) on the one CSS tokenizer (lib/export/css-at-rules.js), against the
 * regexes they replaced (frozen in tools/segno-legacy/player-prune-fonts.js).
 *
 * On a font block the engine's own face writer makes, and on every shipped sheet, all three answer the same. On a seeded
 * corpus they agree wherever none of the named cases is present: a comment or a string holds what the regexes read, or
 * a face's block opens a nested `{`. In each, CSS reads it the new way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/player-prune-fonts.js');
const now = require('../../../lib/export/player-prune.js');
const { faceRuleCss } = require('../../../lib/fonts/face-rule.js');
const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const USED = [
  ['inter', 'outfit'],
  ['jetbrains mono'],
  ['nothing-embedded'],
];
const MERGE = [
  { byFamily: { outfit: [300, 400, 500, 600, 700], 'jetbrains mono': [400, 600] } },
  { byFamily: { inter: [400] }, any: [700] },
  { byFamily: { outfit: [400] }, foreign: ['outfit'] },
];
const answers = (m, css) =>
  JSON.stringify([
    USED.map((u) => m.prunePlayerFontFaces(css, new Set(u))),
    [...m.fontFaceFamilies(css)],
    MERGE.map((u) => m.mergeIdenticalFontFaces(css, u)),
  ]);
const same = (css) => answers(now, css) === answers(legacy, css);

// The engine's faces, with one file per family so the merge has runs to merge.
const block = () =>
  TEXT_FACES.map((f) => faceRuleCss(f, 'swap', Buffer.from(`${f.family}-file`).toString('base64'))).join('\n');

test("all three answer the same on the engine's own font block", () => {
  const css = block();
  assert.ok(legacy.fontFaceFamilies(css).size >= 3, 'the block declares several families');
  assert.ok(MERGE.some((u) => legacy.mergeIdenticalFontFaces(css, u).applied), 'the merge has work to do');
  assert.ok(USED.some((u) => legacy.prunePlayerFontFaces(css, new Set(u)).applied), 'the prune has work to do');
  assert.ok(same(css));
});

test('all three answer the same on every shipped sheet', () => {
  const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  files.push('node_modules/katex/dist/katex.min.css');
  for (const f of files) assert.ok(same(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});

const PIECES = [
  '@font-face{', '@font-face {', '}', '{', ';', "font-family:'Outfit';", 'font-family:"Inter";', 'font-family:JetBrains Mono;',
  'font-weight:400;', 'font-weight:700;', 'font-weight:bold;', 'font-style:italic;', 'src:url(data:font/woff2;base64,QUJD);',
  'src:url(data:font/woff2;base64,RERE);', 'font-display:swap;', '/* } */', "'}'", '"font-weight:600;"', ' ', '\n',
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
const READS = /font-face|[{};]|font-(?:family|weight|style)/;
const explained = (css) =>
  cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && READS.test(css.slice(t.from, t.to))) ||
  /@font-face\s*\{[^}]*\{/i.test(css);

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(6, 4000), ...corpus(12, 4000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained.slice(0, 5), []);
  assert.ok(agree > 1500, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test("failing arm: a '}' in a family string no longer splits the face, so the prune keeps it whole", () => {
  const css = "@font-face{font-family:'Out}fit';src:url(data:font/woff2;base64,QUJD)}@font-face{font-family:'Inter';src:url(data:font/woff2;base64,RERE)}";
  assert.equal(legacy.prunePlayerFontFaces(css, new Set(['inter'])).css.includes('QUJD'), false);
  assert.deepEqual([...now.fontFaceFamilies(css)], ['out}fit', 'inter']);
  const r = now.prunePlayerFontFaces(css, new Set(['inter']));
  assert.equal(r.css, "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,RERE)}");
});

test('failing arm: a commented-out face is not a face', () => {
  const css = "/* @font-face{font-family:'Ghost';src:url(x.woff2)} */@font-face{font-family:'Inter';src:url(y.woff2)}";
  assert.deepEqual([...legacy.fontFaceFamilies(css)], ['ghost', 'inter']);
  assert.deepEqual([...now.fontFaceFamilies(css)], ['inter']);
});
