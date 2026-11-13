// Lint and review give the same findings with the photo skip on and off (lib/core/payload-elision.js, narrowed by
// lib/core/image-line-payloads.js). A rule that measures or counts text, such as a code line's length, a tag's size or
// a hub's rows, must never see a stand-in. The PR #3153 head-to-head found three that did, when lint used the wide rule
// (every `data:` run where a URL value opens). The oracle is the same deck with skipping switched off: the kernel's
// export is wrapped before lint-core and review-core load it. Counted and compared, never timed (HARD RULE #32).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const elision = require('../../../lib/core/payload-elision.js');

const realElide = elision.elidePayloads;
// 'narrow' is the shipped path (lint and review pass the image-line rule); 'off' is the oracle; 'wide' is the old rule,
// kept here only as the failing arm.
let mode = 'narrow';
// Stand-ins cut, so the corpus test shows skipping took effect rather than assuming it.
let cuts = 0;
elision.elidePayloads = (source, opts) => {
	if (mode === 'off') return null;
	const out = mode === 'wide' ? realElide(source) : realElide(source, opts);
	if (out) cuts += out.standIns.length;
	return out;
};
const core = require('../../../lib/authoring/lint-core.js');
const review = require('../../../lib/authoring/review-core.js');
const { buildVocab } = require('../../../lib/authoring/lint.js');

const vocab = buildVocab();
const LONG = `${'QUJD'.repeat(1500)}iVBO+w0/Zg==`;

const findings = (deck) => ({ lint: JSON.stringify(core.lintTextWith(deck, vocab)), review: JSON.stringify(review.reviewText(deck, {})) });
function inMode(m, fn) {
	mode = m;
	try {
		return fn();
	} finally {
		mode = 'narrow';
	}
}

// The three the head-to-head found, each a rule that measures text holding a payload.
const MEASURED = {
	'code-line-clipped on a fenced photo line': `# A\n\n\`\`\`\n![bg](data:image/png;base64,${LONG})\n\`\`\`\n`,
	'tag-budget on a tag holding an escaped img': `<!-- _class: decision -->\n\n## T\n\n- One &lt;img src=data:image/png;base64,${LONG}&gt;\n  - body\n- Two\n  - body\n`,
	'hub-spoke-crowded on a spoke holding an escaped img': `<!-- _class: hub-spoke -->\n\n## Hub\n\n- Center\n  - Spoke &lt;img src=data:image/png;base64,${LONG}&gt;\n  - Two\n`,
};

// Every form a deck carries a picture in, appended to each example deck. The first two are photos on a line of their
// own, which the narrow rule cuts: one on an image slide, one under a list on a plain slide, where the rules that
// measure a slide's text run. The narrow rule leaves the rest whole.
const FORMS = [
	`<!-- _class: image -->\n\n## Photo\n\n![bg](data:image/png;base64,${LONG})`,
	`## Words\n\n- A point the slide makes\n- Another point\n\n![p](data:image/jpeg;base64,${LONG})`,
	`## Inline\n\nAn inline ![a](data:image/jpeg;base64,${LONG}) in prose.`,
	`## Tag\n\n<img src="data:image/png;base64,${LONG}" alt="x">`,
	`## Styled\n\n<div style="background-image:url('data:image/png;base64,${LONG}')">S</div>`,
	...Object.values(MEASURED),
];

describe('photo skip: lint and review find what the whole text gives', () => {
	for (const [name, deck] of Object.entries(MEASURED)) {
		test(name, () => {
			const off = inMode('off', () => findings(deck));
			assert.deepEqual(inMode('narrow', () => findings(deck)), off);
			// The failing arm: the old wide rule changes this finding, so this case can catch it.
			assert.notDeepEqual(inMode('wide', () => findings(deck)), off, 'the wide rule no longer changes this case; pick one that it does');
		});
	}

	test('every example deck, with a picture in every form', () => {
		const dir = path.join(__dirname, '../../../examples');
		const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
		assert.ok(files.length > 300, 'the corpus is the examples folder');
		const differ = [];
		let skipped = 0;
		for (const f of files) {
			const deck = `${fs.readFileSync(path.join(dir, f), 'utf8')}\n\n---\n\n${FORMS.join('\n\n---\n\n')}\n`;
			const off = inMode('off', () => findings(deck));
			cuts = 0;
			const on = inMode('narrow', () => findings(deck));
			if (on.lint !== off.lint) differ.push(`${f} (lint)`);
			if (on.review !== off.review) differ.push(`${f} (review)`);
			// Lint and review each cut both photos on a line of their own, unless the deck holds `$$`: then nothing is cut.
			if (deck.includes('$$')) assert.equal(cuts, 0, `${f}: a deck holding $$ is read whole`);
			else {
				assert.equal(cuts, 4, `${f}: lint and review each skipped the two photos on a line of their own`);
				skipped++;
			}
		}
		assert.deepEqual(differ, []);
		assert.ok(skipped > 300, 'most decks ran the skip, not only the oracle');
	});

	test('a photo on a line of its own is still skipped, by lint and by review', () => {
		const deck = ['# Photos', ...[1, 2, 3].map((k) => `## Photo ${k}\n\n![bg](data:image/jpeg;base64,${LONG})`)].join('\n\n---\n\n');
		const lintBefore = elision.readStats.lintChars;
		core.lintTextWith(deck, vocab);
		assert.ok(elision.readStats.lintChars - lintBefore < deck.length / 2, 'lint read the photo deck whole');
		const reviewBefore = elision.readStats.reviewChars;
		review.reviewText(deck, {});
		assert.ok(elision.readStats.reviewChars - reviewBefore < deck.length / 2, 'review read the photo deck whole');
	});
});
