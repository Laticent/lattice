// A photo's base64 is skipped by lint-core and review-core (lib/core/payload-elision.js). Counted, never timed
// (HARD RULE #32): the rules are handed the stand-in, and every finding is the one the whole text gives, so a squiggle,
// a quick fix and "Fix all" land exactly where they did when the rules read the whole payload. The oracle is the same
// deck with skipping switched off: the kernel's export is wrapped before lint-core and review-core load it.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const elision = require('../../../lib/core/payload-elision.js');
const { boundaryParser, FRONT_MATTER } = require('../../../lib/core/boundary-parser.mjs');
const imageLineRanges = (text) => require('../../../lib/core/image-line-payloads.js').imageLineRanges(text, boundaryParser, FRONT_MATTER);

const realElide = elision.elidePayloads;
let skipping = true;
elision.elidePayloads = (...args) => (skipping ? realElide(...args) : null);
const core = require('../../../lib/authoring/lint-core.js');
const review = require('../../../lib/authoring/review-core.js');
const { buildVocab } = require('../../../lib/authoring/lint.js');
const { restoreValue } = require('../../../lib/authoring/elided-findings.js');

const { readStats, MIN_PAYLOAD, payloadRanges } = elision;

function bothWays(fn) {
	skipping = true;
	const on = fn();
	skipping = false;
	try {
		return { on, off: fn() };
	} finally {
		skipping = true;
	}
}

const vocab = buildVocab();
const LONG = `${'QUJD'.repeat(1500)}iVBO+w0/Zg==`;

// Findings on the payload's own lines: a fixable span after the payload (twice on the line), a pill, an unknown class,
// and an unterminated comment whose quoted line is cut at 80 characters inside the payload (the checker's case).
const deck = (p) =>
	[
		'<!-- _class: statement -->',
		'',
		'## Heading',
		'',
		`See ![x](data:image/png;base64,${p}) and \`@pil{3}\` here and \`@pil{3}\``,
		'',
		'---',
		'',
		'<!-- _class: imagee -->',
		'',
		'## Heading',
		'',
		`<img src="data:image/jpeg;base64,${p}"> \`{too long pill text, circle}\``,
		'',
		`![bg](data:image/jpeg;base64,${p})`,
		'',
		'---',
		'',
		'## Notes',
		'',
		`<!-- note about ![x](data:image/png;base64,${p})`,
	].join('\n');

// A deck whose photos are each a line of their own: the shape the rules skip.
const photoDeck = (p) => ['# Photos', ...[1, 2, 3].map((k) => `## Photo ${k}\n\n![bg](data:image/jpeg;base64,${p})`)].join('\n\n---\n\n');

describe('payload elision: lint-core', () => {
	test('every finding is the one the whole text gives', () => {
		const { on, off } = bothWays(() => core.lintTextWith(deck(LONG), vocab));
		const rules = off.map((f) => f.rule);
		for (const r of ['unknown-inline-kind', 'pill-shape-crowded', 'unknown-class', 'unterminated-comment']) assert.ok(rules.includes(r), `${r} in ${rules}`);
		assert.ok(off.some((f) => Number.isInteger(f.col)), 'a finding with a column');
		assert.deepEqual(on, off);
		assert.ok(!JSON.stringify(on).includes('LatticeElided'), 'a stand-in, or part of one, leaked into a finding');
	});

	test('the rules are handed the stand-in for a photo on a line of its own, and the whole text of every other form', () => {
		const before = readStats.lintChars;
		core.lintTextWith(photoDeck(LONG), vocab);
		const read = readStats.lintChars - before;
		assert.ok(read < photoDeck(LONG).length / 3, `the rules read ${read} characters of a ${photoDeck(LONG).length}-character photo deck`);
		// The mixed deck's inline, tag and comment payloads are read whole (a rule may measure that text).
		const mixed = readStats.lintChars;
		core.lintTextWith(deck(LONG), vocab);
		assert.ok(readStats.lintChars - mixed > deck(LONG).length - LONG.length, 'only the one photo line was skipped');
	});

	test('a quick fix on a payload line edits the real line and keeps the photo', () => {
		const src = deck(LONG);
		const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'unknown-inline-kind' && x.autofixable);
		assert.ok(f, 'the fixable finding');
		assert.equal(core.applyFix(src, f), src.replace('`@pil{3}`', '`@pill{3}`'));
	});

	test('"Fix all" over a photo deck gives what the whole text gives, and keeps every payload', async () => {
		await core.loadFixDriver?.();
		const { on, off } = bothWays(() => core.applyAllFixes(deck(LONG), vocab));
		assert.equal(on, off);
		assert.equal(on.split(LONG).length - 1, 4, 'a payload was lost or changed');
		assert.ok(!on.includes('LatticeElided'), 'a stand-in leaked into the text');
	});
});

describe('payload elision: review-core', () => {
	test('same findings as the whole text, and the rules read the stand-in', () => {
		const before = readStats.reviewChars;
		review.reviewText(photoDeck(LONG), {});
		assert.ok(readStats.reviewChars - before < photoDeck(LONG).length / 3);
		const { on, off } = bothWays(() => review.reviewText(deck(LONG), {}));
		assert.deepEqual(on, off);
	});
});

describe('payload elision: what counts as a payload', () => {
	const run = 'QUJD'.repeat(400);
	test('a data: URI payload of 1,024 characters or more, padding included, up to a character that ends a URL', () => {
		for (const [text, end] of [
			[`![x](data:image/png;base64,${run}Zg==)`, ')'],
			[`<img src="data:image/png;base64,${run}">`, '"'],
			[`url('data:image/svg+xml;base64,${run}')`, "'"],
			[`style="url(&quot;data:image/png;base64,${run}=&quot;)"`, '&'],
			[`url(data:image/png;base64,${run}`, ''],
			[`<img src=data:image/png;base64,${run}\nnext`, '\n'],
		]) {
			const [[start, stop]] = payloadRanges(text);
			assert.equal(text.slice(start - 8, start), ';base64,');
			assert.equal(text[stop] ?? '', end, text.slice(0, 30));
		}
	});

	test('not a payload: too short, no media type, no URL value opening before it, `=` before the end, a trailing `/`, or a run that does not end a URL', () => {
		for (const text of [
			`![x](data:image/png;base64,${'A'.repeat(MIN_PAYLOAD - 1)})`,
			`x ;base64,${run}"`,
			`<img data:image/png;base64,${run}/src=https://t.example/x.png>`,
			`<img data:image/png;base64,${run}/src=//intranet/x>`,
			`<image data:image/png;base64,${run}/>`,
			`url(data:image/png;base64,${run}.png)`,
			`url(data:image/png;base64,${run}:x)`,
			`<img alt=x data:a/b;base64,${run}=" src="https://t.example/x.png">`,
			`<img alt=x "data:a/b;base64,${run}/src="https://t.example/x.png">`,
			`foo data:image/png;base64,${run}`,
		]) assert.deepEqual(payloadRanges(text), [], text.slice(0, 40));
	});

	test('the stand-in starts with the payload, so a quote cut short reads the author\'s characters', () => {
		const src = `a\n![x](data:image/png;base64,${run}Zg==)\nb`;
		const cut = elision.elidePayloads(src);
		const [standIn] = cut.standIns;
		assert.ok(standIn.startsWith(run.slice(0, 900)) && standIn.endsWith('LatticeElidedPayload0x'));
		assert.equal(cut.text, `a\n![x](data:image/png;base64,${standIn})\nb`);
		assert.equal(cut.text.split('\n').length, src.split('\n').length, 'lines are kept');
		assert.equal(cut.restoreText(cut.text), src);
		assert.deepEqual(restoreValue({ line: cut.text, nested: [standIn], n: 3 }, cut.restoreText), { line: src, nested: [`${run}Zg==`], n: 3 });
	});

	test('a marker with no payload of its number is left as it is; a deck that holds the marker is read whole', () => {
		const cut = elision.elidePayloads(`![x](data:image/png;base64,${run})`);
		assert.equal(cut.restoreText('<p>LatticeElidedPayload7x</p>'), '<p>LatticeElidedPayload7x</p>');
		assert.equal(elision.elidePayloads(`LatticeElidedPayload0x\n![x](data:image/png;base64,${run})`), null);
		assert.equal(elision.elidePayloads('# A deck\n\nNo pictures.'), null);
	});

	test('the engine skips only a line markdown-it reads as a paragraph of its own: one image, outside a fence', () => {
		const img = `![bg](data:image/png;base64,${run})`;
		const parts = [img, `   ![a b](<data:image/png;base64,${run}>)`, `Text ${img}`, `${img} text`, `\`\`\`md\n${img}\n\`\`\``, `~~~~\n\`\`\`\n\n${img}\n\n~~~~`, `${img}\n${img}`, img];
		const text = parts.join('\n\n');
		const skipped = imageLineRanges(text).map(([s]) => text.slice(0, s).split('\n').length);
		const lineOf = (k) => (k ? parts.slice(0, k).join('\n\n').split('\n').length + 2 : 1); // past the blank line
		assert.deepEqual(skipped, [lineOf(0), lineOf(1), lineOf(7)]);
	});
});
