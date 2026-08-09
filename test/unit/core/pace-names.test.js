const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { findUnknownPace } = require('../../../lib/authoring/lint-core');

let PACE_NAMES;
let paceLine;
let frontMatterPace;
let PACE_BEATS;
let paceBeatMs;
test.before(async () => {
	({ PACE_NAMES, paceLine, frontMatterPace, PACE_BEATS, paceBeatMs } = await import('../../../lib/core/resolve-pace.mjs'));
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
	for (const name of PACE_NAMES) {
		assert.ok(PACE_BEATS[name], `resolve-pace.mjs PACE_BEATS is missing \`${name}\``);
	}
});

// The MILLISECONDS are stated twice for the same reason the NAMES are (see the header): the
// cadence kernel is a TypeScript workspace package the engine cannot import, and the engine's
// `lib/core` cannot be imported from inside that package without a relative path escaping its
// own boundary. So the two copies are pinned here instead.
//
// This is not academic. `paceBeatMs` is what the self-contained `.html` player holds between
// slides, and `slideBeatMs` is what the live Studio holds. If they drift, the deck the author
// REHEARSED and the deck their board RECEIVES play at different rhythms — the exact failure the
// `pace:` register exists to prevent, reintroduced one layer down.
test('the millisecond beats agree between the engine register and the cadence kernel', () => {
	const src = read('docs/src/lib/cadenza/cadence.ts');
	// `natural` is authored as the SLIDE_PAUSE_MS / SECTION_PAUSE_MS constants rather than
	// literals, so resolve each name through its own declaration rather than reading the
	// PACE_PRESETS block's text.
	const constant = (name) => {
		const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
		assert.ok(m, `could not find ${name} in cadence.ts`);
		return Number(m[1]);
	};
	const block = src.match(/PACE_PRESETS[^=]*=\s*\{([\s\S]*?)\n\};/)[1];
	const preset = (name) => {
		const m = block.match(new RegExp(`\\b${name}\\s*:\\s*\\{\\s*slide:\\s*([A-Z_0-9]+)\\s*,\\s*section:\\s*([A-Z_0-9]+)\\s*\\}`));
		assert.ok(m, `could not read the \`${name}\` preset out of PACE_PRESETS`);
		const num = (tok) => (/^\d+$/.test(tok) ? Number(tok) : constant(tok));
		return { slide: num(m[1]), section: num(m[2]) };
	};
	for (const name of PACE_NAMES) {
		assert.deepEqual(PACE_BEATS[name], preset(name), `\`${name}\`: resolve-pace.mjs PACE_BEATS vs cadence.ts PACE_PRESETS`);
	}
});

test('paceBeatMs resolves override → deck pace → default, and honors a zero beat', () => {
	assert.equal(paceBeatMs('slide', 'deliberate'), PACE_BEATS.deliberate.slide);
	assert.equal(paceBeatMs('section', 'deliberate'), PACE_BEATS.deliberate.section);
	// Unknown / absent falls back to the default rather than throwing — a typo'd pace is
	// indistinguishable from an absent one at render time, by design (see resolve-pace.mjs).
	assert.equal(paceBeatMs('slide', 'delibrate'), PACE_BEATS.natural.slide);
	assert.equal(paceBeatMs('slide', null), PACE_BEATS.natural.slide);
	// An explicit override wins outright, and `0` is a legitimate "no beat" — checked for
	// finiteness, not truthiness, so it must not fall through to the preset.
	assert.equal(paceBeatMs('slide', 'deliberate', 250), 250);
	assert.equal(paceBeatMs('slide', 'deliberate', 0), 0);
	assert.equal(paceBeatMs('slide', 'deliberate', Number.NaN), PACE_BEATS.deliberate.slide);
	assert.equal(paceBeatMs('slide', 'deliberate', -5), PACE_BEATS.deliberate.slide);
});

// ── pace-parse-parity ────────────────────────────────────────────────────────────────────────
//
// The list agreeing is not enough — the two PARSES have to agree too. The linter's whole reason
// to exist is that "a typo here is invisible on the author's own machine and only wrong on
// someone else's", and a rule that reads the register differently from the resolver reports on a
// different deck than the one that will play. The first version of `findUnknownPace` matched only
// a clean bare word, so every shape below with a trailing character produced NO finding while the
// resolver discarded the pace. Silence on precisely the typos it was written to catch.
//
// The contract this pins, for every shape: the resolver returns a pace  <=>  the linter is quiet.
const PARSE_CASES = [
	['pace: brisk', 'brisk'],
	['pace: natural', 'natural'],
	['pace: deliberate', 'deliberate'],
	['pace: DELIBERATE', 'deliberate'],
	['pace:    deliberate   ', 'deliberate'],
	["pace: 'brisk'", 'brisk'],
	['pace: "brisk"', 'brisk'],
	['pace: brik', null],
	['pace: delibrate', null],
	['pace: slowly', null],
	// A trailing YAML comment: front matter IS YAML, so the value is the word, not the word plus
	// the annotation. Both sides strip it, so a documented pace keeps working and a MIS-SPELLED
	// documented pace still gets reported.
	['pace: deliberate # a weighty deck', 'deliberate'],
	['pace: delibrate # a weighty deck', null],
	['pace: brisk   # demo', 'brisk'],
	// Trailing punctuation is NOT a comment; it makes the value unknown and must be reported.
	['pace: brisk.', null],
	['pace: deliberate;', null],
	// `pace:` with nothing after it is an unfinished key, not an unknown register.
	['pace:', 'EMPTY'],
	['pace:   ', 'EMPTY'],
];

test('pace-parse-parity: the linter and the resolver read the register identically', () => {
	for (const [line, expected] of PARSE_CASES) {
		for (const bom of ['', '﻿']) {
			for (const fence of ['---', '--- ']) {
				const src = `${bom}${fence}\ntheme: cuoio\n${line}\n---\n\n# Slide\n`;
				const label = `${JSON.stringify(line)}${bom ? ' (BOM)' : ''}${fence === '--- ' ? ' (padded fence)' : ''}`;

				const resolved = frontMatterPace(src);
				const findings = findUnknownPace(src, PACE_NAMES);

				if (expected === 'EMPTY') {
					assert.equal(resolved, null, `${label}: an empty value declares no pace`);
					assert.equal(findings.length, 0, `${label}: an unfinished key is not an unknown register`);
					continue;
				}
				assert.equal(resolved, expected, `${label}: resolver`);
				if (expected === null) {
					assert.equal(findings.length, 1, `${label}: the resolver DISCARDED this pace and the linter said nothing — the deck would silently play at the viewer's pace`);
					assert.equal(findings[0].rule, 'unknown-pace');
					assert.equal(findings[0].classToken, paceLine(src).value, `${label}: the finding must name the value the resolver actually saw`);
				} else {
					assert.equal(findings.length, 0, `${label}: the resolver ACCEPTED this pace and the linter warned about it — a false alarm on a working deck`);
				}
			}
		}
	}
});

test('pace-parse-parity: a deck with no front-matter fence declares no pace and draws no warning', () => {
	const src = '# Slide\n\npace: deliberate\n';
	assert.equal(frontMatterPace(src), null, 'prose is not front matter');
	assert.equal(findUnknownPace(src, PACE_NAMES).length, 0);
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

test('front-matter-scalar-parity: resolve-pace.mjs mirrors the shared scalar rule', () => {
	// `paceLine` cannot IMPORT `frontMatterScalar` — this module is ESM the docs site
	// imports directly, and Rollup will not resolve named exports off a CJS file outside
	// its root (the same constraint documented in resolve-pace.mjs's own header). So the
	// rule is duplicated, and duplication without a gate is exactly the drift the shared
	// rule exists to end. This is that gate: drive both over the shapes where a naive
	// comment strip goes wrong, and pin them equal.
	const { frontMatterScalar } = require('../../../lib/core/front-matter-key');
	const SHAPES = [
		'brisk',
		'brisk  # weighty deck',
		'brisk\t# tabbed',
		"'brisk'",
		'"brisk"',
		'brisk.',
		'#ffffff', // a # that OPENS the value is data, not a comment
		'a#b', // a # after a non-space is data
		'/brand/mark.svg#icon',
		'', // an unfinished key
		'   ',
	];
	for (const shape of SHAPES) {
		const viaShared = frontMatterScalar(shape).toLowerCase();
		const viaPace = paceLine(`---\npace: ${shape}\n---\n\n# S\n`)?.value ?? '';
		assert.equal(viaPace, viaShared, `pace: ${JSON.stringify(shape)} — the mirror drifted from lib/core/front-matter-key.js`);
	}
});

test('front-matter-scalar-parity: glossary-auto.mjs mirrors the shared name rule', async () => {
	// The second ESM mirror, under the identical Rollup constraint. `readFrontMatterGlossary`
	// applies the bare-name constraint too, so it is pinned against `frontMatterName` rather
	// than the raw scalar — an out-of-shape value must be null on BOTH sides, or a deck gets
	// a glossary here and none there.
	const { frontMatterName } = require('../../../lib/core/front-matter-key');
	const { resolveGlossaryMode } = await import('../../../lib/core/glossary-auto.mjs');
	const SHAPES = ['auto', 'auto  # for the appendix', "'auto'", '"auto" # q', 'off', 'a b', '#ffffff', '', 'AUTO'];
	for (const shape of SHAPES) {
		const src = `---\nglossary: ${shape}\n---\n\n# S\n`;
		const expected = (frontMatterName(`glossary: ${shape}`, 'glossary') || '').toLowerCase();
		// resolveGlossaryMode maps the raw name → 'auto' | 'off'; only 'auto' opts in.
		assert.equal(resolveGlossaryMode(src), expected === 'auto' ? 'auto' : 'off',
			`glossary: ${JSON.stringify(shape)} — the mirror drifted from lib/core/front-matter-key.js`);
	}
});
