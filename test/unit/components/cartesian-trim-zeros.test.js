/**
 * cartesian.js `trimZeros` replaces `s.replace(/\.?0+$/, '')` (regex PR 3, followups.d/3045-p2-regex-recheck-gate.md):
 * the regex retried a run of zeros from every start, n² on a long run, and it sat on the chart render path. A seeded
 * differential fuzz holds the one-pass loop to the old pattern (HARD RULE #32: the seed is in every failure).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { trimZeros } = require('../../../lib/plugins/chart-family/shared/cartesian.js');

const SEED = Number(process.env.FUZZ_SEED || 3045);
const old = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);

test('trimZeros matches the regex it replaces (seeded differential fuzz)', () => {
	const rand = mulberry32(SEED);
	const alphabet = ['0', '0', '0', '.', '.', '1', '5', '-', 'e'];
	const hand = ['', '.', '0', '0.0', '1.500', '10.0', '100.00', '1.000', '.0', '0.', '1.5e100', '00.00', '1.05'];
	for (let i = 0; i < 30000; i++) {
		let s = '';
		const len = Math.floor(rand() * 14);
		for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
		hand.push(s);
	}
	for (const s of hand) assert.equal(trimZeros(s), old(s), `seed ${SEED}, input ${JSON.stringify(s)}`);
});

test('trimZeros runs no regex on a long run of zeros', () => {
	const { traceRegexes } = require('../../helpers/regex-trace');
	const s = `1.${'0'.repeat(200000)}1`;
	const { result, keys } = traceRegexes(() => trimZeros(s));
	assert.equal(result, s);
	assert.equal(keys.size, 0);
});
