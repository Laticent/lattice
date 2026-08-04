const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

let PACE_NAMES;
test.before(async () => {
	({ PACE_NAMES } = await import('../../../lib/core/resolve-pace.mjs'));
});

// The pace vocabulary is stated in THREE places, and it has to be, because the boundaries
// between them are real:
//
//   lib/core/resolve-pace.mjs         ESM (Rollup will not read named exports off a CJS file
//                                     outside the docs root) — the front-matter parse.
//   lib/authoring/lint-core.js        CommonJS and browser-safe by contract, so it cannot import
//                                     the ESM register; the `unknown-pace` rule lives here.
//   docs/src/lib/cadenza/cadence.ts   TypeScript in a workspace package — owns the MILLISECOND
//                                     presets. `lib/core` cannot import it.
//   docs/src/playground/narration-prefs.js   node-loadable with no aliases (voice-model.js
//                                     imports it under plain `node --test`), so it cannot
//                                     import the TS module either. Owns the workspace preset.
//
// Nobody can import their way out of that, so this test is the seam instead: if the three
// lists ever disagree, a deck could declare a pace the kernel has no numbers for, or the
// linter could reject a value the Workspace happily writes.
const read = (...p) => readFileSync(join(__dirname, '../../..', ...p), 'utf8');

/** Names from a source file, given the regex that isolates its list literal. */
function namesFrom(source, listRe, label) {
	const m = source.match(listRe);
	assert.ok(m, `${label}: could not find the pace list — did its shape change?`);
	const found = [...m[1].matchAll(/['"]([a-z]+)['"]/g)].map((x) => x[1]);
	assert.ok(found.length, `${label}: matched the list but read no names out of it`);
	return found;
}

test('the pace names agree across the engine register, the cadence kernel and the workspace prefs', () => {
	const cadence = namesFrom(read('docs/src/lib/cadenza/cadence.ts'), /export type PaceName\s*=\s*([^;]+);/, 'cadence.ts PaceName');
	const prefs = namesFrom(read('docs/src/playground/narration-prefs.js'), /PACE_NAMES\s*=\s*\[([^\]]*)\]/, 'narration-prefs.js PACE_NAMES');
	const lint = namesFrom(read('lib/authoring/lint-core.js'), /PACE_NAMES\s*=\s*\[([^\]]*)\]/, 'lint-core.js PACE_NAMES');

	assert.deepEqual([...PACE_NAMES].sort(), [...cadence].sort(), 'resolve-pace.mjs vs cadence.ts PaceName');
	assert.deepEqual([...PACE_NAMES].sort(), [...prefs].sort(), 'resolve-pace.mjs vs narration-prefs.js PACE_NAMES');
	assert.deepEqual([...PACE_NAMES].sort(), [...lint].sort(), 'resolve-pace.mjs vs lint-core.js PACE_NAMES');
});

test('every registered pace has millisecond presets in the kernel', () => {
	const src = read('docs/src/lib/cadenza/cadence.ts');
	const block = src.match(/PACE_PRESETS[^=]*=\s*\{([\s\S]*?)\n\};/);
	assert.ok(block, 'could not find PACE_PRESETS');
	for (const name of PACE_NAMES) {
		assert.match(block[1], new RegExp(`\\b${name}\\s*:`), `PACE_PRESETS is missing \`${name}\` — a deck could declare a pace with no numbers behind it`);
	}
});

test('the word-rate axis is NOT the same vocabulary, and stays separate', () => {
	// `Pace` (slow/moderate/fast) is how fast words are SPOKEN; `PaceName` is how long the deck
	// HOLDS between slides. They are different axes with confusingly similar names, and the
	// export hardcodes `pace: 'moderate'` for the former. Conflating them is the obvious bug
	// here, so pin that they share no member.
	const src = read('docs/src/lib/cadenza/cadence.ts');
	const wordRate = namesFrom(src, /export type Pace\s*=\s*([^;]+);/, 'cadence.ts Pace');
	for (const n of PACE_NAMES) {
		assert.ok(!wordRate.includes(n), `'${n}' appears in BOTH the between-slide and word-rate vocabularies`);
	}
});
