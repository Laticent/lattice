/**
 * The use-case manifest gates: the shape (lib/use-cases/use-case.schema.json, through the shared ajv
 * validator in tools/manifest-schemas.js) and the rules a schema cannot state (`checkUseCaseManifests`
 * in tools/check-ownership.js: the closed legacy list, and bounded, described input for every new use
 * case). engineering/decisions/2026-11-17-use-case-layer.md §3.5.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const { checkUseCaseManifests, SANCTIONED_LEGACY_USE_CASES } = require(path.join(ROOT, 'tools/check-ownership.js'));
const schemas = require(path.join(ROOT, 'tools/manifest-schemas.js'));

const GOOD = {
	id: 'move_slides',
	title: 'Move slides',
	describe: { default: 'Move a range of slides to a new position. Use it instead of deleting and re-inserting.' },
	tier: 'draft',
	effects: ['deck.structure'],
	destructive: false,
	idempotent: false,
	confirm: 'never',
	input: {
		type: 'object',
		additionalProperties: false,
		required: ['from', 'to'],
		properties: {
			from: { type: 'integer', minimum: 1, description: 'First slide to move.' },
			to: { type: 'integer', minimum: 0, description: 'Insert after this slide.' },
			note: { type: 'string', maxLength: 200, description: 'Why, for the author.' },
		},
	},
	requires: [],
	hosts: ['mcp'],
	toolset: 'deck',
};

/** A temporary repo root holding the given manifests (and the real schema, for the shape check). */
function tree(manifests) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'use-cases-'));
	const dir = path.join(root, 'lib', 'use-cases');
	fs.mkdirSync(dir, { recursive: true });
	fs.copyFileSync(path.join(ROOT, 'lib/use-cases/use-case.schema.json'), path.join(dir, 'use-case.schema.json'));
	for (const m of manifests) {
		fs.mkdirSync(path.join(dir, m.id));
		fs.writeFileSync(path.join(dir, m.id, `${m.id}.use-case.json`), JSON.stringify(m));
		// A new use case ships a kernel beside its manifest (unless the test removes it).
		if (!m.legacy && !m.noKernel) fs.writeFileSync(path.join(dir, m.id, `${m.id}.kernel.mjs`), 'export default () => ({ ok: true, data: null, ops: [] });\n');
	}
	return root;
}

const rules = (manifests, legacy = []) => {
	const errors = [];
	checkUseCaseManifests(errors, { root: tree(manifests), legacy });
	return errors;
};

test('the live tree passes both gates', () => {
	const errors = [];
	checkUseCaseManifests(errors);
	schemas.checkFamily(errors, schemas.family('use case'));
	assert.deepEqual(errors, []);
});

test('a new use case with bounded, described input passes', () => {
	assert.deepEqual(rules([GOOD]), []);
});

test('a new use case must bound and describe its input, and refuse unknown arguments', () => {
	const bad = structuredClone(GOOD);
	delete bad.input.additionalProperties;
	bad.input.properties.note = { type: 'string' };
	bad.input.properties.tags = { type: 'array', items: { type: 'string', maxLength: 20 }, description: 'Tags.' };
	const errors = rules([bad]);
	assert.ok(errors.some((e) => e.includes('additionalProperties: false')));
	assert.ok(errors.some((e) => e.includes('input.note is a string with no maxLength')));
	assert.ok(errors.some((e) => e.includes('input.properties.note has no description')));
	assert.ok(errors.some((e) => e.includes('input.tags is an array with no maxItems')));
});

test('legacy is closed: a new use case cannot claim it', () => {
	const sneaky = { ...structuredClone(GOOD), legacy: true };
	assert.ok(rules([sneaky]).some((e) => e.includes('`legacy: true` is only for the chat tools that predate manifests')));
	assert.deepEqual(rules([sneaky], ['move_slides']), []);
});

test('a stale legacy entry fails: one with no manifest, or one no longer legacy', () => {
	assert.ok(rules([GOOD], ['gone_tool']).some((e) => e.includes('"gone_tool", which has no manifest')));
	assert.ok(rules([GOOD], ['move_slides']).some((e) => e.includes('"move_slides", whose manifest is no longer legacy')));
});

test('the legacy list names exactly the chat tools that predate manifests', () => {
	assert.equal(SANCTIONED_LEGACY_USE_CASES.length, 19);
});

test('the shape gate refuses an unknown tier and a chat use case with no chat block', () => {
	const errors = [];
	const root = tree([{ ...GOOD, tier: 'sometimes' }, { ...GOOD, id: 'chat_thing', hosts: ['chat'] }]);
	schemas.checkFamily(errors, schemas.family('use case'), { root });
	assert.ok(errors.some((e) => e.includes('move_slides') && e.includes('tier')), errors.join('\n'));
	assert.ok(errors.some((e) => e.includes('chat_thing') && e.includes('chat')), errors.join('\n'));
});

// The red team's bypasses on #3208 step 1: each one passed both gates before the walker was tightened.
test('the input gate sees through every shape that could hide an unbounded value', () => {
	const withInput = (props) => {
		const m = structuredClone(GOOD);
		m.input.properties = { ...m.input.properties, ...props };
		return rules([m]);
	};
	const has = (errors, text) => assert.ok(errors.some((e) => e.includes(text)), `expected "${text}" in:\n${errors.join('\n')}`);
	has(withInput({ blob: { type: 'object', description: 'd', properties: {} } }), 'input.blob needs `additionalProperties: false`');
	has(withInput({ any: { description: 'anything' } }), 'input.any has no type');
	has(withInput({ hidden: { description: 'd', allOf: [{ type: 'string' }] } }), 'uses `allOf`');
	has(withInput({ ref: { description: 'd', $ref: '#/$defs/x' } }), 'uses `$ref`');
	has(withInput({ neg: { description: 'd', not: { type: 'number' } } }), 'uses `not`');
	has(withInput({ pp: { type: 'object', description: 'd', additionalProperties: false, patternProperties: { '.*': { type: 'string' } } } }), 'uses `patternProperties`');
	has(withInput({ huge: { type: 'string', maxLength: 1e12, description: 'd' } }), 'a bound over 100000 bounds nothing');
	has(withInput({ essay: { type: 'string', maxLength: 10, description: 'x'.repeat(5000) } }), "essay's description is 5000 characters");
});

test('every input must compile as JSON Schema, legacy included', () => {
	const typo = structuredClone(GOOD);
	typo.input.properties.from.type = 'strng';
	assert.ok(rules([typo]).some((e) => e.includes('input is not valid JSON Schema')));
	const misspelled = structuredClone(GOOD);
	misspelled.input.requried = ['from'];
	assert.ok(rules([misspelled]).some((e) => e.includes('input is not valid JSON Schema')));
	const legacyTypo = { ...structuredClone(GOOD), legacy: true };
	legacyTypo.input.properties.to.minimum = 'zero';
	assert.ok(rules([legacyTypo], ['move_slides']).some((e) => e.includes('input is not valid JSON Schema')));
});

test('a new use case ships a kernel, not a handler in a host', () => {
	assert.ok(rules([{ ...structuredClone(GOOD), noKernel: true }]).some((e) => e.includes('move_slides/move_slides.kernel.mjs')));
});
