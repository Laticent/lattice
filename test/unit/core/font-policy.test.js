const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFontsSetting, mergeFontsSettings, resolveFontPolicy, textCodePoints } = require('../../../lib/core/font-policy.js');

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

test('text code points: exact is the shown set, used adds whole script ranges, full is whole, system is nothing', () => {
  assert.deepEqual(textCodePoints('exact', 'ba'), [0x61, 0x62]);
  const used = textCodePoints('used', 'a');
  assert.ok(used.includes(0xe9), 'Latin accents stay editable');
  assert.ok(!used.includes(0x416), 'Cyrillic is not added for a Latin deck');
  assert.ok(textCodePoints('used', 'aЖ').includes(0x416), 'a Cyrillic deck gets the Cyrillic range');
  assert.equal(textCodePoints('full', 'a'), null);
  assert.equal(textCodePoints('system', 'a'), undefined);
});

test('lint: unknown-fonts names the bad word and nothing else', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const vocab = buildVocab();
  const deck = (fm) => `---\n${fm}\n---\n\n## A\n\nText.\n`;
  const rules = (fm) => lintText(deck(fm), { vocab }).filter((f) => f.rule === 'unknown-fonts' || (f.rule === 'unknown-key' && f.classToken === 'fonts'));
  assert.equal(rules('fonts: used exact-emoji').length, 0);
  const bad = rules('fonts: used big');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].classToken, 'big');
});
