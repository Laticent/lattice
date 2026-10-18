/**
 * The slide-metadata comment rules (engineering/decisions/2026-10-17-meta-record.md §5.3, §5.5,
 * §9 step 1): four errors for a RECORD comment (`<!-- {…} -->`) in a position no step will read,
 * and `legacy-directive-comment`, which coaches the old `<!-- _class: x -->` form and stays off
 * until a host opts in with `metaCut: true`.
 *
 * Each rule gets one deck that fires and one near miss that does not. The corpus has no record
 * comments, so the four record rules must also stay silent on every committed deck; the throwaway
 * corpus sweep that checked it is in the PR body, and a deck of ordinary comments is pinned here.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core.js');

const { findMetaCommentIssues } = core;
const deck = (...slides) => `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;
const META_RULES = new Set(['meta-opener-bare', 'meta-not-own-line', 'meta-in-html-block', 'meta-block-in-container', 'legacy-directive-comment']);
const rules = (src, vocab) => findMetaCommentIssues(src, vocab).map((f) => `${f.slide}:${f.rule}`);
// Through the whole linter too, so the rule is proven wired into `lintTextWith`.
const VOCAB = { names: new Set(['kpi']), modifiers: new Set() };
const linted = (src, extra = {}) => core.lintTextWith(src, { ...VOCAB, ...extra }).filter((f) => META_RULES.has(f.rule)).map((f) => `${f.slide}:${f.rule}`);

test('meta-opener-bare: a bare `<!--` with the record on the next line is not a record', () => {
  const f = findMetaCommentIssues(deck('# One', '<!--\n{layout=kpi}\n-->\n\n# Two'));
  assert.deepEqual(f.map((x) => `${x.slide}:${x.rule}:${x.severity}`), ['2:meta-opener-bare:error']);
  assert.match(f[0].message, /not a record/);
  assert.match(f[0].fix, /<!-- \{…\} -->/);
  assert.deepEqual(linted(deck('# One', '<!--\n{layout=kpi}\n-->\n\n# Two')), ['2:meta-opener-bare']);
});

test('meta-opener-bare near misses: the record on the opener line, and a note that opens with prose', () => {
  assert.deepEqual(rules(deck('<!-- {layout=kpi} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!-- {layout=kpi,\n  footer="Q3"} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!--\nRemember the {Q3} number.\n-->\n\n# One')), []);
});

test('meta-not-own-line: a record in a list item or a blockquote', () => {
  assert.deepEqual(rules(deck('# One\n\n- item\n- <!-- {layout=kpi} -->')), ['1:meta-not-own-line']);
  assert.deepEqual(rules(deck('# One\n\n> <!-- {layout=kpi} -->')), ['1:meta-not-own-line']);
  const [f] = findMetaCommentIssues(deck('# One\n\n> <!-- {layout=kpi} -->'));
  assert.equal(f.severity, 'error');
  assert.equal(f.line, '> <!-- {layout=kpi} -->');
  assert.match(f.fix, /outside the list or quote/);
});

test('meta-not-own-line near misses: the record on its own line after a list, and a record in a fence', () => {
  assert.deepEqual(rules(deck('# One\n\n- item\n\n<!-- {layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n```md\n- <!-- {layout=kpi} -->\n<!--\n{layout=kpi}\n-->\n```')), []);
  assert.deepEqual(rules(deck('# One\n\n~~~\n> <!-- {layout=kpi} -->\n~~~')), []);
});

test('meta-in-html-block: a record directly under an HTML line folds into its html_block', () => {
  const f = findMetaCommentIssues(deck('# One\n\n<img src="a.png">\n<!-- {layout=kpi} -->'));
  assert.deepEqual(f.map((x) => `${x.rule}:${x.severity}`), ['meta-in-html-block:error']);
  assert.match(f[0].fix, /blank line before the record/);
  assert.deepEqual(rules(deck('# One\n\n<div>\n</div>\n<!-- {layout=kpi} -->')), ['1:meta-in-html-block']);
});

test('meta-in-html-block near misses: a blank line between, a comment above, prose above', () => {
  assert.deepEqual(rules(deck('# One\n\n<img src="a.png">\n\n<!-- {layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n<!-- a note -->\n<!-- {layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\nSome text\n<!-- {layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n<img src="a.png">\n<!-- an ordinary note -->')), []);
});

test('meta-block-in-container: a multi-line record with a blank line inside a list or quote', () => {
  const src = deck('# One\n\n- <!-- {layout=kpi}\n  note: |\n\n    second para -->');
  assert.deepEqual(rules(src), ['1:meta-not-own-line', '1:meta-block-in-container']);
  const f = findMetaCommentIssues(src).find((x) => x.rule === 'meta-block-in-container');
  assert.equal(f.severity, 'error');
  assert.match(f.fix, /Remove the blank lines/);
});

test('meta-block-in-container near misses: no blank line inside, and a blank line at top level', () => {
  assert.deepEqual(rules(deck('# One\n\n- <!-- {layout=kpi}\n  footer="Q3" -->')), ['1:meta-not-own-line']);
  assert.deepEqual(rules(deck('<!-- {layout=kpi}\nnote: |\n\n  second para -->\n\n# One')), []);
});

test('legacy-directive-comment is silent by default and fires with metaCut: true', () => {
  const src = deck('<!-- _class: kpi -->\n\n# One', '<!-- footer: Q3 -->\n\n# Two');
  assert.deepEqual(rules(src), []);
  assert.deepEqual(rules(src, { metaCut: false }), []);
  assert.deepEqual(linted(src), []);
  assert.deepEqual(rules(src, { metaCut: true }), ['1:legacy-directive-comment', '2:legacy-directive-comment']);
  assert.deepEqual(linted(src, { metaCut: true }), ['1:legacy-directive-comment', '2:legacy-directive-comment']);
  const [f] = findMetaCommentIssues(src, { metaCut: true });
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /`_class:`/);
  assert.match(f.message, /planned cut/);
  assert.match(f.fix, /becomes a record/);
  assert.equal(f.autofixable, undefined, 'no machine fix before a record is readable (step 2)');
});

test('legacy-directive-comment near misses with metaCut: a speaker note, a marker, a fenced example', () => {
  const src = deck('# One\n\n<!-- Remember the Q3 number. -->\n\n<!-- stress-slide -->\n\n```md\n<!-- _class: kpi -->\n```');
  assert.deepEqual(rules(src, { metaCut: true }), []);
});

test('none of the five fires on a plain deck of ordinary comments', () => {
  const src = deck(
    '# One\n\n<!-- Talk track: open with the number. -->',
    '## Two\n\n- a\n- b\n\n<!--\nA longer note\n\nwith two paragraphs.\n-->',
    '## Three\n\n> A quote\n> <!-- a note in a quote -->\n\n<div>\n</div>\n<!-- after html -->',
  );
  assert.deepEqual(rules(src), []);
  assert.deepEqual(rules(src, { metaCut: true }), []);
  assert.deepEqual(linted(src, { metaCut: true }), []);
});
