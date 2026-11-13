// `distinctChars` (lib/export/player-fonts.js) replaced `[...new Set(html + refs + extra)].join('')`, the
// character set the Webpage export subsets its fonts to. It must return that exact string: the same code
// points in the same first-seen order, a surrogate pair as one entry and a lone surrogate as its own. Seeded
// (HARD RULE #32; the seed is in the message).
const test = require('node:test');
const assert = require('node:assert/strict');
const { distinctChars } = require('../../../lib/export/player-fonts.js');

const oracle = (parts) => [...new Set(parts.join(''))].join('');

test('the same characters, in the same order, as the Set it replaced', () => {
	const pool = ['a', 'b', 'Z', '0', ' ', '\n', 'é', '→', '☀', '️', '🚀', '👍🏽', '\ud83d', '\ude00', '\udfff', '\ud800', '𝒳', '\u0000', '+', '/', '='];
	const seed = 1111;
	let x = seed;
	const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
	for (let n = 0; n < 3000; n++) {
		const parts = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => Array.from({ length: Math.floor(rand() * 10) }, () => pool[Math.floor(rand() * pool.length)]).join(''));
		assert.equal(distinctChars(parts), oracle(parts), `seed ${seed}, case ${n}: ${JSON.stringify(parts)}`);
	}
	// A pair split across two parts is one character, as it was when the parts were joined first.
	assert.equal(distinctChars(['a\ud83d', '\ude80']), 'a🚀');
});

test('more distinct characters than one spread can carry', () => {
	const many = Array.from({ length: 20000 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
	assert.equal(distinctChars([many, many]), many);
});
