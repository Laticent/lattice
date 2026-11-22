/**
 * The use-case dispatcher (lib/use-cases/dispatch.mjs) on a TEST HOST: no Studio, no model, a catalog of
 * four use cases and handlers that record what ran. engineering/decisions/2026-11-17-use-case-layer.md
 * §6.1 and §10 step 1.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { dispatch } = require(path.join(__dirname, '../../../lib/use-cases/dispatch.mjs'));

function testHost({ allow = () => true } = {}) {
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
