/**
 * `![bg …]` keywords that do nothing, and the lift the CLI now shares with the engine
 * (followups.d/2728-p3-lint-bg-without-image-component.md, closed by
 * engineering/decisions/2026-10-16-player-as-library-audit.md §11.6).
 *
 * A plain `![bg](x)` on any slide is that slide's full-bleed background in the CLI and the Studio
 * alike, so the linter stays quiet about it. It warns where a keyword is silently dropped.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { findBgKeywordIssues } = require('../../../lib/authoring/lint-core.js');
const { liftImageBgImages } = require('../../../lib/core/bg-image.js');

const deck = (...slides) => `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;
const rules = (src) => findBgKeywordIssues(src).map((f) => `${f.slide}:${f.rule}`);

test('a side keyword on a slide that is not image warns, with the fix', () => {
	const f = findBgKeywordIssues(deck('# One\n\n![bg left](a.jpg)\n\nText.'));
	assert.equal(f.length, 1);
	assert.equal(f[0].rule, 'bg-side-unread');
	assert.equal(f[0].severity, 'warning');
	assert.match(f[0].fix, /<!-- _class: image -->/);
});

test('a ratio on an image slide warns that it is not read', () => {
	const f = findBgKeywordIssues(deck('<!-- _class: image -->\n\n# One\n\n![bg left:40%](a.jpg)'));
	assert.deepEqual(f.map((x) => x.rule), ['bg-ratio-unread']);
	assert.match(f[0].fix, /!\[bg left\]/);
});

test('silent where nothing is lost: a plain background, an image slide with a side, a running image class, a code sample', () => {
	assert.deepEqual(rules(deck('# One\n\n![bg](a.jpg)')), []);
	assert.deepEqual(rules(deck('<!-- _class: image -->\n\n# One\n\n![bg right](a.jpg)')), []);
	assert.deepEqual(rules(deck('<!-- class: image -->\n\n# One\n\n![bg right](a.jpg)', '# Two\n\n![bg left](b.jpg)')), []);
	assert.deepEqual(rules(deck('# One\n\n```md\n![bg left](a.jpg)\n```')), []);
});

test('a running class that is not image warns on every slide it governs', () => {
	assert.deepEqual(rules(deck('<!-- class: dark -->\n\n# One\n\n![bg left](a.jpg)', '# Two\n\n![bg right](b.jpg)')), ['1:bg-side-unread', '2:bg-side-unread']);
});

test('the lift reads the running class directive, and a slide\'s own _class overrides it', () => {
	const md = '# a\n\n![bg](x.jpg)\n\n---\n\n<!-- class: image -->\n\n![bg](y.jpg)\n\n---\n\n![bg](z.jpg)\n\n---\n\n<!-- _class: content -->\n\n![bg](w.jpg)\n\n---\n\n<!-- class: dark -->\n\n![bg](v.jpg)\n';
	const out = liftImageBgImages(md, 'file:///d/');
	const lifted = [...out.matchAll(/url\('file:\/\/\/d\/(\w)\.jpg'\)/g)].map((m) => m[1]);
	assert.deepEqual(lifted, ['y', 'z'], 'image from the running directive on; its own _class off; a new running class off');
	assert.match(out, /!\[bg\]\(x\.jpg\)/, 'before any image class, the engine draws it as the slide background');
});
