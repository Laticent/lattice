// The six D1 key renames (engineering/decisions/2026-11-21-plain-english-key-renames.md §2 D1): each old key is a
// `key-renamed` error whose fix keeps the value, and each old class is an `unknown-class` error whose fix writes the
// new class. A line with several old classes is fixed in one pass (`replaceAll`), on a slide and in the deck `class:`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyAllFixes } = require('../../../lib/authoring/lint-core');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { render } = require('../../../lib/engine');

const vocab = buildVocab();
const deck = (fm, body = '## B.\n\n- One\n  - body\n- Two\n  - body\n') => `---\ntheme: indaco\n${fm}\n---\n\n# A\n\n---\n\n${body}`;
const KEYS = [['tag', 'card-tag', 'plain band'], ['lift', 'card-lift', 'on'], ['corners', 'slide-corners', 'rounded'],
  ['rule', 'heading-rule', 'short'], ['headline', 'headline-align', 'left'], ['stamp', 'stamp-shape', 'seal']];

test('each old key is a key-renamed error, and the fix renames it and keeps the value', () => {
  for (const [from, to, value] of KEYS) {
    const f = lintText(deck(`${from}: ${value}`), { vocab }).find((x) => x.rule === 'key-renamed');
    assert.ok(f, from);
    assert.equal(f.severity, 'error', from);
    assert.match(f.message, new RegExp(`\`${from}:\` is now \`${to}:\``), from);
    assert.equal(applyAllFixes(deck(`${from}: ${value}`), vocab), deck(`${to}: ${value}`), from);
  }
});

test('the engine reads only the new key', () => {
  const classes = (fm) => render(deck(fm)).html.match(/<section[^>]*class="([^"]*)"/g).join(' ');
  assert.match(classes('card-lift: on'), /\bcard-lift-on\b/);
  assert.doesNotMatch(classes('lift: on'), /\bcard-lift-on\b|\blifted\b/);
  assert.match(classes('headline-align: left'), /\bheadline-align-left\b/);
  assert.doesNotMatch(classes('headline: left'), /headline-align-left|\bhead-left\b/);
});

test('three old classes on one slide are all fixed in one run', () => {
  const src = deck('', '<!-- @meta{layout=cards-grid, class=tag-plain corners-square rule-full} -->\n\n## B.\n\n- One\n  - body\n- Two\n  - body\n');
  const errors = lintText(src, { vocab }).filter((f) => f.rule === 'unknown-class');
  assert.deepEqual(errors.map((f) => f.classToken), ['tag-plain', 'corners-square', 'rule-full']);
  assert.match(applyAllFixes(src, vocab), /class=card-tag-plain slide-corners-square heading-rule-full\}/);
});

test('old classes in the deck-wide class: are errors too, and fixed together', () => {
  const src = deck('class: lifted head-left dark');
  const errors = lintText(src, { vocab }).filter((f) => f.rule === 'unknown-class' && f.slide === 0);
  assert.deepEqual(errors.map((f) => f.classToken), ['lifted', 'head-left']);
  assert.equal(applyAllFixes(src, vocab), deck('class: card-lift-on headline-align-left dark'));
});

test('an old @meta field names its new spelling, and the fix renames every one on the line, never a value', () => {
  const src = deck('', '<!-- @meta{layout=content, headline=left, rule=full, lift=on, footer="rule of thumb"} -->\n\n## B.\n\nText.\n');
  const found = lintText(src, { vocab }).filter((f) => f.rule === 'meta-record');
  assert.deepEqual(found.map((f) => f.message), [
    '`headline` is now `headline-align`; the old field does nothing.',
    '`rule` is now `heading-rule`; the old field does nothing.',
    '`lift` is now `card-lift`; the old field does nothing.',
  ]);
  const fixed = applyAllFixes(src, vocab);
  assert.match(fixed, /@meta\{layout=content, headline-align=left, heading-rule=full, card-lift=on, footer="rule of thumb"\}/);
  assert.equal(lintText(fixed, { vocab }).filter((f) => f.rule === 'meta-record').length, 0);
});
