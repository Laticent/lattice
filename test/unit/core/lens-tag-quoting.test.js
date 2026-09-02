/**
 * WHICH COMMENTS ARE DIRECTIVES — Lente's answer, pinned to the engine's and to markdown-it's.
 *
 * Lente decides a slide's reader-view membership by finding its `<!-- _lens: … -->` comment, and
 * an EXPORT then rewrites that comment to prune views it does not carry. So "is this comment a
 * directive?" stopped being a reading question and became an editing one: get it wrong and the
 * export edits an author's prose. It did, three times, each measured on the real CLI —
 *   · a slide reading ``Write `<!-- _lens: ask -->` at the top`` shipped as "Write `` at the top";
 *   · with the example ABOVE the real tag, the duplicate-sweep and the reader disagreed about
 *     which comment was the tag, so the real tag's withheld token was never pruned — a LEAK;
 *   · a hand-rolled backtick scanner written to fix that disabled itself on one stray backtick.
 *
 * The fix was to stop deriving the answer and adopt the engine's: markdown-it opens an `html_block`
 * for a comment only when it OPENS ITS LINE'S CONTENT, so a mid-sentence or backticked comment is a
 * `code_inline` / `text` child and is prose. `lib/core/class-directive-scan.mjs` reached that after
 * the identical defect (a deck documenting its own syntax overrode its own layout).
 *
 * Lente is a zero-dependency package outside the engine's tree and cannot import that module, so
 * the predicate is RESTATED there and pinned here. This file is that pin. It exists because five
 * correct copies and one wrong one are indistinguishable by reading — the reason
 * `lib/core/slide-rule.js` exists — and because the alternative, a comment saying "these agree",
 * is exactly what was true right up until they didn't.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { parseSlideTags, applyTag, stripExtraLensTags } = require('@workwel/lente');

/** Does LENTE see a directive here? Asked through the public reader, not an internal. */
const lenteSees = (src) => parseSlideTags(src.replace(/_class:/g, '_lens:')).include.size > 0;

/** Does the ENGINE see one? `_class` is the directive its kernel resolves. */
async function engineSees(src) {
	const { slideClassDirectives } = await import('../../../lib/core/class-directive-scan.mjs');
	return slideClassDirectives(src).some((d) => d.payload !== '');
}

/** Does MARKDOWN-IT put the comment in an `html_block` — the condition both of the above encode? */
function markdownItSees(src) {
	const toks = new MarkdownIt('commonmark').enable(['html_block']).parse(src, {});
	return toks.some((t) => t.type === 'html_block' && t.content.includes('_class:'));
}

// Every shape that has ever been argued about, plus the ones the engine's own docblock calls out.
const SHAPES = [
	['a comment on its own line', '<!-- _class: kpi -->\n\ntext\n', true],
	['indented up to three spaces', '   <!-- _class: kpi -->\n\ntext\n', true],
	['inside a blockquote', '> <!-- _class: kpi -->\n', true],
	['inside a list item', '- <!-- _class: kpi -->\n', true],
	['inside an ordered list item', '1. <!-- _class: kpi -->\n', true],
	['nested blockquote', '>> <!-- _class: kpi -->\n', true],
	['mid-sentence, unquoted', 'Prose here <!-- _class: kpi --> and more.\n', false],
	['quoted in inline code', 'Write `<!-- _class: kpi -->` at the top.\n', false],
	['quoted in a fence', '```markdown\n<!-- _class: kpi -->\n```\n', false],
	['tab-indented (an indented code block)', '\t<!-- _class: kpi -->\n', false],
	['four-space indent (an indented code block)', '    <!-- _class: kpi -->\n', false],
];

test.describe('a comment is a directive only when it opens its line — the renderer’s own rule', () => {
	for (const [name, src, expected] of SHAPES) {
		test(`${name} → ${expected ? 'directive' : 'prose'}`, async () => {
			assert.equal(markdownItSees(src), expected, 'markdown-it is the ground truth here');
			assert.equal(await engineSees(src), expected, 'the engine kernel agrees with markdown-it');
			assert.equal(lenteSees(src), expected, 'and Lente agrees with the engine — this is the pin');
		});
	}
});

test('a documented example is never READ as membership, so it is never EDITED as one', () => {
	// The shape that shipped corrupted prose. `applyTag` clearing a view it does not carry must
	// leave a quoted example exactly as the author typed it.
	const src = '<!-- _lens: brief -->\n\nWrite `<!-- _lens: secret -->` at the top of the slide.\n';
	assert.deepEqual([...parseSlideTags(src).include], ['brief'], 'the example is not membership');
	assert.equal(applyTag(src, 'secret', false, 'none'), src, 'and clearing `secret` changes nothing');
	assert.equal(stripExtraLensTags(src), src, 'nor does the duplicate sweep touch it');
});

test('an example ABOVE the real tag does not become the keeper — the leak case', () => {
	// The sweep and the reader must name the SAME comment as the slide's tag. When they disagreed,
	// the real tag was kept but never pruned, so its withheld token reached the artifact.
	const src = 'Write `<!-- _lens: secret -->` here.\n\n<!-- _lens: brief secret -->\n';
	assert.deepEqual([...parseSlideTags(src).include].sort(), ['brief', 'secret'], 'the real tag is read');
	assert.doesNotMatch(applyTag(src, 'secret', false, 'none').split('\n').pop() ?? '', /secret/,
		'so clearing `secret` actually removes it');
});

test('one stray backtick cannot disable the sweep', () => {
	// A scanner that paired backticks across the whole slide swallowed both tags into a phantom
	// code span and silently returned the slide untouched.
	const src = 'Budget is 5` per unit.\n\n<!-- _lens: brief -->\n<!-- _lens: secret -->\n\n`Measured`\n';
	assert.doesNotMatch(stripExtraLensTags(src), /_lens: secret/, 'the duplicate is still removed');
});

test.describe('differential fuzz against markdown-it', () => {
	test('Lente and markdown-it never disagree about whether a comment is a directive', () => {
		// Random atom soup, deliberately including unbalanced backticks, stray fences and container
		// markers — the shapes that broke every hand-rolled attempt. The oracle is the parser the
		// renderer actually uses, so agreement here is agreement with what a reader will see.
		const ATOMS = ['`', '``', '```', '\\`', 'a', ' ', '\n', '\n\n', '<!-- _class: kpi -->', 'text ',
			'```\nfence\n```\n', '- item', '> quote', '\t', '    ', '1. x'];
		let checked = 0;
		const diverged = [];
		let seed = 20260902;
		const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let i = 0; i < 4000; i++) {
			let src = '';
			for (let k = 0, n = 1 + Math.floor(rand() * 9); k < n; k++) src += ATOMS[Math.floor(rand() * ATOMS.length)];
			if (!src.includes('<!-- _class: kpi -->')) continue;
			checked++;
			if (lenteSees(src) !== markdownItSees(src)) diverged.push(src);
		}
		assert.ok(checked > 200, `the corpus must actually exercise the question (checked ${checked})`);
		assert.deepEqual(diverged.slice(0, 3), [], `${diverged.length}/${checked} inputs diverged from markdown-it`);
	});
});
