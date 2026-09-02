/**
 * WHICH COMMENTS ARE DIRECTIVES — Lente's answer, pinned to the engine's, and both held to markdown-it.
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

const { parseSlideTags, applyTag, stripExtraLensTags, unknownLensTokens } = require('@workwel/lente');

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

/** Both readers of the predicate must answer alike. `findDirectiveComment` (via `parseSlideTags`)
 *  is the one everything reads through; `allDirectiveBodies` is the second, used by Lente's
 *  unknown-id validation — and it was possible to delete its `opensItsLine` call with every test in
 *  the repo still green, which is what an unpinned copy of a rule looks like. */
test('both of Lente’s readers use the predicate — allDirectiveBodies is not a second opinion', () => {
	// Asked through `unknownLensTokens`, its only consumer, so this pins behavior rather than an
	// internal. An empty registry makes every token it finds "unknown", which turns the question
	// "did you see a directive here?" into an observable.
	const reg = { lenses: [] };
	for (const [name, raw] of SHAPES.map(([n, s]) => [n, s.replace(/_class:/g, '_lens:')])) {
		const viaFirst = parseSlideTags(raw).include.size > 0;
		const viaAll = unknownLensTokens(raw, reg).length > 0;
		assert.equal(viaAll, viaFirst, `${name}: allDirectiveBodies disagreed with findDirectiveComment`);
	}
});

test.describe('differential fuzz', () => {
	// Random atom soup over the shapes that broke every hand-rolled attempt: unbalanced backticks,
	// stray and nested fences, container markers, tabs. The oracle is the parser the renderer uses.
	const ATOMS = ['`', '``', '```', '\\`', 'a', ' ', '\n', '\n\n', '<!-- _class: kpi -->', 'text ',
		'```\nfence\n```\n', '- item', '> quote', '\t', '    ', '1. x'];

	test('Lente and markdown-it do not disagree over this corpus', () => {
		// SAY WHAT THE CORPUS COVERS, because an earlier version of this file read its zero as the
		// broader claim "Lente agrees with the renderer" and put that in three docblocks. It covers
		// QUOTING — is this comment inside code, or prose, or a directive. It does NOT vary the indent
		// INSIDE a container marker, and that is where both this predicate and the engine's part
		// company with CommonMark; the shapes are enumerated and asserted below, not left to a corpus
		// that cannot generate them.
		let checked = 0;
		const diverged = [];
		let seed = 20260902;
		const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let i = 0; i < 60000; i++) {
			let src = '';
			for (let k = 0, n = 1 + Math.floor(rand() * 9); k < n; k++) src += ATOMS[Math.floor(rand() * ATOMS.length)];
			if (!src.includes('<!-- _class: kpi -->')) continue;
			checked++;
			if (lenteSees(src) !== markdownItSees(src)) diverged.push(src);
		}
		assert.ok(checked > 2000, `the corpus must actually exercise the question (checked ${checked})`);
		assert.deepEqual(diverged.slice(0, 3), [], `${diverged.length}/${checked} inputs diverged from markdown-it`);
	});
});

/**
 * WHERE THE RULE IS NOT COMMONMARK — recorded, not claimed absent.
 *
 * `COMMENT_OPEN` accepts a container marker followed by ANY run of spaces. CommonMark does not: four
 * columns past the marker is an indented code block, and an ordered marker other than `1.` cannot
 * interrupt a paragraph. `fenceRanges` likewise scans for ``` at the start of a LINE, so a fence
 * opened inside a blockquote is invisible to it. Lente and the engine share every one of these,
 * because the restatement is faithful — but "faithful to the engine" is not "faithful to the
 * renderer", and three docblocks used to say the second. Tracked as #2034.
 *
 * WHY THIS IS SAFE RATHER THAN MERELY KNOWN. Reading one of these as a directive can only ever add
 * membership a reader might not expect. It cannot corrupt an author's file, because every write path
 * is bounded by `ownsItsLine` — a comment sitting behind a container marker is read, and never
 * deleted. That containment is asserted here, next to the gap it contains, rather than trusted.
 */
test.describe('the container shapes where this rule is not CommonMark', () => {
	const SHARED_DIVERGENCES = [
		['a blockquote marker with its own four-space indent', '>     <!-- _class: kpi -->\n', true],
		['a list marker with its own four-space indent', '-     <!-- _class: kpi -->\n', true],
		['an ordered marker other than 1. interrupting a paragraph', 'prose\n2. <!-- _class: kpi -->\n', true],
		['an example inside a BLOCKQUOTED fence', '> ```md\n> <!-- _class: kpi -->\n> ```\n', true],
		['a comment at a list item\u2019s content indent', '- item\n\n    <!-- _class: kpi -->\n', false],
	];

	for (const [name, src, lenteSaysDirective] of SHARED_DIVERGENCES) {
		test(`${name} — Lente and the engine agree, markdown-it does not`, async () => {
			assert.equal(lenteSees(src), lenteSaysDirective);
			assert.equal(await engineSees(src), lenteSaysDirective, 'the engine shares it — this is not Lente drift');
			assert.notEqual(markdownItSees(src), lenteSaysDirective, 'if this passes, #2034 is fixed; move the row up');
		});
	}

	test('and no write path can act on one — every deletion is bounded by ownsItsLine', () => {
		// The property that matters to an author: a container-prefixed directive is READ and never
		// EDITED, so neither of these can splice the next line onto its marker or delete an example.
		for (const [name, raw] of SHARED_DIVERGENCES.map(([n, s]) => [n, s.replace(/_class: kpi/g, '_lens: kpi')])) {
			assert.equal(stripExtraLensTags(`<!-- _lens: brief -->\n\n${raw}`), `<!-- _lens: brief -->\n\n${raw}`, name);
			assert.equal(applyTag(raw, 'kpi', false, 'none').split('\n').length, raw.split('\n').length,
				`${name}: clearing the tag changed the line count`);
		}
	});
});
