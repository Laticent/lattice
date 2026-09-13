const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
	RENDER_TARGET_KEYS,
	RENDER_TARGET_KEY_NAMES,
	RENDER_TARGET_VALUES,
	ON_WORDS,
	OFF_WORDS,
	renderTargetKeyState,
	readRenderTargetKey,
	legacyOnPattern,
	legacyOnPatternVerbatim,
} = require('../../../lib/core/render-target-keys');
const { lintTextWith } = require('../../../lib/authoring/lint-core');

const REPO = join(__dirname, '..', '..', '..');
const deck = (fm) => `---\n${fm}\n---\n\n# Slide\n\nBody.\n`;
const renderTargetFindings = (src) =>
	lintTextWith(src, {}).filter((f) => f.rule === 'bad-render-target-value');

// ---------------------------------------------------------------------------
// The vocabulary itself
// ---------------------------------------------------------------------------

test('the family is exactly the three render-target keys', () => {
	assert.deepEqual(RENDER_TARGET_KEY_NAMES, ['fluid', 'player', 'present']);
	// Every key carries the one line the linter's fix text hands the author. A key with no
	// explanation is how `fluid:` ended up reachable only by reading the emulator.
	for (const key of RENDER_TARGET_KEY_NAMES) {
		assert.equal(typeof RENDER_TARGET_KEYS[key], 'string');
		assert.ok(RENDER_TARGET_KEYS[key].length > 20, `${key} needs a real one-liner`);
	}
});

test('the on and off vocabularies are disjoint and both feed the suggestion list', () => {
	for (const on of ON_WORDS) assert.ok(!OFF_WORDS.includes(on), `${on} is in both`);
	assert.deepEqual(RENDER_TARGET_VALUES, [...ON_WORDS, ...OFF_WORDS]);
});

// ---------------------------------------------------------------------------
// PARITY with the three regexes this kernel replaced. The emulator read
// `/^\s*<key>:\s*(?:true|yes|on)\s*$/im` three times over; every value that
// enabled a target then must enable it now, or this is a silent behavior change
// to decks already in the field.
// ---------------------------------------------------------------------------

// THE ORACLE: the pattern that actually shipped before this module, verbatim. The kernel
// exports it for exactly this purpose — every parity claim below is measured against the
// real thing rather than a retyped approximation that could drift into agreeing.
const legacy = (fm, key) => legacyOnPatternVerbatim(key).test(fm);

// THE arm. The first cut of this file varied only the VALUE's case — the one dimension
// where the `i` flag makes no difference, because the kernel lowercases the word anyway —
// and so it passed while SIX inputs silently changed meaning, four of them turning a
// target OFF that used to be ON. The fixtures below are whole BLOCKS, not values, because
// every divergence that mattered was about WHICH LINE the matcher reads, not which word.
//
// The rule this pins is one-directional and is the module's entire safety argument:
// legacy ON must still be ON. A legacy OFF that becomes ON is a widening, allowed and
// listed separately; an ON that becomes OFF is a silent regression on a deck in the
// field (HARD RULE #18) and fails here.
const PARITY_BLOCKS = [
	['plain', 'fluid: true'],
	['value upper', 'fluid: TRUE'],
	['value mixed', 'fluid: Yes'],
	['trailing spaces', 'fluid: true  '],
	['leading spaces', '  fluid: true'],
	// The `i` flag covered the KEY, not just the value. Untested until it broke.
	['key capitalized', 'Fluid: true'],
	['key upper', 'FLUID: TRUE'],
	// The regex matched ANY line; a scalar reader takes the FIRST. This is the ordinary
	// way a person toggles a setting mid-edit, and the likeliest of the six to bite.
	['duplicate key, off first', 'fluid: false\nfluid: true'],
	// ...so an INDENTED key can shadow the real one, which is strictly more dangerous
	// than what it replaced.
	['nested key shadowing a real one', 'nest:\n  fluid: false\nfluid: true'],
	// `\s*` spanned the newline; `[ \t]*` does not. The worst of the six, because the
	// linter is blind to it by design — the value reads as EMPTY, which the rule skips.
	['folded value', 'fluid:\n  true'],
	// `\s` covers U+00A0; `[ \t]` does not.
	['non-breaking space before the key', '\u00a0fluid: true'],
	['among other keys', 'title: X\nfluid: true\ntheme: cuoio'],
];

test('PARITY: every block the old emulator regex enabled is still enabled', () => {
	for (const [label, block] of PARITY_BLOCKS) {
		// The fixture has to be one the legacy matcher really accepted, or the arm proves
		// nothing — a parity test whose inputs nothing matched is the shape that let six
		// divergences through.
		assert.equal(legacy(block, 'fluid'), true, `fixture drift: legacy rejected ${label}`);
		assert.equal(readRenderTargetKey(block, 'fluid'), true, `REGRESSION — ${label} no longer enables fluid`);
	}
});

test('PARITY: the widenings are enumerated, and every one is legacy-OFF becoming on', () => {
	// Both of this module's behavior changes go in the safe direction. Listing them with
	// their legacy verdict asserted is what stops a second one arriving unannounced —
	// the first cut asserted the new answer alone, so a widening read as a plain fact.
	const WIDENED = [
		['trailing YAML comment', 'fluid: true  # for the web'],
		['double-quoted value', 'fluid: "true"'],
		['single-quoted value', "fluid: 'yes'"],
		['quoted value with a comment', 'fluid: "yes" # shipped'],
	];
	for (const [label, block] of WIDENED) {
		assert.equal(legacy(block, 'fluid'), false, `${label} is not a widening — legacy already accepted it`);
		assert.equal(readRenderTargetKey(block, 'fluid'), true, `${label} should now enable fluid`);
	}
});

test('every value the old emulator regex accepted still reads as on, for all three keys', () => {
	for (const key of RENDER_TARGET_KEY_NAMES) {
		for (const value of ['true', 'yes', 'on', 'TRUE', 'Yes', 'ON']) {
			const fm = `title: X\n${key}: ${value}\ntheme: cuoio`;
			assert.equal(legacy(fm, key), true, `fixture drift: legacy rejected ${key}: ${value}`);
			assert.equal(readRenderTargetKey(fm, key), true, `${key}: ${value} regressed`);
		}
	}
});

test('every value the old regex rejected as off still reads as off', () => {
	for (const key of RENDER_TARGET_KEY_NAMES) {
		for (const value of ['false', 'no', 'off', 'ture', 'truthy', '1']) {
			const fm = `${key}: ${value}`;
			assert.equal(legacy(fm, key), false, `fixture drift: legacy accepted ${key}: ${value}`);
			assert.equal(readRenderTargetKey(fm, key), false, `${key}: ${value} newly enables`);
		}
	}
});

// The verbatim pattern is QUADRATIC, and the shipped one is a rewrite of it — so the
// rewrite owes two proofs, and a comment claiming equivalence is not one of them. An
// earlier draft of the kernel asserted the verbatim pattern "could not backtrack"; it was
// measured at 640ms for 20k newlines, which is how this pair of arms came to exist.
test('EQUIVALENCE: the linear pattern accepts exactly what the verbatim one did', () => {
	// A generated corpus over an alphabet chosen to hit every clause: line terminators and
	// the non-terminator whitespace that `\s` also covers (\f, \v, NBSP, U+3000), the key
	// in three cases, every on-word and a near-miss, and tokens that make a line almost
	// match. Seeded, so a failure is reproducible rather than a one-off CI ghost.
	const WS = [' ', '\t', '\n', '\r\n', '\u00a0', '\f', '\v', '\r', '\u2028', '\u2029', '\u3000'];
	const TOK = ['fluid:', 'Fluid:', 'FLUID:', 'true', 'TRUE', 'yes', 'on', 'ture', 'false',
		'x:', 'nest:', '#c', 'truetrue', '', 'fluid', ':', 'xfluid:'];
	// xorshift32 — a seeded PRNG, so this corpus is the same on every machine and every run.
	let seed = 0x9e3779b9;
	const rnd = () => {
		seed ^= seed << 13; seed >>>= 0;
		seed ^= seed >> 17;
		seed ^= seed << 5; seed >>>= 0;
		return seed / 0x100000000;
	};
	const pick = (a) => a[Math.floor(rnd() * a.length)];
	const verbatim = legacyOnPatternVerbatim('fluid');
	const linear = legacyOnPattern('fluid');
	let checked = 0;
	for (let i = 0; i < 50000; i++) {
		let block = '';
		const len = 1 + Math.floor(rnd() * 8);
		for (let j = 0; j < len; j++) block += pick(rnd() < 0.45 ? WS : TOK);
		checked++;
		assert.equal(linear.test(block), verbatim.test(block), `disagreement on ${JSON.stringify(block)}`);
	}
	assert.equal(checked, 50000);
});

test('EQUIVALENCE: the rewrite is linear where the verbatim pattern was quadratic', () => {
	// The verbatim shape cost 4x per doubling: 190ms / 640ms / 2477ms at 10k / 20k / 40k
	// newlines. The cost was never backtracking — it is `^\\s*` rescanning the whole run from
	// every line start under `/m`.
	//
	// THE STRUCTURAL ASSERTION IS THE TEST; the timing below is only a backstop. Two
	// reasons, both learned the hard way in this PR. A ratio-of-timings arm does not FAIL
	// when the quadratic pattern comes back — it HANGS, minutes of CPU before anyone learns
	// anything, which is a worse failure mode than the bug. And a mutation run whose restore
	// step died left the quadratic pattern in the tree with the docblock still claiming
	// linearity; nothing caught it, because no arm asserted which pattern actually shipped.
	const src = legacyOnPattern('fluid').source;
	assert.notEqual(src, legacyOnPatternVerbatim('fluid').source, 'the shipped pattern IS the verbatim one');
	assert.ok(
		!src.startsWith('^\\s*'),
		`the leading run is \`\\s*\` again — under /m that rescans the whole block from every line start, which is the quadratic shape: ${src}`,
	);
	assert.ok(src.startsWith('^[^\\S'), `unexpected leading class: ${src}`);

	// Backstop, with ~600x headroom so scheduler noise cannot redden a build: 20k newlines
	// measured at 0.2ms for the shipped pattern and 640ms for the verbatim one.
	const block = `fluid:${'\n'.repeat(20000)}`;
	const pattern = legacyOnPattern('fluid');
	pattern.test(block); // warm
	const t0 = process.hrtime.bigint();
	pattern.test(block);
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	assert.ok(ms < 100, `20k newlines took ${ms.toFixed(1)}ms — the verbatim pattern took 640ms here`);
});

test('an absent key is off, and one key never answers for another', () => {
	assert.equal(readRenderTargetKey('title: X', 'fluid'), false);
	assert.equal(readRenderTargetKey('player: true', 'fluid'), false);
	assert.equal(readRenderTargetKey('player: true', 'player'), true);
});

// The reason the kernel exists. The `$` anchor in the old regex meant a trailing YAML
// comment made the key match nothing — so it silently did nothing, while every other key
// in the same block read through `frontMatterScalar` and stripped the comment. Two
// readers, one block, opposite answers.
//
// This is a WIDENING: a deck that was off becomes on. Both of this module's widenings are
// that direction, and the direction is the whole safety argument — see the parity sweep
// below, which is the arm that pins it.
test('a trailing YAML comment no longer silently disables the key', () => {
	for (const key of RENDER_TARGET_KEY_NAMES) {
		const fm = `${key}: true  # for the web`;
		assert.equal(legacy(fm, key), false, 'this is the defect being fixed');
		assert.equal(readRenderTargetKey(fm, key), true);
	}
});

// ---------------------------------------------------------------------------
// The four states the linter keys on
// ---------------------------------------------------------------------------

test('renderTargetKeyState separates a deliberate off from a typo', () => {
	assert.deepEqual(renderTargetKeyState('title: X', 'fluid'), { state: 'absent', value: null });
	assert.deepEqual(renderTargetKeyState('fluid: true', 'fluid'), { state: 'on', value: 'true' });
	assert.deepEqual(renderTargetKeyState('fluid: false', 'fluid'), { state: 'off', value: 'false' });
	assert.deepEqual(renderTargetKeyState('fluid:', 'fluid'), { state: 'empty', value: '' });
	assert.deepEqual(renderTargetKeyState('fluid: ture', 'fluid'), { state: 'unrecognized', value: 'ture' });
});

test('the legacy arm decides first, so the linter never reports a line the export ignores', () => {
	// A typo on one line and a good value on another: the export renders the viewer (the
	// legacy matcher finds the good line), so the state must be `on` and the rule silent.
	// Reporting "'ture' does nothing" on a deck that IS fluid points the author at the
	// wrong line.
	assert.equal(renderTargetKeyState('fluid: ture\nfluid: true', 'fluid').state, 'on');
	assert.deepEqual(renderTargetFindings(deck('fluid: ture\nfluid: true')), []);
	// A folded value reads as on through the legacy arm, so it is not reported as empty.
	assert.equal(renderTargetKeyState('fluid:\n  true', 'fluid').state, 'on');
});

// ---------------------------------------------------------------------------
// The lint rule
// ---------------------------------------------------------------------------

test('an unrecognized value is reported, deck-level', () => {
	const [f, ...rest] = renderTargetFindings(deck('title: X\nfluid: ture'));
	assert.equal(rest.length, 0);
	assert.equal(f.rule, 'bad-render-target-value');
	assert.equal(f.severity, 'warning');
	assert.equal(f.slide, 0);
	assert.equal(f.classToken, 'ture');
	assert.equal(f.line, 'fluid: ture');
	// The fix has to name the accepted values: `ture` is 4 characters, so the shared
	// nearest-token suggester (max edit distance 1 at that length) cannot reach `true`,
	// and the fix text is the only thing that tells the author what to write.
	for (const word of [...ON_WORDS, ...OFF_WORDS]) assert.match(f.fix, new RegExp(word));
});

test('the rule NEVER carries an autofix — a guessed polarity would flip the artifact', () => {
	// `withTokenSuggestion` picks the nearest token regardless of polarity, and the nearest
	// token to a mistyped OFF word is usually an ON word. Fed both vocabularies it rewrote
	// `player: n` to `player: on` under the editor's "Fix all", silently enabling a target
	// the author opted out of. A typo's polarity is genuinely ambiguous — `of` is one edit
	// from both `off` and `on` — so there is no correct guess, and the rule makes none.
	const { applyAllFixes } = require('../../../lib/authoring/lint-core');
	for (const line of ['player: n', 'fluid: of', 'fluid: o', 'present: ture']) {
		const src = deck(line);
		assert.equal(applyAllFixes(src, {}), src, `${line} was rewritten by an autofix`);
		const [f] = renderTargetFindings(src);
		assert.ok(f, `${line} should still be reported`);
		assert.equal(f.autofixable, undefined);
		assert.equal(f.didYouMean, undefined);
	}
});

test('a deliberate off, an on, an empty key and an absent key are all silent', () => {
	assert.deepEqual(renderTargetFindings(deck('fluid: false\nplayer: no\npresent: off')), []);
	assert.deepEqual(renderTargetFindings(deck('fluid: true\nplayer: yes\npresent: on')), []);
	assert.deepEqual(renderTargetFindings(deck('fluid:')), []);
	assert.deepEqual(renderTargetFindings(deck('title: X\ntheme: cuoio')), []);
});

test('each bad key is reported once, in declaration order', () => {
	const found = renderTargetFindings(deck('present: mabye\nfluid: ture\nplayer: sure'));
	assert.deepEqual(found.map((f) => f.classToken), ['ture', 'sure', 'mabye']);
});

test('a deck with no front matter reports nothing', () => {
	assert.deepEqual(renderTargetFindings('# Slide\n\nfluid: ture\n'), []);
});

test('a BOM or CRLF deck is still read', () => {
	assert.equal(renderTargetFindings('﻿---\nfluid: ture\n---\n\n# S\n').length, 1);
	assert.equal(renderTargetFindings('---\r\nfluid: ture\r\n---\r\n\r\n# S\r\n').length, 1);
});

// ---------------------------------------------------------------------------
// The seam: three surfaces have to agree the family has three members. None can
// import the others (the emulator is a CLI, the editor is TypeScript behind an
// `@/` alias), so this is the pin instead — the same shape pace-names.test.js
// uses for its own three-way split.
// ---------------------------------------------------------------------------

test('the emulator reads all three through the kernel, not its own regex', () => {
	const src = readFileSync(join(REPO, 'lattice-emulator.js'), 'utf8');
	for (const key of RENDER_TARGET_KEY_NAMES) {
		assert.match(src, new RegExp(`readRenderTargetKey\\(fm, '${key}'\\)`), `${key} is not read through the kernel`);
		// The replaced shape must not come back beside it.
		assert.doesNotMatch(src, new RegExp(`\\^\\\\s\\*${key}:`), `${key} still has an inline front-matter regex`);
	}
});

test("the Studio editor offers all three, so a hand-typed key is discoverable", () => {
	const src = readFileSync(join(REPO, 'docs/src/components/studio/editor-complete.ts'), 'utf8');
	for (const key of RENDER_TARGET_KEY_NAMES) {
		assert.match(src, new RegExp(`\\{ key: '${key}',`), `${key} is missing from FRONT_MATTER_KEYS`);
	}
});

test('the decision record names all three as control-less on purpose', () => {
	const doc = readFileSync(join(REPO, 'engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md'), 'utf8');
	const section = doc.slice(doc.indexOf('### 2.3'), doc.indexOf('### 2.4'));
	for (const key of RENDER_TARGET_KEY_NAMES) {
		assert.ok(section.includes(`\`${key}:\``), `${key}: is not recorded in §2.3`);
	}
});
