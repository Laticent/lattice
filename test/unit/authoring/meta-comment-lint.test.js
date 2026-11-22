/**
 * The slide-metadata comment rules (engineering/decisions/2026-10-17-meta-record.md §5.3, §5.5,
 * §9 step 1): four errors for a RECORD comment (`<!-- @meta{…} -->`) in a position no step will read,
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
const META_RULES = new Set(['meta-opener-bare', 'meta-not-own-line', 'meta-in-html-block', 'meta-block-in-container', 'legacy-directive-comment', 'meta-bare-record']);
const rules = (src, vocab) => findMetaCommentIssues(src, vocab).map((f) => `${f.slide}:${f.rule}`);
// Through the whole linter too, so the rule is proven wired into `lintTextWith`.
const VOCAB = { names: new Set(['kpi']), modifiers: new Set() };
const linted = (src, extra = {}) => core.lintTextWith(src, { ...VOCAB, ...extra }).filter((f) => META_RULES.has(f.rule)).map((f) => `${f.slide}:${f.rule}`);

test('meta-opener-bare: a bare `<!--` with the record on the next line is not a record', () => {
  const f = findMetaCommentIssues(deck('# One', '<!--\n{layout=kpi}\n-->\n\n# Two'));
  assert.deepEqual(f.map((x) => `${x.slide}:${x.rule}:${x.severity}`), ['2:meta-opener-bare:error']);
  assert.match(f[0].message, /not a record/);
  assert.match(f[0].fix, /<!-- @meta\{…\} -->/);
  assert.deepEqual(linted(deck('# One', '<!--\n{layout=kpi}\n-->\n\n# Two')), ['2:meta-opener-bare']);
});

test('meta-opener-bare near misses: the record on the opener line, and a note that opens with prose', () => {
  assert.deepEqual(rules(deck('<!-- @meta{layout=kpi} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!-- @meta{layout=kpi,\n  footer="Q3"} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!--\nRemember the {Q3} number.\n-->\n\n# One')), []);
});

test('meta-not-own-line: a record in a list item or a blockquote', () => {
  assert.deepEqual(rules(deck('# One\n\n- item\n- <!-- @meta{layout=kpi} -->')), ['1:meta-not-own-line']);
  assert.deepEqual(rules(deck('# One\n\n> <!-- @meta{layout=kpi} -->')), ['1:meta-not-own-line']);
  const [f] = findMetaCommentIssues(deck('# One\n\n> <!-- @meta{layout=kpi} -->'));
  assert.equal(f.severity, 'error');
  assert.equal(f.line, '> <!-- @meta{layout=kpi} -->');
  assert.match(f.fix, /outside the list or quote/);
});

test('a record is never machine-fixed as if it were a one-line directive comment', () => {
  // `--fix` used to delete the whole record line for its `paginate` field, and the layout with it.
  const src = deck('<!-- @meta{layout=kpi, paginate=true} -->\n\n# One');
  const f = core.lintTextWith(src, VOCAB).filter((x) => x.rule === 'paginate-comment-retired');
  assert.equal(f.length, 1);
  assert.equal(f[0].autofixable, undefined);
  assert.match(f[0].message, /record's `paginate` field/);
  assert.match(f[0].fix, /record/);
  // The record (the target form) is not "the old directive comment".
  assert.deepEqual(rules(deck('<!-- @meta{layout=kpi, footer="Q3"} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!-- _class: kpi -->\n\n# One')), ['1:legacy-directive-comment']);
});

test('a record in an HTML block inside a list item is reported once', () => {
  assert.deepEqual(rules(deck('# One\n\n- point\n  <div>\n  <!-- @meta{layout=kpi} -->')), ['1:meta-not-own-line']);
});

test('meta-not-own-line: a record indented under a list item, with no marker on its own line', () => {
  // The engine reads it as part of the list item (an inert internal comment): the lint is the only word the author gets.
  assert.deepEqual(rules(deck('# One\n\n- point\n  <!-- @meta{layout=kpi} -->\n- more')), ['1:meta-not-own-line']);
  assert.deepEqual(rules(deck('# One\n\n1. point\n\n   <!-- @meta{layout=kpi} -->')), ['1:meta-not-own-line']);
});

test('meta-not-own-line near misses: the record on its own line after a list, and a record in a fence', () => {
  assert.deepEqual(rules(deck('# One\n\n- item\n\n<!-- @meta{layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n```md\n- <!-- @meta{layout=kpi} -->\n<!--\n{layout=kpi}\n-->\n```')), []);
  assert.deepEqual(rules(deck('# One\n\n~~~\n> <!-- @meta{layout=kpi} -->\n~~~')), []);
});

test('meta-in-html-block: a record directly under an HTML line folds into its html_block', () => {
  const f = findMetaCommentIssues(deck('# One\n\n<img src="a.png">\n<!-- @meta{layout=kpi} -->'));
  assert.deepEqual(f.map((x) => `${x.rule}:${x.severity}`), ['meta-in-html-block:error']);
  assert.match(f[0].fix, /blank line before the record/);
  assert.deepEqual(rules(deck('# One\n\n<div>\n</div>\n<!-- @meta{layout=kpi} -->')), ['1:meta-in-html-block']);
});

test('meta-in-html-block near misses: a blank line between, a comment above, prose above', () => {
  assert.deepEqual(rules(deck('# One\n\n<img src="a.png">\n\n<!-- @meta{layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n<!-- a note -->\n<!-- @meta{layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\nSome text\n<!-- @meta{layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('# One\n\n<img src="a.png">\n<!-- an ordinary note -->')), []);
});

test('meta-block-in-container: a multi-line record with a blank line inside a list or quote', () => {
  const src = deck('# One\n\n- <!-- @meta{layout=kpi}\n  footer: |\n\n    second para -->');
  assert.deepEqual(rules(src), ['1:meta-not-own-line', '1:meta-block-in-container']);
  const f = findMetaCommentIssues(src).find((x) => x.rule === 'meta-block-in-container');
  assert.equal(f.severity, 'error');
  assert.match(f.fix, /Remove the blank lines/);
});

test('meta-block-in-container near misses: no blank line inside, and a blank line at top level', () => {
  assert.deepEqual(rules(deck('# One\n\n- <!-- @meta{layout=kpi}\n  footer="Q3" -->')), ['1:meta-not-own-line']);
  assert.deepEqual(rules(deck('<!-- @meta{layout=kpi}\nfooter: |\n\n  second para -->\n\n# One')), []);
});

test('legacy-directive-comment fires on every deck, as a warning, with the whole-deck migration as its fix', () => {
  const src = deck('<!-- _class: kpi -->\n\n# One', '<!-- footer: Q3 -->\n\n# Two');
  assert.deepEqual(rules(src), ['1:legacy-directive-comment', '2:legacy-directive-comment']);
  assert.deepEqual(linted(src), ['1:legacy-directive-comment', '2:legacy-directive-comment']);
  const [f] = findMetaCommentIssues(src, VOCAB);
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /`_class:`/);
  assert.match(f.message, /@meta/);
  assert.match(f.fix, /lattice migrate meta/);
  assert.equal(f.autofixable, true);
  assert.equal(f.rewrite, 'migrate-meta');
  const fixed = core.applyFix(src, f);
  assert.equal(fixed, deck('<!-- @meta{layout=kpi} -->\n\n# One', '<!-- @meta{footer=Q3} -->\n\n# Two'));
  assert.deepEqual(linted(fixed), [], 'the fixed deck is clean');
});

test('legacy-directive-comment: the fix writes what `lattice migrate meta` writes, byte for byte', async () => {
  const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
  const src = deck('<!-- _class: kpi dark -->\n<!-- _footer: Q3 -->\n\n# One', '<!-- {headline=left} -->\n\n# Two', '<!-- _class: dark kpi -->\n\n# Three');
  const f = core.lintTextWith(src, VOCAB).find((x) => x.rule === 'legacy-directive-comment');
  assert.equal(core.applyFix(src, f), migrateDeckText(src, VOCAB.names).text);
  assert.equal(await core.applyFixWhenReady(src, f), core.applyFix(src, f));
  // A deck already in record form is no fix: the finding never fires, and a stale finding applies nothing.
  const clean = core.applyFix(src, f);
  assert.equal(core.applyFix(clean, f), null);
});

test('legacy-directive-comment offers no machine fix where the migration keeps the comment as written', () => {
  // Inside a list item or a blockquote (a record there is not read), and a value that runs onto a second line (Marp's
  // several-directives comment). Marked fixable, the first one stopped Fix all for the whole deck (the checker).
  const src = deck('## A\n\n- item\n  <!-- _class: invert -->', '> <!-- _class: invert -->\n\n## B', '<!--\nclass: invert\npaginate: true\n-->\n\n# C', '<!-- _class: kpi -->\n\n# D');
  const f = core.lintTextWith(src, VOCAB).filter((x) => x.rule === 'legacy-directive-comment');
  assert.deepEqual(f.map((x) => [x.slide, Boolean(x.autofixable)]), [[1, false], [2, false], [3, false], [4, true]]);
  assert.match(f[0].fix, /Move it to its own line/);
  assert.match(f[2].fix, /one comment per directive/);
  const fixed = core.fixAllDetailed(src, VOCAB).text;
  assert.match(fixed, /<!-- @meta\{layout=kpi\} -->/, 'the rest of the deck still migrates');
  assert.match(fixed, /- item\n {2}<!-- _class: invert -->/, 'the kept comment is as written');
});

test('legacy-directive-comment near misses: a speaker note, a marker, a fenced example, a record', () => {
  const src = deck('# One\n\n<!-- Remember the Q3 number. -->\n\n<!-- stress-slide -->\n\n```md\n<!-- _class: kpi -->\n```', '<!-- @meta{layout=kpi} -->\n\n# Two');
  assert.deepEqual(rules(src), []);
});

test('meta-bare-record: the bare `<!-- {…} -->` spelling is a warning, and its one-line fix writes `@meta`', () => {
  const src = deck('<!-- {layout=kpi, footer="Q3"} -->\n\n# One', '# Two\n\n- point\n- <!-- {layout=kpi} -->');
  const f = findMetaCommentIssues(src).filter((x) => x.rule === 'meta-bare-record');
  assert.deepEqual(f.map((x) => `${x.slide}:${x.severity}:${x.line}`), ['1:warning:<!-- {layout=kpi, footer="Q3"} -->', '2:warning:- <!-- {layout=kpi} -->']);
  assert.ok(f.every((x) => x.autofixable && !x.rewrite), 'a one-line fix, no whole-deck rewrite');
  assert.match(f[0].fix, /<!-- @meta\{…\} -->/);
  const once = core.applyFix(src, f[0]);
  assert.equal(once, deck('<!-- @meta{layout=kpi, footer="Q3"} -->\n\n# One', '# Two\n\n- point\n- <!-- {layout=kpi} -->'));
  assert.equal(core.fixAllDetailed(src, VOCAB).text, deck('<!-- @meta{layout=kpi, footer="Q3"} -->\n\n# One', '# Two\n\n- point\n- <!-- @meta{layout=kpi} -->'));
  // One finding for a record however many fields it lists, and one for a wrapped record.
  assert.deepEqual(rules(deck('<!-- {layout=kpi,\n  footer="Q3"} -->\n\n# One')), ['1:meta-bare-record']);
});

test('meta-bare-record near misses: `@meta`, a bare opener (no record), a fenced or inline-code example, a note', () => {
  assert.deepEqual(rules(deck('<!-- @meta{layout=kpi} -->\n\n# One')), []);
  assert.deepEqual(rules(deck('<!--\n{layout=kpi}\n-->\n\n# One')), ['1:meta-opener-bare']);
  assert.deepEqual(rules(deck('# One\n\n```md\n<!-- {layout=kpi} -->\n```\n\nWrite `<!-- {x} -->` never.')), []);
  assert.deepEqual(rules(deck('# One\n\n<!-- @note{Pause {here}.} -->')), []);
});

test('the two old-spelling rules share one severity constant, so the cut raises both in one line', () => {
  const fs = require('node:fs');
  const text = fs.readFileSync(require.resolve('../../../lib/authoring/lint-core.js'), 'utf8');
  assert.equal((text.match(/^const LEGACY_META_SEVERITY = '(warning|error)';$/m) || [])[1], 'warning');
  // Every finding of either rule takes its severity from the constant (the legacy rule pushes two shapes: fixable and kept).
  assert.equal((text.match(/severity: LEGACY_META_SEVERITY/g) || []).length, 3);
  assert.doesNotMatch(text, /rule: '(?:legacy-directive-comment|meta-bare-record)', severity: '/);
});

test('none of the six fires on a plain deck of ordinary comments', () => {
  const src = deck(
    '# One\n\n<!-- Talk track: open with the number. -->',
    '## Two\n\n- a\n- b\n\n<!--\nA longer note\n\nwith two paragraphs.\n-->',
    '## Three\n\n> A quote\n> <!-- a note in a quote -->\n\n<div>\n</div>\n<!-- after html -->',
  );
  assert.deepEqual(rules(src), []);
  assert.deepEqual(linted(src), []);
});

// Found by the independent checker on the first cut (PR review round 1).
test('meta-in-html-block: an inline tag with text on its line opens no HTML block', () => {
  assert.deepEqual(rules(deck('# One\n\n<span>Revenue</span> grew\n<!-- @meta{layout=kpi} -->')), []);
  assert.deepEqual(rules(deck('<img src="a.png">\n<!-- @meta{layout=kpi} -->')), ['1:meta-in-html-block']);
  assert.deepEqual(rules(deck('<div>\n<!-- @meta{layout=kpi} -->\n</div>')), ['1:meta-in-html-block']);
});

test('meta-opener-bare: a speaker note whose second line starts with a brace is a note, not a record', () => {
  assert.deepEqual(rules(deck('<!--\n{pause} then reveal the number\n-->\n\n# A')), []);
  assert.deepEqual(rules(deck('<!--\n{layout=kpi}\n-->\n\n# A')), ['1:meta-opener-bare']);
});

test('meta-in-html-block: CommonMark block types 1, 3, 5 fold the record; a lone tag under a paragraph does not', () => {
  for (const above of ['<pre class="x">code', '<script>let a', '<style>a{}', '<?php x', '<![CDATA[']) {
    assert.deepEqual(rules(deck(`${above}\n<!-- @meta{layout=kpi} -->`)), ['1:meta-in-html-block'], above);
  }
  assert.deepEqual(rules(deck('text\n<img src="x">\n<!-- @meta{layout=kpi} -->')), [], 'a type-7 line cannot interrupt a paragraph');
});

test('meta-opener-bare: a wrapped record under a bare opener is still caught', () => {
  assert.deepEqual(rules(deck('<!--\n{\nlayout=content\n} -->\n# A')), ['1:meta-opener-bare']);
});

// Step 3: what the door drops from a record it reads, and two class setters on one slide (the inversion's repro).
test('meta-record names what the door drops; meta-class-overridden names the class a later comment replaces', () => {
  const found = findMetaCommentIssues(deck('<!-- @meta{layout=kpi, bogus=1} -->\n\n# A', '<!-- @meta{layout=kpi\n-->\n\n# B'));
  assert.deepEqual(found.map((f) => [f.slide, f.rule, f.classToken]), [[1, 'meta-record', 'meta-unknown-key'], [2, 'meta-record', 'unterminated-record']]);
  const over = findMetaCommentIssues(deck('<!-- _class: kpi -->\n<!-- @meta{headline=left} -->\n\n# A')).filter((f) => f.rule !== 'legacy-directive-comment');
  assert.deepEqual(over.map((f) => [f.slide, f.rule]), [[1, 'meta-class-overridden']]);
  assert.match(over[0].message, /`kpi` is dropped/);
  // A record sharing its line with text or another comment is not read; the door's diagnostics are not reported for it.
  assert.deepEqual(findMetaCommentIssues(deck('<!-- @meta{layout=kpi, footer=x} --> trailing\n\n# A')).filter((f) => f.rule === 'meta-record'), []);
  // A repeated register field is reported (it would write both words).
  assert.deepEqual(findMetaCommentIssues(deck('<!-- @meta{headline=left, headline=center} -->\n\n# A')).map((f) => f.classToken), ['meta-repeated-key']);
  // One comment carrying every word is the fix, and is clean.
  assert.deepEqual(findMetaCommentIssues(deck('<!-- @meta{layout=kpi, headline=left} -->\n\n# A')), []);
  // A running global `class:` and a spot `_class:` are two scopes, not a collision.
  assert.deepEqual(findMetaCommentIssues(deck('<!-- class: kpi -->\n<!-- _class: kpi dark -->\n\n# A')).map((f) => f.rule), ['legacy-directive-comment', 'legacy-directive-comment']);
});

test('a record holding a marker is still read, and a field set in two records of one slide is named (#3136, the red team)', () => {
  const f = findMetaCommentIssues(deck('<!-- @meta{stress-slide, footr=Q3} -->\n\n# One', '<!-- @meta{footer=Q3} -->\n<!-- @meta{footer=Q4} -->\n\n# Two'));
  assert.deepEqual(f.map((x) => `${x.slide}:${x.rule}:${x.classToken}`), ['1:meta-record:meta-unknown-key', '2:meta-record:meta-repeated-key']);
});
