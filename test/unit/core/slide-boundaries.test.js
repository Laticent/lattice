/**
 * The contract for lib/core/slide-boundaries.mjs.
 *
 * THIS TEST CHANGED ITS ORACLE, and the reason is the most useful thing in the
 * file. The module used to be a hand-written line scanner, and this suite
 * proved it correct by comparing it against `lib/core/boundary-parser.js` — a
 * real differential, and the right shape for a hand-written rule set.
 *
 * The module now IS that parser. Comparing the two would be comparing a
 * function to itself: green by construction, worth nothing. So the oracle moved
 * one level out, to the thing a user actually experiences — **the number of
 * `<section>` elements the engine renders**. That is a genuinely independent
 * check: it runs the whole engine, including the `split: headings` ruler and
 * every plugin, and it is what the rail, the page number and the chat edit path
 * are ultimately claiming to agree with.
 *
 * The divergence matrix is kept, now asserting the ENGINE's behavior rather than
 * a scanner's imitation of it — those cases are the regression record for
 * #1271, and each one is a shape that reached a human.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { boundaryParser: md, FRONT_MATTER, normalizeSource } = require('../../../lib/core/boundary-parser.js');
const { slideBoundaries, splitSlideChunks, separatorRanges, normalizeSourceText, dropLeadingEmpty } = require('../../../lib/core/slide-boundaries.mjs');
const engine = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '../../..');

/** How many slides the ENGINE actually renders for `deck` — the independent oracle. */
function renderedSections(deck) {
	return (engine.render(deck, 'indaco').html.match(/<section[\s\S]*?<\/section>/g) || []).length;
}

/**
 * Assert the chunk split agrees with the engine's rendered section count.
 *
 * `split: rule` is set on every fixture that does not deliberately test heading
 * splitting: heading splits divide one authored slide into several SECTIONS, a
 * different mechanism from a separator, and mixing the two would make a failure
 * unreadable. `positionIsTrustworthy` refuses on that mechanism separately.
 */
function agreesWithRender(body, label, { split = 'rule' } = {}) {
	const deck = `---\ntheme: indaco\nsplit: ${split}\n---\n\n${body}`;
	const chunks = splitSlideChunks(body).chunks.length;
	const sections = renderedSections(deck);
	assert.equal(chunks, sections, `${label}: split into ${chunks} chunks where the engine renders ${sections} sections\n--- deck ---\n${body}\n---`);
	return chunks;
}

// ── 1. The divergence matrix — every shape that reached a human ──────────────

test('every thematic-break form the `---` splitters missed is a real slide boundary', () => {
	// #1271 names `***`, `___`, `- - -` and `--- ` + trailing space. Measuring against the
	// engine turned up two more that reproduced the same silent slide destruction: `----`
	// (four or more hyphens) and a `---` indented one to three spaces.
	for (const sep of ['---', '***', '___', '- - -', '--- ', '---\t', '----', '* * *', '_ _ _ _', '  ---', '   ***', '-\t-\t-', '--- -']) {
		assert.equal(agreesWithRender(`# One\n\nalpha\n\n${sep}\n\n# Two\n\nbravo\n`, `separator ${JSON.stringify(sep)}`), 2);
	}
});

test('a setext underline is a heading, not a boundary — the disagreement of opposite sign', () => {
	// The one place the caller-side splitters split where the ENGINE does not. `Interlude`
	// over `---` is a level-2 heading; the same three characters after a blank line are a
	// break. #1265's adversarial trio found this shape as a wrong page number.
	for (const under of ['---', '----', '--- ', '-']) {
		assert.equal(agreesWithRender(`# One\n\nInterlude\n${under}\n\nmore\n`, `setext underline ${JSON.stringify(under)}`), 1);
	}
	// `***` and `___` are never underlines, so they terminate the paragraph and DO split.
	for (const sep of ['***', '___']) assert.equal(agreesWithRender(`# One\n\nInterlude\n${sep}\n\n# Two\n`, `break ${sep}`), 2);
	// After an ATX heading no paragraph is open, so `----` is a break again.
	assert.equal(agreesWithRender('# One\n----\n\n# Two\n', 'break under an ATX heading'), 2);
});

test('U+2028 is not a line terminator, so it holds no boundary', () => {
	// `/^---$/m` breaks on U+2028 and `split('\n')` does not, so the two authoring splitters
	// disagreed about the same bytes. Nothing normalizes U+2028 at the ingest doors, so a
	// pasted deck carries it through; markdown-it treats it as an ordinary character.
	const body = '# One\n\nthe plan --- v2 draft\n\n---\n\n# Two\n';
	assert.equal(agreesWithRender(body, 'U+2028 inside a paragraph'), 2);
	// The naive splitter this replaced sees three slides here; the engine renders two.
	assert.equal(body.split(/^---$/m).length, 3, 'the /^---$/m splitter still miscounts — that is the defect');
});

test('the §7b shapes: front matter, empty chunks, a fence-masked separator', () => {
	// Front matter is stripped BEFORE the derivation, by contract — its closing `---` is a
	// thematic break to any parser that sees it, and its opening `---` makes the first key a
	// setext heading.
	const withFm = '---\ntitle: x\npaginate: true\n---\n\n# One\n\n---\n\n# Two\n';
	assert.deepEqual(slideBoundaries(withFm.replace(FRONT_MATTER, '')).lines, [3]);

	// An empty MIDDLE chunk is a real, rendered, empty slide; a body-LEADING one is dropped,
	// exactly as `splitOnHr` drops its leading empty group.
	assert.equal(agreesWithRender('# One\n\n---\n\n---\n\n# Two\n', 'empty middle chunk'), 3);
	assert.equal(agreesWithRender('---\n\n# One\n\n---\n\n# Two\n', 'body opens with a separator'), 2);

	// A `---` inside a fence is a rule inside a code sample, not a boundary.
	for (const body of [
		'# One\n\n```\n---\n```\n\n---\n\n# Two\n',
		'# One\n\n~~~md\n---\n~~~\n\n---\n\n# Two\n',
		'# One\n\n````\n```\n---\n```\n````\n\n---\n\n# Two\n',
	]) {
		assert.equal(agreesWithRender(body, 'fence-masked separator'), 2);
	}
});

// ── 2. The shapes the hand-written scanner got wrong ─────────────────────────

test('the six shapes the scanner answered confidently and wrongly', () => {
	// THE REASON THIS MODULE CALLS A PARSER. Each of these was `certain: true` and wrong in
	// the hand-written line scanner that shipped first; the first destroyed a slide under a
	// green "Applied" tick, which is the exact defect #1271 exists to end. They are pinned
	// individually so the regression record survives even though the design that produced
	// them is gone — if anyone ever reaches for a scanner again, these are the bill.
	const cases = [
		['empty list item cannot interrupt a paragraph', '# One\n\n- Revenue up 12%\n- \n\n  ---\n\n# Two\n', 2],
		['ordered list not starting at 1 cannot interrupt', 'Next steps:\n2. second\n---\n\nmore\n', 1],
		['ordered list with `)` not starting at 1', 'Next steps:\n3) third\n---\n\nmore\n', 1],
		['table delimiter row with a column-count mismatch', '| Metric | Value |\n|---|---|---|\n| Revenue | 12 |\n---\n\nmore\n', 1],
		['empty link-reference label is not a definition', '[]: /url\n---\n\nmore\n', 1],
		['tab straight after a list marker', '-\tfoo\n\n    ---\n\nmore\n', 1],
	];
	for (const [label, body, want] of cases) assert.equal(agreesWithRender(body, label), want, label);

	// And the controls: the same shapes WITH the interrupting form are real boundaries.
	assert.equal(agreesWithRender('Next steps:\n1. first\n---\n\nmore\n', 'ordered list starting at 1 DOES interrupt'), 2);
	assert.equal(agreesWithRender('| M | V |\n|---|---|\n| a | b |\n---\n\nmore\n', 'a well-formed table ends before the break'), 2);
	// A VALID reference definition still renders ONE section, and the reason is worth
	// pinning: `splitOnHr` drops its first group when that group holds no TOKENS, and a
	// reference definition is real source text that produces none. "Produces no tokens" and
	// "is blank" are different questions — a `chunk.trim() === ''` test answers the second and
	// gets this wrong, which is why the leading-group rule is read off the token stream.
	assert.equal(agreesWithRender('[a]: /url\n---\n\nmore\n', 'a valid reference definition'), 1);
	assert.equal(agreesWithRender('# One\n\n[a]: /url\n\n---\n\nmore\n', 'a reference definition mid-deck still splits'), 2);
});

test('a deck caught mid-keystroke has boundaries, not doubt', () => {
	// The scanner reported `certain: false` on an unclosed fence or HTML block, and two
	// callers refused outright. A parse has no undecided answer — an unclosed construct
	// parses here exactly as the engine parses it, so the boundaries are simply right.
	assert.equal(agreesWithRender('# One\n\n```\n---\n\n# Two\n', 'unclosed code fence'), 1);
	assert.equal(agreesWithRender('# One\n\n<!-- unterminated\n---\n\n# Two\n', 'unclosed HTML block'), 1);
	assert.equal(agreesWithRender('# One\n\n$$\nx = 1\n\n---\n\n# Two\n', 'unclosed math block'), 2);
});

// ── 3. Every committed deck, against the real render ─────────────────────────

/** Every committed deck — recursively, because a flat read once measured 111 of 125. */
function corpusDecks() {
	const walk = (dir) =>
		fs.existsSync(dir)
			? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
			: [];
	return [...walk(path.join(ROOT, 'examples')), ...walk(path.join(ROOT, 'test/integration/baseline-decks')), ...walk(path.join(ROOT, 'lib/components'))].filter(
		(f) => f.endsWith('.md'),
	);
}

test('the derivation is markdown-it own top-level `hr` set, over every committed deck', () => {
	// `md.block.parse` (what the module runs) against a FULL `md.parse` (what every other
	// boundary consumer in the tree runs). They must not differ: a slide boundary is a
	// block-level property, and inline parsing cannot move one. This is the assertion that
	// licenses using the cheaper call.
	const decks = corpusDecks();
	assert.ok(decks.length >= 100, `expected the committed corpus, found ${decks.length} decks`);
	const mismatched = [];
	for (const file of decks) {
		const body = normalizeSource(fs.readFileSync(file, 'utf8')).replace(FRONT_MATTER, '');
		const full = md
			.parse(body, {})
			.filter((t) => t.type === 'hr' && t.level === 0 && Array.isArray(t.map))
			.map((t) => t.map[0]);
		if (JSON.stringify(slideBoundaries(body).lines) !== JSON.stringify(full)) mismatched.push(path.relative(ROOT, file));
	}
	assert.deepEqual(mismatched, [], 'block-parse and full-parse boundary sets diverged');
});

test('seeded fuzz: block-parse and full-parse agree on every generated deck', () => {
	// WHAT A FUZZ IS STILL FOR once the derivation is the parser itself. It cannot check the
	// rules — there are none to check — but it CAN check the one shortcut this module takes:
	// that `md.block.parse` and a full `md.parse` never name different boundaries. That is the
	// assertion licensing the cheaper call, and it is not circular.
	//
	// MULBERRY32, NOT AN LCG. The previous fuzz used
	// `seed = (seed * 1103515245 + 12345) & 0x7fffffff` — which overflows
	// Number.MAX_SAFE_INTEGER, silently rounds its low bits away and collapses to a period of
	// 10,466. Across 12 seeds x 60,000 rounds it drew **3,736 distinct decks**, not 720,000;
	// the headline "zero disagreements" was a statement about 3,736 samples. Found by the
	// independent checker, who then showed that the SAME atom list under a sound PRNG surfaces
	// real defects. A generator that cannot generate is worse than no generator, because it
	// reports confidence.
	let a = 0x9e3779b9;
	const rnd = () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
	// Atoms drawn from CommonMark's RULE SURFACE, not from deck-shaped intuition — including
	// every shape the adversarial trio found the hand-written scanner wrong on.
	const ATOMS = [
		'---', '***', '___', '- - -', '--- ', '----', '  ---', '   ***', '-\t-\t-', '--- -', '*  *  *',
		'# Heading', '## Sub', '   ### Indented', 'plain paragraph text', 'another line', '', '', '',
		'Setext', '===', '- list item', '- ', '* ', '+ ', '1. one', '2. second', '3) third', '10. ten',
		'  - nested', '   1. nested ord', '-\tfoo', '1.\tbar', '> quote', '> > deep',
		'| a | b |', '|---|---|', '|---|---|---|', '| 1 | 2 |', 'h1 | h2', '--- | ---', '|:-:|--:|',
		'```', '```js', '~~~', '~~~md', '````', '$$', '$$ x $$', 'x = y',
		'<!-- _class: text -->', '<!-- note:', '-->', '<div>', '</div>', '<span>inline</span>',
		'<custom-el>', '<script>', '</script>', '<pre>', '</pre>', '<br/>', '<hr>',
		'    indented code', '\ttab code', '[ref]: /url', '[ref]:', '[]: /url', '[a]: <span>hi</span>',
		'"Title"', '<!-- one-liner -->', 'text with --- inside', 'the plan --- v2',
	];
	const failures = [];
	const ROUNDS = 20000;
	const seen = new Set();
	for (let n = 0; n < ROUNDS; n++) {
		const body = Array.from({ length: 3 + Math.floor(rnd() * 12) }, () => pick(ATOMS)).join('\n');
		seen.add(body);
		const full = md
			.parse(body, {})
			.filter((t) => t.type === 'hr' && t.level === 0 && Array.isArray(t.map))
			.map((t) => t.map[0]);
		if (JSON.stringify(slideBoundaries(body).lines) !== JSON.stringify(full)) failures.push(body);
	}
	// GUARD THE GENERATOR ITSELF, so a collapsed PRNG can never again read as confidence.
	assert.ok(seen.size > ROUNDS * 0.9, `the generator drew only ${seen.size} distinct decks from ${ROUNDS} rounds — it has collapsed`);
	assert.deepEqual(failures.slice(0, 3), [], `${failures.length} of ${ROUNDS} decks disagree between block-parse and full-parse`);
});

// ── 4. The derived shapes ────────────────────────────────────────────────────

test('splitSlideChunks reproduces splitOnHr grouping', () => {
	const { chunks } = splitSlideChunks('# One\n\nalpha\n\n***\n\n# Two\n\nbravo\n');
	assert.equal(chunks.length, 2);
	assert.match(chunks[0], /# One/);
	assert.match(chunks[1], /# Two/);
	assert.ok(!chunks[0].includes('***'), 'the separator belongs to neither neighbor');
});

test('dropLeadingEmpty is the one copy of splitOnHr leading-group rule', () => {
	// Exported because TWO index spaces need it — the chunk split and any caller walking
	// LINES. They had a copy each once, the copies disagreed, and an `applyEditChecked`
	// replace on a deck whose body opened with a separator INSERTED instead of replacing.
	assert.deepEqual(dropLeadingEmpty(['', 'a', 'b'], true), ['a', 'b']);
	assert.deepEqual(dropLeadingEmpty(['a', '', 'b'], false), ['a', '', 'b'], 'an empty MIDDLE chunk is a real slide');
	assert.deepEqual(dropLeadingEmpty([''], true), [''], 'a lone chunk is the whole (empty) deck');
	// The flag comes from the TOKEN stream, not from the text — these two agree on the first
	// and disagree on the second, which is the whole reason it is passed rather than re-derived.
	assert.equal(slideBoundaries('\n---\n# A\n').leadingEmpty, true, 'blank text before the break');
	assert.equal(slideBoundaries('[a]: /url\n---\n# A\n').leadingEmpty, true, 'real text that produces no tokens');
	assert.equal(slideBoundaries('# A\n\n---\n# B\n').leadingEmpty, false);
});

test('separatorRanges indexes the RAW string, whatever its line endings', () => {
	// The derivation counts NORMALIZED lines; these offsets index what the caller holds. An
	// earlier cut measured the geometry with `src.split('\n')`, which agrees on CRLF by luck
	// and THREW on a lone `\r` — a crash in the editor's slide locator.
	for (const [name, src] of [
		['LF', '# A\n\n---\n\n# B\n'],
		['CRLF', '# A\r\n\r\n---\r\n\r\n# B\r\n'],
		['lone CR', '# A\r\r---\r\r# B\r'],
		['BOM', '﻿# A\n\n---\n\n# B\n'],
		['no trailing newline', '# A\n\n---'],
		['mixed endings', '# A\r\n\n---\r\n\r# B'],
	]) {
		const { ranges } = separatorRanges(src);
		assert.equal(ranges.length, 1, `${name}: one separator`);
		assert.match(src.slice(ranges[0].index, ranges[0].index + ranges[0].length), /^---(\r\n|\r|\n)?$/, `${name}: the range covers the separator line and its terminator`);
		assert.match(src.slice(0, ranges[0].index).replace(/^﻿/, ''), /^# A(\r\n|\r|\n){2}$/, `${name}: the slice above the range is slide one`);
	}
});

test('separatorRanges offsets into the full document when the body was stripped', () => {
	const full = '---\ntitle: x\n---\n\n# One\n\n***\n\n# Two\n';
	const fm = FRONT_MATTER.exec(full)[0];
	const { ranges } = separatorRanges(full.slice(fm.length), fm.length);
	assert.equal(ranges.length, 1);
	assert.equal(full.slice(ranges[0].index, ranges[0].index + ranges[0].length), '***\n');
});

test('normalizeSourceText matches the engine door, and leaves U+2028 alone', () => {
	assert.equal(normalizeSourceText('﻿a\r\nb\rc\n'), 'a\nb\nc\n');
	assert.equal(normalizeSourceText('a b'), 'a b');
	assert.equal(normalizeSourceText(undefined), '');
});

test('the parse is memoized per source, so a keystroke pays for one', () => {
	// `lint.ts` reaches a derivation several times per keystroke over the same string.
	const body = '# One\n\n---\n\n# Two\n';
	const a = slideBoundaries(body);
	const b = slideBoundaries(body);
	assert.equal(a, b, 'the same source returns the identical object');
	const c = slideBoundaries('# Other\n\n---\n\n# Deck\n');
	assert.notEqual(a, c);
	// Single-entry: going back re-parses rather than growing without bound.
	assert.notEqual(slideBoundaries(body), a, 'the memo holds one entry, not a growing map');
});

test('degenerate input does not throw', () => {
	for (const bad of [undefined, null, '', 0, {}, []]) {
		assert.deepEqual(slideBoundaries(bad).lines, []);
		assert.equal(splitSlideChunks(bad).chunks.length, 1);
		assert.deepEqual(separatorRanges(bad).ranges, []);
	}
});
