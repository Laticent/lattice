const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// THE ONE GAP FORMULA — a census of its call sites.
//
// `interCueGapMs(display, endsParagraph, weight)` is shared by the silent estimate (Cadenza's
// buildTrack), the clocked player (read-aloud.ts) and the bake (narration-bake.ts). Its own docblock
// says they desync if they disagree: the caption highlight then races or lags the voice at a cue
// boundary. `weight` joined `display` and `endsParagraph` as a thing they cannot disagree about.
//
// WHY A CENSUS RATHER THAN A BEHAVIORAL TEST. An independent checker mutated each consumer to drop
// its `weight` argument and the ENTIRE suite stayed green — 53 narration tests, 67 bake tests, none
// of them could see it, because a dropped third argument silently defaults and only shows up as a
// 250 ms drift against audio nobody synthesizes in CI. There is no cheap behavioral oracle for that;
// there IS a cheap structural one, and this is it. It fails on a call site that quietly stops
// passing the weight, which is exactly how this regressed once.
const ROOT = path.join(__dirname, '..', '..', '..');
const SITES = [
	'docs/src/lib/cadenza/track.ts',
	'docs/src/components/studio/read-aloud.ts',
	'docs/src/components/studio/narration-bake.ts',
];

/** Top-level argument count of the first `interCueGapMs(...)` call in `src` after `from`. */
function argCountAt(src, openIdx) {
	let depth = 0;
	let args = 1;
	for (let i = openIdx; i < src.length; i++) {
		const c = src[i];
		if (c === '(' || c === '[' || c === '{') depth++;
		else if (c === ')' || c === ']' || c === '}') {
			depth--;
			if (depth === 0) return args;
		} else if (c === ',' && depth === 1) args++;
	}
	return -1;
}

test('every interCueGapMs call site passes the cue weight', () => {
	let total = 0;
	for (const rel of SITES) {
		const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
		const calls = [...src.matchAll(/\binterCueGapMs\s*\(/g)];
		assert.ok(calls.length > 0, `${rel}: expected at least one interCueGapMs call — did it move?`);
		for (const m of calls) {
			const open = m.index + m[0].length - 1;
			const n = argCountAt(src, open);
			assert.equal(
				n,
				3,
				`${rel}: interCueGapMs called with ${n} argument(s), not 3. The third is the cue's ` +
					`weight; omitting it makes this consumer space an emphasized cue tighter than the ` +
					`track that drew the caption, and the highlight drifts against the voice.`,
			);
			total++;
		}
	}
	assert.ok(total >= 3, `expected the three known call sites, found ${total}`);
});

test('the census covers every file that calls the formula', () => {
	// A new consumer must be added to SITES deliberately, or it rides unchecked — the failure mode
	// the census exists to prevent, one file over.
	const roots = ['docs/src', 'lib'];
	const found = new Set();
	const walk = (dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name === 'node_modules' || e.name === 'dist') continue;
				walk(p);
			} else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\.|\.d\.ts$|\.generated\.js$/.test(e.name)) {
				const src = fs.readFileSync(p, 'utf8');
				// the DEFINITION lives in cadence.ts; every other mention is a call or an import
				if (/\binterCueGapMs\s*\(/.test(src) && !/export function interCueGapMs/.test(src)) {
					found.add(path.relative(ROOT, p).replace(/\\/g, '/'));
				}
			}
		}
	};
	for (const r of roots) walk(path.join(ROOT, r));
	assert.deepEqual([...found].sort(), [...SITES].sort());
});
