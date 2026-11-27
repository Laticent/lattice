'use strict';
// `key-renamed` (lib/authoring/lint-core.js `KEY_RENAMES`): a deck key renamed before 1.0 with no alias is an error, and
// the fix renames it in place. The first row is `paginate:` → `pagination:`
// (engineering/decisions/2026-11-21-plain-english-key-renames.md §D2).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyAllFixes } = require('../../../lib/authoring/lint-core');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');

const vocab = buildVocab();
const deck = (fm) => `---\ntheme: indaco\n${fm}\n---\n\n# A\n\n---\n\n## B.\n`;
const found = (fm) => lintText(deck(fm), { vocab }).filter((f) => f.rule === 'key-renamed');

test('`paginate:` is an error that names `pagination:`, and the fix keeps the value and spacing', () => {
  const [f] = found('paginate: false');
  assert.ok(f, 'expected key-renamed');
  assert.equal(f.severity, 'error');
  assert.equal(f.classToken, 'paginate');
  assert.match(f.message, /`paginate:` is now `pagination:`/);
  assert.equal(applyAllFixes(deck('paginate: false'), vocab), deck('pagination: false'));
  assert.equal(applyAllFixes(deck('paginate : true # numbered'), vocab), deck('pagination : true # numbered'));
});

test('with `pagination:` set too, that line decides and the fix deletes the old one', () => {
  const [f] = found('paginate: false\npagination: true');
  assert.match(f.message, /sets both/);
  assert.equal(applyAllFixes(deck('paginate: false\npagination: true'), vocab), deck('pagination: true'));
});

test('an empty `pagination:` decides nothing, so there is no fix: either edit would lose the old value', () => {
  const [f] = found('paginate: false\npagination:');
  assert.ok(f);
  assert.equal(f.autofixable, false);
  assert.equal(applyAllFixes(deck('paginate: false\npagination:'), vocab), deck('paginate: false\npagination:'));
});

test('a `paginate:` line inside a block scalar is CSS, not the key', () => {
  assert.equal(found('style: |\n  paginate: true').length, 0);
});

test('the new key alone is not reported, and the engine numbers by it', () => {
  assert.equal(found('pagination: false').length, 0);
  assert.equal(lintText(deck('pagination: false'), { vocab }).filter((f) => f.rule === 'unknown-key').length, 0);
});

test('a quoted `guards: "strict"`, or one with a tab before its comment, still becomes `fit: trim`', () => {
  for (const [fm, want] of [['guards: "strict"', 'fit: "trim"'], ["guards: 'strict'", "fit: 'trim'"], ['guards: strict\t# x', 'fit: trim\t# x']]) {
    assert.equal(applyAllFixes(deck(fm), vocab), deck(want), fm);
  }
});

test('`cover:` is an error that names `cover-layout:`, and the fix keeps both words; `cover-layout:` alone is clean', () => {
  const [f] = found('cover: light column');
  assert.ok(f, 'expected key-renamed');
  assert.equal(f.severity, 'error');
  assert.match(f.message, /`cover:` is now `cover-layout:`/);
  assert.equal(applyAllFixes(deck('cover: light column'), vocab), deck('cover-layout: light column'));
  assert.equal(found('cover-layout: light column').length, 0);
  assert.equal(lintText(deck('cover-layout: light column'), { vocab }).filter((x) => /^unknown-/.test(x.rule)).length, 0);
  const unknown = lintText(deck('cover-layout: zzqx'), { vocab }).find((x) => x.rule === 'unknown-cover-layout');
  assert.ok(unknown, 'expected unknown-cover-layout');
  // The message names what ignores the word, as `cover:`'s did: "covers", not "cover-layouts".
  assert.match(unknown.message, /so covers ignore it/);
});
