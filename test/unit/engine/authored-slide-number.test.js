/**
 * The AUTHORED slide number — `data-authored-slide` on every `<section>`.
 *
 * WHY IT EXISTS. `id="N"` counts RENDERED sections, and one authored slide can render
 * as several: `split: headings` (the DEFAULT) divides a slide carrying two top-level
 * headings, and `lib/core/auto-split.js` divides one that overflows its box. Both shift
 * every number after them.
 *
 * That is fine for an anchor and wrong for anything that means "the author's slide" —
 * reader views, speaker notes, captions. So a page of a divided slide keeps its parent's
 * number: slide 2 becomes 2.1 and 2.2, and slide 3 is still 3, the way a library call
 * number does not move because a volume was bound in two parts.
 *
 * THE BUG THIS CLOSES, measured before the fix: on an ordinary deck with two headings on
 * one slide, a reader on `brief` was shown a slide `brief` excludes, and one of `brief`'s
 * own slides was unreachable in every view. The carrier had reconstructed the mapping
 * from auto-split's markers, which heading-split does not leave — so it could not have
 * worked. The number is now stamped by the splitter that knows, and read, not re-derived.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../../../lib/engine/index.js');
const { isSlideRule, isSyntheticSlideRule, continuationFlags } = require('../../../lib/core/slide-rule.js');

/** [{ id, authored }] for every rendered section, in document order. */
function sections(md) {
	const { html } = engine.render(md);
	return [...html.matchAll(/<section[^>]*>/g)].map((m) => ({
		id: Number((m[0].match(/ id="(\d+)"/) || [])[1]),
		authored: Number((m[0].match(/data-authored-slide="(\d+)"/) || [])[1]),
	}));
}

const FM = '---\nmarp: true\ntheme: indaco\n---\n';

test('with no splitting, authored tracks position exactly', () => {
	const out = sections(`${FM}\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n`);
	assert.deepEqual(
		out.map((s) => s.authored),
		[0, 1, 2],
	);
	assert.deepEqual(
		out.map((s) => s.id),
		[1, 2, 3],
	);
});

test('a heading-split slide keeps ONE authored number, and the slides after it do not move', () => {
	// Slide 1 carries two top-level headings, so it renders as two sections.
	const out = sections(`${FM}\n## H1a\n\nBody a.\n\n## H1b\n\nBody b.\n\n---\n\n## H2\n\nBody 2.\n\n---\n\n## H3\n\nBody 3.\n`);
	assert.equal(out.length, 4, 'the deck really does render four sections from three slides');
	assert.deepEqual(
		out.map((s) => s.authored),
		[0, 0, 1, 2],
		'both pages of slide 1 are authored 0; slides 2 and 3 keep 1 and 2',
	);
	// The rendered counter still advances — the two numbers are different questions and
	// both are answered. An anchor has to be unique; an authored number has to be stable.
	assert.deepEqual(
		out.map((s) => s.id),
		[1, 2, 3, 4],
	);
});

test('several heading-split slides each collapse to their own number', () => {
	const two = '## A\n\na\n\n## B\n\nb\n';
	const out = sections(`${FM}\n${two}\n---\n\n# Plain\n\n---\n\n${two}`);
	assert.deepEqual(
		out.map((s) => s.authored),
		[0, 0, 1, 2, 2],
	);
});

test('a body opening with a separator does not gain a phantom authored slide', () => {
	// The leading separator makes no section, so both arrays shift together — dropping
	// one and not the other is the off-by-one this whole mechanism exists to remove.
	const out = sections(`${FM}\n---\n\n# One\n\n---\n\n# Two\n`);
	assert.deepEqual(
		out.map((s) => s.authored),
		[0, 1],
	);
});

test('the predicates agree with the tokens they read', () => {
	// `isSyntheticSlideRule` is only ever true for a break the ENGINE inserted. An author's
	// own `---` is indistinguishable in every other respect, which is the whole difficulty.
	const authorHr = { type: 'hr', level: 0 };
	const engineHr = { type: 'hr', level: 0, meta: { latticeContinuation: true } };
	const nested = { type: 'hr', level: 1, meta: { latticeContinuation: true } };
	assert.equal(isSlideRule(authorHr), true);
	assert.equal(isSyntheticSlideRule(authorHr), false, 'a typed separator starts a new slide');
	assert.equal(isSyntheticSlideRule(engineHr), true);
	assert.equal(isSyntheticSlideRule(nested), false, 'a nested rule is not a boundary at all');

	// Flags line up 1:1 with the groups, first entry always false.
	assert.deepEqual(continuationFlags([{ type: 'paragraph' }, engineHr, { type: 'paragraph' }, authorHr]), [false, true, false]);
	assert.deepEqual(continuationFlags([]), [false]);
});
