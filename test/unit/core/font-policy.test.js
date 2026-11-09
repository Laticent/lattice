const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFontsSetting, mergeFontsSettings, resolveFontPolicy } = require('../../../lib/core/font-policy.js');

test('defaults: text used, emoji exact', () => {
  assert.deepEqual(resolveFontPolicy(), { text: 'used', emoji: 'exact' });
  assert.deepEqual(resolveFontPolicy(''), { text: 'used', emoji: 'exact' });
});

test('a bare word sets text, a -emoji word sets emoji', () => {
  assert.deepEqual(resolveFontPolicy('used exact-emoji'), { text: 'used', emoji: 'exact' });
  assert.deepEqual(resolveFontPolicy('full system-emoji'), { text: 'full', emoji: 'system' });
  assert.deepEqual(resolveFontPolicy('FULL-Emoji'), { text: 'used', emoji: 'full' });
});

test('unknown words are reported and ignored; the last word of a class wins', () => {
  const p = parseFontsSetting('big exact full emoji-used used-emoji');
  assert.deepEqual(p.unknown, ['big', 'emoji-used']);
  assert.equal(p.text, 'full');
  assert.equal(p.emoji, 'used');
});

test('a flag merges over the deck class by class', () => {
  assert.deepEqual(resolveFontPolicy(mergeFontsSettings('exact full-emoji', 'system')), { text: 'system', emoji: 'full' });
});

test('lint: unknown-font-embedding names the bad word and nothing else', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const vocab = buildVocab();
  const deck = (fm) => `---\n${fm}\n---\n\n## A\n\nText.\n`;
  const rules = (fm) => lintText(deck(fm), { vocab }).filter((f) => f.rule === 'unknown-font-embedding' || (f.rule === 'unknown-key' && f.classToken === 'font-embedding'));
  assert.equal(rules('font-embedding: used exact-emoji').length, 0);
  const bad = rules('font-embedding: used big');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].classToken, 'big');
});

test('lint: a leftover `fonts:` line is flagged as renamed, and the fix renames the key', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const { applyAllFixes } = require('../../../lib/authoring/lint-core');
  const vocab = buildVocab();
  const deck = (fm) => `---\ntheme: indaco\n${fm}\n---\n\n## A\n\nText.\n`;
  const found = (fm) => lintText(deck(fm), { vocab }).filter((f) => f.rule === 'fonts-renamed' || (f.rule === 'unknown-key' && f.classToken === 'fonts'));
  const [f] = found('fonts: used exact-emoji');
  assert.equal(found('fonts: used exact-emoji').length, 1, 'one finding, and no unknown-key beside it');
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /`fonts:` was renamed to `font-embedding:`; the deck ignores it until renamed/);
  assert.equal(applyAllFixes(deck('fonts: used exact-emoji'), vocab), deck('font-embedding: used exact-emoji'));
  // With both keys present the new one already decides, so the fix deletes the old line.
  assert.equal(applyAllFixes(deck('fonts: exact\nfont-embedding: full'), vocab), deck('font-embedding: full'));
  // An EMPTY new key decides nothing: the fix must not delete the old words, nor rename into a duplicate key.
  const emptyDeck = deck('fonts: used\nfont-embedding:');
  const [e] = found('fonts: used\nfont-embedding:');
  assert.equal(e.autofixable, false);
  assert.match(e.fix, /Move the words onto the empty `font-embedding:` line/);
  assert.equal(applyAllFixes(emptyDeck, vocab), emptyDeck, 'the deck is left as the author wrote it');
  assert.equal(found('font-embedding: used').length, 0);
  // Exports no longer read the old key.
  const { frontMatterValue } = require('../../../lib/core/front-matter-key');
  assert.equal(frontMatterValue('fonts: exact', 'font-embedding'), null);
});
