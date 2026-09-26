const test = require('node:test');
const assert = require('node:assert/strict');

const { DELIVERY_NAMES: LINT_NAMES, findUnknownDelivery } = require('../../../lib/authoring/lint-core');

let DELIVERY_NAMES;
let DELIVERY_PRESETS;
let deliveryLine;
let frontMatterDelivery;
let resolveDelivery;
test.before(async () => {
	({ DELIVERY_NAMES, DELIVERY_PRESETS, deliveryLine, frontMatterDelivery, resolveDelivery } = await import('../../../lib/core/resolve-delivery.mjs'));
});

// The `delivery:` names live twice, for the ESM/CommonJS reason `pace-names.test.js` gives:
// the register (ESM, read by the docs site) and the linter (CommonJS, HARD RULE #7). This test
// is the seam that keeps a deck the linter accepts from playing as something the Guide lacks.

test('the delivery names agree between the register and the linter', () => {
	assert.deepEqual([...LINT_NAMES].sort(), [...DELIVERY_NAMES].sort());
	assert.deepEqual(Object.keys(DELIVERY_PRESETS).sort(), [...DELIVERY_NAMES].sort(), 'every name has a preset, and no preset lacks a name');
});

test('the presets say what the design note §6 says', () => {
	const { restrained, expressive, somber } = DELIVERY_PRESETS;
	assert.ok(somber.budget < restrained.budget && restrained.budget < expressive.budget, 'somber spends least, expressive most');
	assert.equal(somber.ink, 'none', 'somber shows no cursor and draws no ink');
	assert.equal(restrained.ink, 'none', 'restrained focuses the element and draws no overlay');
	assert.equal(expressive.ink, 'top', 'expressive inks its top moment only');
	assert.equal(expressive.strength, 'notable');
});

test('one lever: the presets differ only in depth, tempo, hold and caption (§6)', () => {
	const { restrained, expressive, somber } = DELIVERY_PRESETS;
	assert.equal(restrained.dim, 0.45, "restrained recedes to the chart hover's own 0.45");
	assert.ok(expressive.dim < restrained.dim && restrained.dim < somber.dim, 'expressive recedes deepest, somber gentlest');
	for (const p of [restrained, expressive, somber]) assert.ok(p.dimInner < p.dim, "a walked line's other points recede further than the rest: the stroke keeps the shape");
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
