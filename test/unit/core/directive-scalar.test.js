/**
 * lib/core/directive-scalar.mjs replaces `.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()` in the
 * render path (regex PR 3, followups.d/3045-p2-regex-recheck-gate.md). A seeded differential fuzz holds each one-pass
 * reader to the pattern it replaces (HARD RULE #32: the seed is in every failure message), and the readers run no regex,
 * so the heatmap render guard in chart-row-record.test.js no longer meets these patterns.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');

let ds;
before(async () => {
	ds = await import('../../../lib/core/directive-scalar.mjs');
});

const SEED = Number(process.env.FUZZ_SEED || 3045);
// Every class edge the patterns care about: ASCII and Unicode blanks, each line terminator `.` refuses, `#`, both quotes.
const ALPHABET = [' ', ' ', '\t', '\n', '\r', '\v', '\f', ' ', ' ', ' ', '　', '﻿', '#', '#', '"', "'", 'a', 'b', '1', ':'];

function draws(n, maxLen, seed) {
	const rand = mulberry32(seed);
	const out = [];
	for (let i = 0; i < n; i++) {
		const len = Math.floor(rand() * (maxLen + 1));
		let s = '';
		for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
		out.push(s);
	}
	return out;
}

const HAND = ['', ' ', '#', ' #', 'on # c', 'on #', 'on#c', 'a  # b\nc', 'a # b\n', 'a\n # b', '"on"', "'off'", '"a\nb"', '"', "'a\"", ' "on" # x ', 'x #y', 'x #y'];

test('stripHashComment matches /\\s+#.*$/ exactly (seeded differential fuzz)', () => {
	for (const s of [...HAND, ...draws(20000, 24, SEED)]) {
		assert.equal(ds.stripHashComment(s), s.replace(/\s+#.*$/, ''), `seed ${SEED}, input ${JSON.stringify(s)}`);
	}
});

test('unquote matches /^([\'"])(.*)\\1$/ exactly (seeded differential fuzz)', () => {
	for (const s of [...HAND, ...draws(20000, 12, SEED + 1)]) {
		assert.equal(ds.unquote(s), s.replace(/^(['"])(.*)\1$/, '$2'), `seed ${SEED + 1}, input ${JSON.stringify(s)}`);
	}
});

test('directiveScalar matches the whole chain it replaces', () => {
	const old = (v) => String(v ?? '').replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
	for (const s of [undefined, null, ...HAND, ...draws(20000, 24, SEED + 2)]) {
		assert.equal(ds.directiveScalar(s), old(s), `seed ${SEED + 2}, input ${JSON.stringify(s)}`);
	}
});

test('a long run of blanks with no `#` is read in one pass, and runs no regex', () => {
	const { traceRegexes } = require('../../helpers/regex-trace');
	const value = `on${' '.repeat(200000)}x`;
	const { result, keys } = traceRegexes(() => ds.directiveScalar(value));
	assert.equal(result, value.trim());
	assert.equal(keys.size, 0, `ran ${[...keys].join(' ')}`);
});
