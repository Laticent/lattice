// A second oracle for the photo skip in lint and review (lib/core/payload-elision.js, narrowed by
// lib/core/image-line-payloads.js). payload-elision-lint-oracle.test.js appends pictures to the END of every example deck;
// this drops them at RANDOM places in the baseline gallery, the deck that holds every component: inside fences,
// comments, lists, tables and front matter, both as text added to an existing line and as a paragraph of its own (the
// shape a paste makes). Either way, lint and review must give exactly the findings they give with skipping switched off.
// Seeded (HARD RULE #32): the seed is in every test name, so a failure reproduces. Counted and compared, never timed.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const elision = require('../../../lib/core/payload-elision.js');
const { mulberry32 } = require('../../helpers/regex-differential');

// The oracle switch, as in payload-elision-lint-oracle.test.js: the kernel's export is wrapped before lint-core and
// review-core load it, so 'off' lints the whole text and 'narrow' is the shipped path.
const realElide = elision.elidePayloads;
let off = false;
let cuts = 0;
elision.elidePayloads = (source, opts) => {
	if (off) return null;
	const out = realElide(source, opts);
	if (out) cuts += out.standIns.length;
	return out;
};
const core = require('../../../lib/authoring/lint-core.js');
const review = require('../../../lib/authoring/review-core.js');
const { buildVocab } = require('../../../lib/authoring/lint.js');

const vocab = buildVocab();
// The gallery less its `$$` math slides: a deck holding `$$` skips nothing by design (lib/core/image-line-payloads.js), so
// with them in, both sides would lint the whole text and the comparison would prove nothing.
const gallery = fs
	.readFileSync(path.join(__dirname, '../../integration/baseline-decks/gallery.md'), 'utf8')
	.split('\n---\n')
	.filter((slide) => !slide.includes('$$'))
	.join('\n---\n');
// A payload long enough to skip, base64 with no newline. Each photo differs, so a restore that swapped two shows.
const photo = (n, fill) => `data:image/png;base64,${'iVBORw0KGgo'.padEnd(n, fill)}`;
const findings = (deck) => ({ lint: JSON.stringify(core.lintTextWith(deck, vocab)), review: JSON.stringify(review.reviewText(deck, {})) });

function compare(deck, label) {
	off = true;
	let whole;
	try {
		whole = findings(deck);
	} finally {
		off = false;
	}
	cuts = 0;
	const skipped = findings(deck);
	assert.equal(skipped.lint, whole.lint, `${label}: lint findings moved`);
	assert.equal(skipped.review, whole.review, `${label}: review findings moved`);
	return cuts;
}

describe('photo skip: the baseline gallery with photos dropped at random keeps every finding', () => {
	// Arm 1: a picture appended INSIDE an existing line (a card's tag, a chart label, a table cell, a code line). The narrow
	// rule leaves most of these whole; whatever it does, the findings must not move.
	const inline = [(p) => ` ![p](${p})`, (p) => ` <img src="${p}">`, (p) => ` url(${p})`, (p) => `![bg](${p})`];
	for (const seed of [1, 2, 3, 4]) {
		test(`inline, seed ${seed}`, () => {
			const rnd = mulberry32(seed);
			const lines = gallery.split('\n');
			for (let k = 0; k < 12; k++) {
				const i = Math.floor(rnd() * lines.length);
				lines[i] += inline[Math.floor(rnd() * inline.length)](photo(4096 + Math.floor(rnd() * 3000), 'QRST'[k % 4]));
			}
			compare(lines.join('\n'), `inline, seed ${seed}`);
		});
	}

	// Arm 2: a photo PARAGRAPH dropped between random lines, inside fences, comments, lists, tables and front matter as
	// well as between blocks. Where the narrow rule calls it a photo on a line of its own it is skipped; the findings
	// must not move either way.
	const blocks = [(p) => `![bg](${p}=)`, (p) => `![bg](${p}==)`, (p) => `<img src="${p}=" alt="x">`, (p) => `<!-- _backgroundImage: url(${p}) -->`, (p) => `![photo](${p} "A title")`, (p) => `[ref]: ${p}`];
	let skippedAny = 0;
	assert.ok(!gallery.includes('$$'), 'the corpus holds no `$$`, so the skip can run');
	for (const seed of [11, 12, 13, 14, 15, 16]) {
		test(`paragraph, seed ${seed}`, () => {
			const rnd = mulberry32(seed);
			const lines = gallery.split('\n');
			for (let k = 0; k < 10; k++) {
				const i = Math.floor(rnd() * lines.length);
				lines.splice(i, 0, '', blocks[Math.floor(rnd() * blocks.length)](photo(4096 + Math.floor(rnd() * 3000), 'QRST'[k % 4])), '');
			}
			skippedAny += compare(lines.join('\n'), `paragraph, seed ${seed}`);
		});
	}
	test('the paragraph arm exercised the skip (else it proves nothing)', () => {
		assert.ok(skippedAny > 0, 'no draw skipped a single payload');
	});
});
