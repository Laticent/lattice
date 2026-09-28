const test = require('node:test');
const assert = require('node:assert/strict');

const { DELIVERY_NAMES: LINT_NAMES, findUnknownDelivery } = require('../../../lib/authoring/lint-core');

let DELIVERY_NAMES;
let DELIVERY_PRESETS;
let DELIVERY_STYLES;
let deliveryLine;
let frontMatterDelivery;
let resolveDelivery;
test.before(async () => {
	({ DELIVERY_NAMES, DELIVERY_PRESETS, DELIVERY_STYLES, deliveryLine, frontMatterDelivery, resolveDelivery } = await import('../../../lib/core/resolve-delivery.mjs'));
});

// The `delivery:` names live twice, for the ESM/CommonJS reason `pace-names.test.js` gives:
// the register (ESM, read by the docs site) and the linter (CommonJS, HARD RULE #7). This test
// is the seam that keeps a deck the linter accepts from playing as something the Guide lacks.

test('the delivery names agree between the register and the linter', () => {
	assert.deepEqual([...LINT_NAMES].sort(), [...DELIVERY_NAMES].sort());
	assert.deepEqual(Object.keys(DELIVERY_PRESETS).sort(), [...DELIVERY_NAMES].sort(), 'every name has a preset, and no preset lacks a name');
});

test('the presets say what the 2026-09-27 note §4 says', () => {
	const { restrained, expressive, somber } = DELIVERY_PRESETS;
	// Restrained and expressive focus every sentence that names a part; somber gestures once a slide.
	assert.ok(restrained.budget >= 999 && expressive.budget >= 999, 'no moment budget on restrained or expressive');
	assert.equal(somber.budget, 1, 'somber gestures once a slide');
	assert.ok(Number.isFinite(restrained.budget), 'finite: the exported player carries the look as JSON');
	assert.equal(somber.ink, 'none', 'somber shows no cursor and draws no ink');
	assert.equal(restrained.ink, 'none', 'restrained focuses the element and draws no overlay');
	assert.equal(expressive.ink, 'all', 'expressive inks every act (owner, 2026-09-27)');
	assert.equal(expressive.strength, 'notable');
});

test('each delivery is its own style file, and the table only gathers them', () => {
	for (const name of DELIVERY_NAMES) {
		assert.equal(DELIVERY_PRESETS[name], DELIVERY_STYLES[name].look, `${name}: the preset IS its style file's look`);
		assert.equal(typeof DELIVERY_STYLES[name].express, 'function', `${name}: its style file says what each act does`);
	}
});

test('the looks: depth, tempo, hold and caption (§6)', () => {
	const { restrained, expressive, somber } = DELIVERY_PRESETS;
	// Text recedes to 0.7 everywhere (AA, guide-contrast.test.js); color carries the emphasis.
	for (const p of [restrained, expressive, somber]) assert.equal(p.dim, 0.7, 'receded text holds 3:1 on every theme');
	assert.equal(restrained.dimMark, 0.45, "restrained recedes chart shapes to the chart hover's own 0.45");
	assert.ok(expressive.dimMark < restrained.dimMark, 'expressive recedes shapes deepest');
	assert.equal(somber.dimMark, restrained.dimMark, 'somber recedes as deeply as restrained: it is quiet by gesturing once and slowly (owner, 2026-09-27)');
	for (const p of [restrained, expressive, somber]) assert.ok(p.dimInner < p.dimMark, "a walked line's other points recede further than the rest: the stroke keeps the shape");
	assert.ok(somber.fade >= 2 * restrained.fade, 'tempo: somber hands off at least twice as slowly');
	assert.equal(somber.hold, 'aside', 'tempo: somber holds its focus through an aside');
	assert.equal(restrained.hold, 'none');
	assert.equal(somber.caption, 'still', 'caption: somber drops the word-by-word crawl');
	assert.equal(somber.wordFocus, false, 'somber never reads along on the slide');
	for (const p of [restrained, expressive, somber]) assert.equal(p.spark, undefined, 'no recolor lever survives');
});

test('resolveDelivery falls back to restrained on an absent or unknown name', () => {
	assert.equal(resolveDelivery(null).name, 'restrained');
	assert.equal(resolveDelivery('loud').name, 'restrained');
	assert.equal(resolveDelivery(' Somber ').name, 'somber');
});

// One parse, two callers. Each row: the front-matter line, what the register resolves, and
// whether the linter flags it.
const ROWS = [
	['delivery: expressive', 'expressive', false],
	['delivery: "somber"', 'somber', false],
	['delivery: Restrained # boardroom', 'restrained', false],
	['delivery: expresive', null, true],
	['delivery: somber.', null, true],
	['delivery:', null, false],
];

test('delivery-parse-parity: the register and the linter read every line the same way', () => {
	for (const [line, resolved, flagged] of ROWS) {
		const deck = `---\nmarp: true\n${line}\n---\n\n# x\n`;
		assert.equal(frontMatterDelivery(deck), resolved, `register on ${JSON.stringify(line)}`);
		assert.equal(findUnknownDelivery(deck, LINT_NAMES).length > 0, flagged, `linter on ${JSON.stringify(line)}`);
	}
	assert.equal(deliveryLine('# no front matter\ndelivery: somber\n'), null, 'a word in the body is not the register');
});
