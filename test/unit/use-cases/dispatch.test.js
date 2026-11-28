/**
 * The use-case dispatcher (lib/use-cases/dispatch.mjs) on a TEST HOST: no Studio, no model, a catalog of
 * four use cases and handlers that record what ran. engineering/decisions/2026-11-17-use-case-layer.md
 * §6.1, §7 and §10 steps 1 and 2.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { dispatch } = require(path.join(__dirname, '../../../lib/use-cases/dispatch.mjs'));
const { VALIDATORS } = require(path.join(__dirname, '../../../lib/use-cases/validators.generated.mjs'));

/** A validator that accepts anything, for the tests about everything but validation. */
const anyArgs = () => true;

function testHost({ allow = () => true, validators = { read_it: anyArgs, edit_it: anyArgs, caption_it: anyArgs, elsewhere: anyArgs } } = {}) {
	const log = [];
	const host = {
		id: 'test',
		catalog: {
			read_it: { tier: 'read', hosts: ['test'], deckEdit: false },
			edit_it: { tier: 'draft', hosts: ['test'], deckEdit: true },
			caption_it: { tier: 'draft', hosts: ['test'], deckEdit: false },
			elsewhere: { tier: 'read', hosts: ['mcp'], deckEdit: false },
		},
		allowed: (id) => allow(id),
		handlers: {
			read_it: (a) => `read ${a.n}`,
			edit_it: async (a) => (a.bad ? { text: 'refused, no check', check: false } : `edited ${a.n}`),
			caption_it: () => 'captioned',
			elsewhere: () => 'should not run here',
		},
		deckEdit: {
			begin: () => log.push('begin'),
			refuse: () => log.push('refuse'),
			check: async (text) => `${text} + check`,
		},
		validators,
	};
	return { host, log };
}

test('a read runs its handler with parsed arguments, and no check', async () => {
	const { host, log } = testHost();
	assert.deepEqual(await dispatch(host, 'read_it', '{"n":1}'), { ok: true, text: 'read 1' });
	assert.deepEqual(log, []);
});

test('a deck edit resets its verdict first and carries the check', async () => {
	const { host, log } = testHost();
	assert.deepEqual(await dispatch(host, 'edit_it', '{"n":2}'), { ok: true, text: 'edited 2 + check' });
	assert.deepEqual(log, ['begin']);
});

test('a deck edit may opt one result out of the check', async () => {
	const { host, log } = testHost();
	assert.deepEqual(await dispatch(host, 'edit_it', '{"bad":true}'), { ok: true, text: 'refused, no check' });
	assert.deepEqual(log, ['begin']);
});

test('a draft that is not a deck edit gets no verdict and no check', async () => {
	const { host, log } = testHost();
	assert.deepEqual(await dispatch(host, 'caption_it', ''), { ok: true, text: 'captioned' });
	assert.deepEqual(log, []);
});

test('an unknown id, another host’s use case, or a prototype key is UNKNOWN', async () => {
	const { host } = testHost();
	for (const id of ['nope', 'elsewhere', 'constructor', '__proto__', 'toString']) assert.deepEqual(await dispatch(host, id, '{}'), { ok: false, code: 'UNKNOWN', id });
});

test('the mode gate refuses, and a refused deck edit is marked refused', async () => {
	const { host, log } = testHost({ allow: (id) => id === 'read_it' });
	assert.deepEqual(await dispatch(host, 'edit_it', '{}'), { ok: false, code: 'NOT_OFFERED', id: 'edit_it' });
	assert.deepEqual(log, ['refuse']);
	assert.deepEqual(await dispatch(host, 'caption_it', '{}'), { ok: false, code: 'NOT_OFFERED', id: 'caption_it' });
	assert.deepEqual(log, ['refuse']); // not a deck edit: no verdict to mark
});

test('arguments that are not JSON are BAD_ARGS, and a deck edit is marked refused', async () => {
	const { host, log } = testHost();
	assert.deepEqual(await dispatch(host, 'edit_it', '{nope'), { ok: false, code: 'BAD_ARGS', id: 'edit_it' });
	assert.deepEqual(log, ['refuse']);
	assert.deepEqual(await dispatch(host, 'read_it', '{nope'), { ok: false, code: 'BAD_ARGS', id: 'read_it' });
});

test('empty arguments read as an empty object', async () => {
	const { host } = testHost();
	assert.deepEqual(await dispatch(host, 'read_it', ''), { ok: true, text: 'read undefined' });
});

// ── Validation (use-case-layer.md §7, §10 step 2) ─────────────────────────────────────────────────────────────

/** A host whose edit and read run the REAL generated validators of edit_slides and read_slides. */
function schemaHost() {
	const ran = [];
	const { host, log } = testHost({ validators: { read_it: VALIDATORS.read_slides, edit_it: VALIDATORS.edit_slides, caption_it: anyArgs, elsewhere: anyArgs } });
	const record = (kind, text) => (a) => {
		ran.push([kind, a]);
		return text;
	};
	host.handlers = { ...host.handlers, read_it: record('read', 'read'), edit_it: record('edit', 'edited') };
	return { host, log, ran };
}

test('arguments that fit the schema reach the handler, as parsed', async () => {
	const { host, log, ran } = schemaHost();
	const args = { edits: [{ action: 'replace', slide: 2, body: '# New' }], summary: 'Retitle slide 2' };
	assert.deepEqual(await dispatch(host, 'edit_it', JSON.stringify(args)), { ok: true, text: 'edited + check' });
	assert.deepEqual(ran, [['edit', args]]);
	assert.deepEqual(log, ['begin']);
});

test('a deck edit that does not fit is BAD_ARGS with the field and the reason; it never runs, and is marked refused', async () => {
	const { host, log, ran } = schemaHost();
	const out = await dispatch(host, 'edit_it', JSON.stringify({ edits: [{ action: 'replace', slide: 'two' }], summary: 'x' }));
	assert.deepEqual(out, { ok: false, code: 'BAD_ARGS', id: 'edit_it', path: '/edits/0/slide', reason: 'must be integer' });
	assert.deepEqual(ran, []);
	assert.deepEqual(log, ['refuse']);
});

test('a missing required field is named by its own path', async () => {
	const { host, ran } = schemaHost();
	assert.deepEqual(await dispatch(host, 'edit_it', '{"edits":[]}'), { ok: false, code: 'BAD_ARGS', id: 'edit_it', path: '/summary', reason: 'is required' });
	assert.deepEqual(await dispatch(host, 'read_it', '{}'), { ok: false, code: 'BAD_ARGS', id: 'read_it', path: '/from', reason: 'is required' });
	assert.deepEqual(ran, []);
});

test('arguments that are JSON but not an object are refused at the root', async () => {
	const { host, ran } = schemaHost();
	for (const json of ['null', '[1]', '7', '"x"']) {
		const out = await dispatch(host, 'read_it', json);
		assert.equal(out.code, 'BAD_ARGS', json);
		assert.equal(out.path, '/', json);
	}
	assert.deepEqual(ran, []);
});

test('a use case with no validator is not one the host can run', async () => {
	const { host, log } = testHost({ validators: { read_it: anyArgs } });
	assert.deepEqual(await dispatch(host, 'edit_it', '{}'), { ok: false, code: 'UNKNOWN', id: 'edit_it' });
	assert.deepEqual(log, []);
	// `__proto__` and friends are never a validator either.
	assert.deepEqual(await dispatch({ ...host, validators: Object.create({ edit_it: anyArgs }) }, 'edit_it', '{}'), { ok: false, code: 'UNKNOWN', id: 'edit_it' });
});

test('with no validators of its own, a host runs the generated ones', async () => {
	const { host } = testHost();
	host.validators = undefined;
	host.catalog = { ...host.catalog, read_slides: { tier: 'read', hosts: ['test'], deckEdit: false } };
	host.handlers = { ...host.handlers, read_slides: (a) => `from ${a.from}` };
	assert.deepEqual(await dispatch(host, 'read_slides', '{"from":2}'), { ok: true, text: 'from 2' });
	assert.equal((await dispatch(host, 'read_slides', '{"from":0}')).path, '/from');
	// A test id has no generated validator, so it does not run.
	assert.equal((await dispatch(host, 'read_it', '{}')).code, 'UNKNOWN');
});

