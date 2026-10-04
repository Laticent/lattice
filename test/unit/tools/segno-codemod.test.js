// tools/segno-codemod.mjs rewrites old inline-code spellings into Segno's notation, and only
// what the old kernels read: the arms that matter are the ones it must leave alone.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

let rewriteSpan;
let rewriteText;
before(async () => {
  ({ rewriteSpan, rewriteText } = await import('../../../tools/segno-codemod.mjs'));
});

describe('segno-codemod: pills and sparks', () => {
  test('rewrites the old spellings', () => {
    assert.equal(rewriteSpan('{BETA}:tag:c4'), '{BETA, tag, c4}');
    assert.equal(rewriteSpan('{1}:circle:c5:lg'), '{1, circle, c5, lg}');
    assert.equal(rewriteSpan('~{12 14 17}:bar:lg'), '~{12 14 17, bar, lg}');
    assert.equal(rewriteSpan('~{72/80}:bullet'), '~{72/80, bullet}');
  });
  test('keeps an escape, and a broken example keeps teaching its error', () => {
    assert.equal(rewriteSpan('\\{LIVE}:tag'), '\\{LIVE, tag}');
    assert.equal(rewriteSpan('{X}:c13'), '{X, c13}');
    assert.equal(rewriteSpan('~{3 5 4}:bar:end'), '~{3 5 4, bar, end}');
  });
  test('leaves alone what was never a pill or a spark', () => {
    for (const code of ['{LIVE}', '~{1 2 3}', '{ ok, scene }', '{a}:hover', '~{x}:foo', ':root', 'a:b:c', '[x]']) {
      assert.equal(rewriteSpan(code), null, code);
    }
  });
  test('reports instead of guessing: a comma in spark data would change meaning', () => {
    assert.deepEqual(Object.keys(rewriteSpan('~{1,200 1,450}:bar')), ['unsafe']);
  });
  test('rewrites quoted spans inside a double-backtick span', () => {
    assert.equal(rewriteSpan('`{DRAFT}:c2`'), '`{DRAFT, c2}`');
    assert.equal(rewriteSpan('1. cards-grid `{STABLE}:c2`'), '1. cards-grid `{STABLE, c2}`');
  });
  test('--only limits the rewriters', () => {
    assert.equal(rewriteSpan('{BETA}:tag', ['spark']), null);
    assert.equal(rewriteSpan('~{1 2}:bar', ['pill']), null);
  });
});

describe('segno-codemod: files', () => {
  test('rewrites prose and markdown fences, never other fences', () => {
    const src = [
      'A `{BETA}:tag` pill.',
      '```markdown',
      '- Row `~{1 2}:bar`',
      '```',
      '```js',
      'const s = `{BETA}:tag`;',
      '```',
    ].join('\n');
    const r = rewriteText(src);
    assert.equal(r.text, [
      'A `{BETA, tag}` pill.',
      '```markdown',
      '- Row `~{1 2, bar}`',
      '```',
      '```js',
      'const s = `{BETA}:tag`;',
      '```',
    ].join('\n'));
    assert.equal(r.changes.length, 2);
  });
});
