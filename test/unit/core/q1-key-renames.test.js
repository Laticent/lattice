'use strict';
// Q1 of the plain-English key renames (engineering/decisions/2026-11-21-plain-english-key-renames.md §2 Q1):
// `progress-rail:` is `progress-track:`, and the `tone:` shape `rail` is `stripe`. The tone row renames a VALUE on a
// key that stays, so it reports only the word it renames.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyAllFixes } = require('../../../lib/authoring/lint-core');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { render } = require('../../../lib/engine');

const vocab = buildVocab();
const deck = (fm, body = '## B.\n\nText.\n') => `---\ntheme: indaco\n${fm}\n---\n\n# A\n\n---\n\n${body}`;
const rules = (src) => lintText(src, { vocab }).filter((f) => /key-renamed|unknown-tone|unknown-class/.test(f.rule));

test('progress-rail: is a key-renamed error, and the fix keeps the words', () => {
  const [f] = rules(deck('progress-rail: edge bar'));
  assert.equal(f.rule, 'key-renamed');
  assert.equal(f.severity, 'error');
  assert.equal(applyAllFixes(deck('progress-rail: edge bar'), vocab), deck('progress-track: edge bar'));
});

test('tone: rail is reported once, as a rename, and fixed to stripe; other tone words are untouched', () => {
  const found = rules(deck('tone: rail  # house'));
  assert.deepEqual(found.map((f) => f.rule), ['key-renamed']);
  assert.match(found[0].message, /`tone: rail` is now `tone: stripe`/);
  assert.equal(applyAllFixes(deck('tone: rail  # house'), vocab), deck('tone: stripe  # house'));
  assert.deepEqual(rules(deck('tone: edge')), []);
  assert.deepEqual(rules(deck('tone: stripe')), []);
});

test('an indented tone: rail, which key-renamed does not read, still gets unknown-tone, with the fix to stripe', () => {
  const found = rules(deck('pptx:\n  tone: rail'));
  assert.deepEqual(found.map((f) => f.rule), ['unknown-tone']);
  assert.match(found[0].message, /default `stripe` shape/);
  assert.equal(applyAllFixes(deck('pptx:\n  tone: rail'), vocab), deck('pptx:\n  tone: stripe'));
});

test('the engine reads progress-track: and tone: stripe, and the old classes are errors with a fix', () => {
  const html = render(deck('progress-track: edge\ntone: stripe', '<!-- @meta{class=tone-pass} -->\n\n## B.\n\nText.\n')).html;
  assert.match(html, /\bprogress-track-edge\b/);
  assert.match(html, /\btone-stripe\b/);
  const src = deck('', '<!-- @meta{class=tone-pass tone-rail progress-rail-off} -->\n\n## B.\n\nText.\n');
  assert.deepEqual(rules(src).map((f) => f.classToken), ['tone-rail', 'progress-rail-off']);
  assert.match(applyAllFixes(src, vocab), /class=tone-pass tone-stripe progress-track-off\}/);
});
