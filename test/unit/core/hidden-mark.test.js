/**
 * lib/core/hidden-slides.mjs `hasHiddenMark` replaces `/\sdata-lattice-hidden\s*=\s*(["'])true\1/i` (regex PR 3): recheck
 * cannot decide the back-reference. A seeded differential fuzz holds the hand reader to the regex (HARD RULE #32).
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');

let hs;
before(async () => {
	hs = await import('../../../lib/core/hidden-slides.mjs');
});

test('hasHiddenMark matches the regex (seeded differential fuzz)', () => {
	const SEED = Number(process.env.FUZZ_SEED || 3045);
	const rand = mulberry32(SEED);
	const pieces = [' ', '\t', '\n', ' ', 'data-lattice-hidden', 'DATA-Lattice-HIDDEN', 'data-lattice-hiddenx', '=', '"', "'", 'true', 'TRUE', 'tru', 'x', '<section', '>'];
	const hand = ['', ' data-lattice-hidden="true"', 'data-lattice-hidden="true"', " data-lattice-hidden = 'True'", ' data-lattice-hidden="true\'', ' data-lattice-hidden=true', ' data-lattice-hidden="false" data-lattice-hidden="true"'];
	for (let i = 0; i < 30000; i++) {
		let s = '';
		const n = Math.floor(rand() * 9);
		for (let j = 0; j < n; j++) s += pieces[Math.floor(rand() * pieces.length)];
		hand.push(s);
	}
	for (const s of hand) assert.equal(hs.hasHiddenMark(s), /\sdata-lattice-hidden\s*=\s*(["'])true\1/i.test(s), `seed ${SEED}, input ${JSON.stringify(s)}`);
});
