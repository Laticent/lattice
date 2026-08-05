/**
 * The contract for lib/core/slide-boundaries.mjs — and the reason that module is
 * allowed to exist at all.
 *
 * A hand-written scanner that merely LOOKS like markdown-it's `hr` rule is the
 * defect generator this whole line of work is retiring: three caller-side
 * splitters each derived slide boundaries their own way, all three were wrong in
 * different places, and the disagreements reached humans as a preview painting
 * the wrong slide, an editor off by one, and a chat edit that destroyed a slide
 * and reported success.
 *
 * So the scanner is not tested against a list of expectations somebody typed. It
 * is tested against THE PARSER — `lib/core/boundary-parser.js`, the same
 * markdown-it instance configured the way the engine configures its own, whose
 * top-level `hr` tokens ARE `lib/engine/slides.js splitOnHr`'s boundaries. Every
 * case below asserts agreement with what that parser actually returns; the
 * hand-written numbers are only there to make a failure readable.
 *
 * Three tiers, in increasing order of what they can catch:
 *   1. the divergence matrix — the forms #1271 names, plus the ones measuring
 *      turned up that it did not;
 *   2. a generated corpus — every marker crossed with every block context;
 *   3. every committed deck.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { boundaryParser: md, FRONT_MATTER, normalizeSource } = require('../../../lib/core/boundary-parser.js');
const { slideBoundaries, splitSlideChunks, separatorRanges, normalizeSourceText, MARKDOWN_IT_TAG_SOURCE } = require('../../../lib/core/slide-boundaries.mjs');

const ROOT = path.join(__dirname, '../../..');

/** The engine's own answer: the source lines its top-level `hr` tokens sit on. */
function parserBoundaries(body) {
	return md
		.parse(normalizeSource(body), {})
		.filter((t) => t.type === 'hr' && t.level === 0 && Array.isArray(t.map))
		.map((t) => t.map[0]);
}

/** Assert the scanner agrees with the parser, quoting the deck when it does not. */
function agrees(body, label) {
	const want = parserBoundaries(body);
	const got = slideBoundaries(body);
	assert.deepEqual(
		got.lines,
		want,
		`${label}: scanner said [${got.lines}] where the parser says [${want}]\n--- deck ---\n${body.replace(/\u2028/g, '<U+2028>')}\n---`,
	);
	return got;
}

// ── 1. The divergence matrix ─────────────────────────────────────────────────

test('every thematic-break form the `---` splitters missed is a boundary', () => {
	// #1271 names `***`, `___`, `- - -` and `--- ` + trailing space. Measuring against the
	// real parser turned up two more that reproduce the same silent slide destruction:
	// `----` (four or more hyphens) and a `---` indented one to three spaces.
	const forms = ['---', '***', '___', '- - -', '--- ', '---\t', '----', '* * *', '_ _ _ _', '  ---', '   ***', '-\t-\t-', '--- -'];
	for (const sep of forms) {
		const deck = `# One\n\nalpha\n\n${sep}\n\n# Two\n\nbravo\n`;
		const got = agrees(deck, `separator ${JSON.stringify(sep)}`);
		assert.equal(got.lines.length, 1, `${JSON.stringify(sep)} should be exactly one boundary`);
		assert.equal(got.certain, true, `${JSON.stringify(sep)} should be decidable`);
	}
});

test('a setext underline is a heading, not a boundary — the disagreement of opposite sign', () => {
	// The one place the caller-side splitters split where the ENGINE does not. `Interlude`
	// over `---` is a level-2 heading; the same three characters after a blank line are a
	// break. #1265's adversarial trio found this shape as a wrong page number.
	for (const under of ['---', '----', '--- ', '-']) {
		agrees(`# One\n\nInterlude\n${under}\n\n# Two\n`, `setext underline ${JSON.stringify(under)}`);
		assert.deepEqual(slideBoundaries(`# One\n\nInterlude\n${under}\n\n# Two\n`).lines, [], `${JSON.stringify(under)} under a paragraph is a heading`);
	}
	// `***` and `___` are never underlines, so they terminate the paragraph and DO split.
	for (const sep of ['***', '___']) {
		const got = agrees(`# One\n\nInterlude\n${sep}\n\n# Two\n`, `break ${sep} under a paragraph`);
		assert.equal(got.lines.length, 1);
	}
	// After an ATX heading no paragraph is open, so `----` is a break again.
	assert.deepEqual(agrees('# One\n----\n\n# Two\n', 'break under an ATX heading').lines, [1]);
});

test('U+2028 is not a line terminator, so it holds no boundary', () => {
	// `/^---$/m` breaks on U+2028 and `split('\n')` does not, so the two authoring
	// splitters disagreed about the same bytes. Nothing normalizes U+2028 at the ingest
	// doors, so a pasted deck carries it through. The parser folds `\r\n` and lone `\r`
	// only — U+2028 is an ordinary character to it, and now to the scanner.
	const deck = '# One\n\nthe plan\u2028---\u2028v2 draft\n\n---\n\n# Two\n';
	const got = agrees(deck, 'U+2028 inside a paragraph');
	assert.equal(got.lines.length, 1, 'only the real separator is a boundary');
	// The naive splitter this replaces sees three slides here; the engine renders two.
	assert.equal(deck.replace(FRONT_MATTER, '').split(/^---$/m).length, 3, 'the /^---$/m splitter still miscounts — that is the defect');
});

test('the §7b shapes: front matter, empty chunks, a fence-masked separator', () => {
	// Front matter is stripped BEFORE the scan, by contract — its closing `---` is a
	// thematic break to anything that sees it, and its opening `---` makes the first key
	// a setext heading. This asserts the contract holds rather than assuming it.
	const withFm = '---\ntitle: x\npaginate: true\n---\n\n# One\n\n---\n\n# Two\n';
	const body = withFm.replace(FRONT_MATTER, '');
	agrees(body, 'front matter stripped');
	// Line 3 of the body — `FRONT_MATTER` consumes one trailing newline, so the body opens
	// with the blank line that followed the block.
	assert.deepEqual(slideBoundaries(body).lines, [3]);

	// An empty MIDDLE chunk is a real, rendered, empty slide; only a leading one is
	// dropped. This is `splitOnHr`'s exact grouping.
	agrees('# One\n\n---\n\n---\n\n# Two\n', 'empty middle chunk');
	assert.equal(splitSlideChunks('# One\n\n---\n\n---\n\n# Two\n').chunks.length, 3);
	assert.equal(splitSlideChunks('---\n\n# One\n\n---\n\n# Two\n').chunks.length, 2, 'a leading separator drops its empty chunk');

	// A `---` inside a fence is a rule inside a code sample, not a boundary — routine in
	// decks that document Markdown or carry a mermaid block's own front matter.
	for (const deck of [
		'# One\n\n```\n---\n```\n\n---\n\n# Two\n',
		'# One\n\n~~~md\n---\n~~~\n\n---\n\n# Two\n',
		'# One\n\n````\n```\n---\n```\n````\n\n---\n\n# Two\n',
	]) {
		const got = agrees(deck, 'fence-masked separator');
		assert.equal(got.lines.length, 1, 'only the separator outside the fence counts');
	}
});

test('an unclosed construct is reported as undecided rather than guessed at', () => {
	// The boundary list is still the parser's — what changes is whether a caller may bet a
	// slide on it. A deck mid-keystroke looks exactly like this.
	for (const [deck, what] of [
		['# One\n\n```\n---\n\n# Two\n', 'code fence'],
		['# One\n\n<!-- unterminated\n---\n\n# Two\n', 'HTML block'],
	]) {
		const got = agrees(deck, `unclosed ${what}`);
		assert.equal(got.certain, false, `an unclosed ${what} should read as undecided`);
		assert.match(got.reason, /never closes/);
	}
	// An unclosed `$$` is NOT in that list, and the reason is worth pinning: the math rule
	// declines when its closer never arrives, so the block masks nothing and the deck reads
	// as ordinary Markdown — to the parser and to the scanner alike.
	agrees('# One\n\n$$\nx = 1\n\n---\n\n# Two\n', 'unclosed math block');
	assert.equal(slideBoundaries('# One\n\n$$\nx = 1\n\n---\n\n# Two\n').certain, true);
	// The ordinary deck is decidable — otherwise the flag would mean nothing.
	assert.equal(slideBoundaries('# One\n\n---\n\n# Two\n').certain, true);
});

test('a lazy continuation keeps the underline question inside its container', () => {
	// The subtlest rule in the scanner, and the one the generated corpus alone did not
	// reach. A paragraph continued LAZILY below a list item or a blockquote is still that
	// container's paragraph, and markdown-it's `lheading` only looks for an underline at or
	// above the container's content column — so a `-` run below it terminates the container
	// and IS a break, where the same characters under a top-level paragraph are a heading.
	assert.deepEqual(agrees('- a\nlazy\n----\n', 'list lazy continuation').lines, [2], 'a `-` run below a list item is a break');
	assert.deepEqual(agrees('> A\nB\n---\n', 'blockquote lazy continuation').lines, [2], 'a `-` run below a blockquote is a break');
	// A blank line breaks the laziness: the text then ENDS the list and opens a top-level
	// paragraph, and the same `----` becomes that paragraph's underline.
	assert.deepEqual(agrees('- a\n\nPara\n----\n', 'blank ends the list').lines, [], 'after a blank the run is a heading again');
	// And at or above the item's content column it is the ITEM's underline, below level 0.
	assert.deepEqual(agrees('- a\n\n  Body\n  ---\n', 'underline inside a list item').lines, []);
});

test('the shapes the fuzz found, pinned so they do not depend on a seed', () => {
	// Each of these cost a wrong boundary, and none was on anybody's list. They are kept as
	// named cases rather than left to the generator: a fuzz that has to re-find a known
	// defect is a guard with a lottery in it.

	// `</script>` is a type-7 HTML block — it runs to a BLANK LINE and cannot interrupt a
	// paragraph. Read as a raw-text block that closes itself, every `---` after it became a
	// boundary the engine does not have.
	assert.deepEqual(agrees('# One\n\n</script>\n---\n***\n', 'lone close tag').lines, [], 'a type-7 block swallows to the next blank line');
	assert.deepEqual(agrees('# One\n\n<script>\nx\n</script>\n\n---\n', 'raw-text block').lines, [6], 'a type-1 block closes on its end tag');

	// `table` is the FIRST rule markdown-it tries, ahead of `reference`. Checked later, a
	// `[ref]:` line over a delimiter row was read as a link definition instead of a table.
	assert.deepEqual(agrees('[ref]:\n|---|---|\n---\n# Two\n', 'table beats reference').lines, [2]);

	// A definition's line scan STOPS at a block opener, so `[ref]:` over `___` has no
	// destination at all — the label is a paragraph and both `___` runs are breaks.
	assert.deepEqual(agrees('[ref]:\n___\n___\n', 'reference terminated before its destination').lines, [1, 2]);
	assert.deepEqual(agrees('[ref]:\n/url\n---\n# Two\n', 'reference with a split destination').lines, [2]);
	assert.deepEqual(agrees('[ref]:\n\n/url\n---\n', 'a blank line invalidates the definition').lines, []);

	// Changing the bullet style starts a NEW list at a new content column: `- item` sets 2,
	// `1. ordered` sets 3, and a `  ---` at column 2 then falls BELOW the open list and is a
	// top-level break rather than list content.
	assert.deepEqual(agrees('- list item\n1. ordered\n  ---\n', 'sibling list replaces the content column').lines, [2]);

	// A type-7 block does not terminate a TABLE either — the table's terminator set asks the
	// same "can this interrupt a paragraph?" question — so `<br/>` inside a table body is a
	// row, and opening a block there swallowed the rest of the deck.
	assert.deepEqual(agrees('h1 | h2\n--- | ---\n<br/>\n- - -\n----\n', 'type-7 tag inside a table body').lines, [3, 4]);
});

// ── 2. Every marker crossed with every block context ─────────────────────────

test('generated corpus: the scanner matches the parser on every marker × context', () => {
	const separators = ['---', '***', '___', '- - -', '--- ', '----', '  ---', '-\t-\t-'];
	const befores = [
		['blank', '# Head\n\ntext\n'],
		['open paragraph', '# Head\n\ntext'],
		['atx heading', '# Head\n'],
		['setext heading', 'Head\n===\n'],
		['list item', '- item\n'],
		['list, blank', '- item\n\n'],
		['blockquote', '> quoted\n'],
		['table', '| a | b |\n|---|---|\n| 1 | 2 |\n'],
		['fenced code', '```js\nconst x = 1;\n```\n'],
		['fenced code holding a separator', '```md\n---\n```\n'],
		['math block', '$$\na = b\n=\nc\n$$\n'],
		['html comment', '<!-- _class: text -->\n'],
		['multi-line html comment', '<!-- note:\nspanning\n-->\n'],
		['html block', '<div class="x">\nbody\n</div>\n\n'],
		['indented code', '    code line\n\n'],
		['nested list', '- a\n\n  - b\n\n'],
		['ordered list', '1. one\n'],
		['link reference', '[ref]: /url\n'],
	];
	const afters = [
		['heading', '\n# Next\n'],
		['tight heading', '# Next\n'],
		['paragraph', '\nplain text\n'],
		['eof', '\n'],
		['another separator', '\n---\n\n# Next\n'],
	];
	const indents = ['', ' ', '  ', '   '];

	let checked = 0;
	for (const [bn, before] of befores) {
		for (const sep of separators) {
			for (const ind of indents) {
				for (const [an, after] of afters) {
					const deck = `${before}${ind}${sep}${after}`;
					agrees(deck, `${bn} / ${JSON.stringify(ind + sep)} / ${an}`);
					checked += 1;
				}
			}
		}
	}
	// Guard the guard: a loop that silently generated nothing would pass.
	assert.ok(checked >= 2000, `expected a real corpus, generated ${checked}`);
});

test('generated corpus: a separator buried inside every container that can hide one', () => {
	const containers = [
		['fence', '```\n@\n```\n'],
		['tilde fence', '~~~\n@\n~~~\n'],
		['long fence', '````\n@\n````\n'],
		['math', '$$\n@\n$$\n'],
		['html comment', '<!--\n@\n-->\n'],
		['html block', '<div>\n@\n</div>\n'],
		['script block', '<script>\n@\n</script>\n'],
		['blockquote', '> @\n'],
		['list content', '- item\n\n  @\n'],
		['ordered list content', '1. item\n\n   @\n'],
		['indented code', '    @\n'],
	];
	for (const [name, shell] of containers) {
		for (const sep of ['---', '***', '___', '----']) {
			const deck = `# One\n\n${shell.replace('@', sep)}\n---\n\n# Two\n`;
			const got = agrees(deck, `${sep} inside ${name}`);
			assert.equal(got.lines.length, 1, `${sep} inside ${name} must not add a boundary`);
		}
	}
});

test('seeded fuzz: random decks built from every block atom agree with the parser', () => {
	// The hand-written cases above are the shapes somebody THOUGHT of. This is the tier
	// that found what nobody did: `</script>` is a type-7 HTML block that runs to a blank
	// line, not a raw-text block that closes itself, and reading it the other way exposed
	// every `---` after it as a boundary the engine does not have. Four hand-written tiers
	// missed that; the first fuzz run surfaced it in three separate decks.
	//
	// SEEDED, so a failure is reproducible — a fuzz that cannot be re-run is a bug report
	// with no repro attached. The generator is deliberately dumb: shuffling atoms produces
	// the malformed, half-open, wrongly-nested shapes a real editor holds mid-keystroke,
	// which is exactly where the caller-side splitters used to break.
	let seed = 20260805;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const pick = (a) => a[Math.floor(rnd() * a.length)];
	const ATOMS = [
		'---', '***', '___', '- - -', '--- ', '----', '  ---', '   ***', '-\t-\t-', '--- -', '*  *  *',
		'# Heading', '## Sub', '   ### Indented', 'plain paragraph text', 'another line', '', '', '',
		'Setext', '===', '- list item', '  - nested item', '1. ordered', '   1. nested ord',
		'> quote', '> > deep quote', '| a | b |', '|---|---|', '| 1 | 2 |', 'h1 | h2', '--- | ---',
		'```', '```js', '~~~', '~~~md', '````', '$$', 'x = y', '<!-- _class: text -->', '<!-- note:',
		'-->', '<div>', '</div>', '<span>inline</span>', '<custom-el>', '<script>', '</script>',
		'<pre>', '</pre>', '    indented code', '\ttab code', '[ref]: /url', '[ref]:', '"Title"',
		'<!-- one-liner -->', 'text with --- inside', 'the plan\u2028---\u2028v2', '<br/>', '<hr>', '$$ x $$',
	];

	const failures = [];
	const ROUNDS = 20000;
	for (let n = 0; n < ROUNDS; n++) {
		const body = Array.from({ length: 3 + Math.floor(rnd() * 12) }, () => pick(ATOMS)).join('\n');
		const want = parserBoundaries(body);
		const got = slideBoundaries(body);
		if (JSON.stringify(got.lines) !== JSON.stringify(want)) {
			failures.push(`certain=${got.certain} scanner [${got.lines}] vs parser [${want}]\n${body}\n`);
		}
	}
	assert.deepEqual(failures.slice(0, 3), [], `${failures.length} of ${ROUNDS} fuzzed decks disagree with the parser`);
});

// ── 3. Every committed deck ──────────────────────────────────────────────────

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

test('the scanner matches the parser on every committed deck', () => {
	const decks = corpusDecks();
	assert.ok(decks.length >= 100, `expected the committed corpus, found ${decks.length} decks`);
	const disagreements = [];
	let undecided = 0;
	for (const file of decks) {
		const raw = normalizeSource(fs.readFileSync(file, 'utf8'));
		const body = raw.replace(FRONT_MATTER, '');
		const want = parserBoundaries(body);
		const got = slideBoundaries(body);
		if (!got.certain) undecided += 1;
		if (JSON.stringify(got.lines) !== JSON.stringify(want)) {
			disagreements.push(`${path.relative(ROOT, file)}: scanner [${got.lines}] vs parser [${want}]`);
		}
	}
	assert.deepEqual(disagreements, [], `boundary disagreements across ${decks.length} committed decks`);
	// The undecided count is REPORTED, not asserted at zero: a real deck may legitimately
	// carry a shape the scanner refuses to decide, and the honest failure is a wrong
	// boundary, not a declined one. It is pinned loosely so a change that made the scanner
	// give up on the whole corpus could not pass quietly.
	assert.ok(undecided < decks.length * 0.2, `${undecided} of ${decks.length} decks undecided — the scanner has stopped deciding`);
});

// ── The duplicated block-tag list ────────────────────────────────────────────

test('the embedded HTML block-tag list still matches markdown-it own', async () => {
	// Duplicated rather than imported, because this module takes no imports so it can
	// bundle for the browser. Duplication is only safe when a test reads both sources —
	// the shape `render-ids.js`'s id-family list uses, after a silently stale copy there
	// cost 51 misattributed slides.
	const { default: blocks } = await import('markdown-it/lib/common/html_blocks.mjs');
	const src = fs.readFileSync(path.join(ROOT, 'lib/core/slide-boundaries.mjs'), 'utf8');
	const embedded = /const HTML_BLOCK_NAMES =\n\t'([^']+)'/.exec(src);
	assert.ok(embedded, 'the embedded block-name list should be findable');
	assert.deepEqual(embedded[1].split('|').sort(), [...blocks].sort(), 'the embedded CommonMark block-tag list has drifted from markdown-it own');
});

test('the transcribed open/close-tag pattern is markdown-it own, character for character', async () => {
	// Type 7 is the html-block kind that decides whether a `<`-led line opens a block that runs
	// to the next blank line or is just inline HTML in a paragraph — and the difference decides
	// whether every `---` after it is a slide boundary. A LOOSER transcription of this pattern
	// matched `<svg viewBox="…">…</svg>`, which markdown-it reads as a paragraph, and cost four
	// committed decks their fast path. Close is not good enough here, so it is pinned exactly.
	const { HTML_OPEN_CLOSE_TAG_RE } = await import('markdown-it/lib/common/html_re.mjs');
	assert.equal(MARKDOWN_IT_TAG_SOURCE, HTML_OPEN_CLOSE_TAG_RE.source, 'the transcribed tag pattern has drifted from markdown-it own');
	// And the shape that motivated it: an inline graphic is a paragraph, and the `---` after it
	// is a real boundary the scan is able to decide.
	const svg = '# One\n\n<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>\n\n---\n\n# Two\n';
	const got = agrees(svg, 'inline svg line');
	assert.deepEqual(got.lines, [4]);
	assert.equal(got.certain, true, 'an inline graphic must not make the scan give up');
});

// ── The derived shapes ───────────────────────────────────────────────────────

test('splitSlideChunks reproduces splitOnHr grouping', () => {
	const deck = '# One\n\nalpha\n\n***\n\n# Two\n\nbravo\n';
	const { chunks } = splitSlideChunks(deck);
	assert.equal(chunks.length, 2);
	assert.match(chunks[0], /# One/);
	assert.match(chunks[1], /# Two/);
	assert.ok(!chunks[0].includes('***'), 'the separator belongs to neither neighbor');
});

test('separatorRanges locates the separator line in the source string', () => {
	const deck = '# One\n\n--- \n\n# Two\n';
	const { ranges } = separatorRanges(deck);
	assert.equal(ranges.length, 1);
	assert.equal(deck.slice(ranges[0].index, ranges[0].index + ranges[0].length), '--- \n');
	// Slicing on the range yields the two slides, whitespace and all.
	assert.equal(deck.slice(0, ranges[0].index), '# One\n\n');
	assert.equal(deck.slice(ranges[0].index + ranges[0].length), '\n# Two\n');
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
	assert.equal(normalizeSourceText('a\u2028b'), 'a\u2028b');
	assert.equal(normalizeSourceText(undefined), '');
});
