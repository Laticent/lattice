'use strict';
// Q5 of the plain-English key renames (engineering/decisions/2026-11-21-plain-english-key-renames.md §2 Q5):
// `mode:` is `drawing:`; `boardroom` is `clean`, `sketch-clean` is `sketch-headings`, `sketch` stays. The per-slide
// classes follow: `sketch-clean-body` is `sketch-headings` (one class, followups.d/3415) and the `boardroom` opt-out
// is `no-sketch` (`clean` is already an `image` / `scene` variant).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyAllFixes } = require('../../../lib/authoring/lint-core');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { render } = require('../../../lib/engine');

const vocab = buildVocab();
const deck = (fm, body = '## B.\n\nText.\n') => `---\ntheme: indaco\n${fm}\n---\n\n# A\n\n---\n\n${body}`;
const rules = (src) => lintText(src, { vocab }).filter((f) => /key-renamed|unknown-drawing|unknown-finish|unknown-class|renamed/.test(f.rule));
const sectionClasses = (html) => [...html.matchAll(/<section\b[^>]*\bclass="([^"]*)"/g)].map((m) => m[1].split(/\s+/));

test('mode: is a key-renamed error, and the fix renames the key and the two old words', () => {
  for (const [from, to] of [['boardroom', 'clean'], ['sketch-clean', 'sketch-headings'], ['sketch', 'sketch']]) {
    const [f, ...rest] = rules(deck(`mode: ${from}`));
    assert.equal(rest.length, 0, from);
    assert.equal(f.rule, 'key-renamed');
    assert.equal(f.severity, 'error');
    assert.equal(applyAllFixes(deck(`mode: ${from}`), vocab), deck(`drawing: ${to}`), from);
  }
  assert.deepEqual(rules(deck('drawing: sketch-headings')), []);
});

test('the engine reads drawing:, stamps one class for sketch-headings, and ignores mode:', () => {
  const classes = (fm) => sectionClasses(render(deck(fm)).html);
  assert.ok(classes('drawing: sketch').every((c) => c.includes('sketch')));
  for (const c of classes('drawing: sketch-headings')) {
    assert.ok(c.includes('sketch-headings') && !c.includes('sketch') && !c.includes('sketch-clean-body'), c.join(' '));
  }
  assert.ok(classes('mode: sketch').every((c) => !c.includes('sketch')));
});

test('no-sketch opts one slide out of a sketch deck', () => {
  const html = render(deck('drawing: sketch', '<!-- @meta{class=no-sketch} -->\n\n## B.\n\nText.\n')).html;
  const [first, second] = sectionClasses(html);
  assert.ok(first.includes('sketch'));
  assert.ok(!second.includes('sketch') && second.includes('no-sketch'));
});

test('the old classes are errors with a fix, and finish: names the drawing words', () => {
  const src = deck('', '<!-- @meta{class=sketch sketch-clean-body} -->\n\n## B.\n\n---\n\n<!-- @meta{class=boardroom} -->\n\n## C.\n');
  assert.deepEqual(rules(src).map((f) => f.classToken).sort(), ['boardroom', 'sketch-clean-body']);
  const fixed = applyAllFixes(src, vocab);
  assert.match(fixed, /class=sketch sketch-headings\}/);
  assert.match(fixed, /class=no-sketch\}/);
  const [f] = rules(deck('finish: sketch-clean'));
  assert.equal(f.rule, 'unknown-finish');
  assert.match(f.fix, /drawing: sketch-headings/);
});
