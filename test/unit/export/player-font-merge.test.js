/**
 * Unit: `mergeIdenticalFontFaces` declares an identical font file once, as a weight range, only
 * where that cannot change which face or weight any used text renders with
 * (lib/export/player-prune.js; engineering/decisions/2026-10-16-player-as-library-audit.md §3).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { mergeIdenticalFontFaces, literalFontWeights, isPruneSkippedStyle } = require('../../../lib/export/player-prune.js');

const face = (family, weight, src, style = 'normal') =>
	`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:fallback;src:url(${src}) format('woff2');}`;
// Outfit as it ships: 300, 500 and 600 are one variable file; 400 and 700 are their own.
const OUTFIT = [face('Outfit', 300, 'V'), face('Outfit', 400, 'S4'), face('Outfit', 500, 'V'), face('Outfit', 600, 'V'), face('Outfit', 700, 'S7')].join('');
const MONO = [400, 500, 600].map((w) => face('JetBrains Mono', w, 'J')).join('');

describe('mergeIdenticalFontFaces', () => {
	test('adjacent weights of one file become one ranged face', () => {
		const r = mergeIdenticalFontFaces(MONO, { byFamily: { 'jetbrains mono': [400, 600] } });
		assert.equal(r.merged, 2);
		assert.equal(r.css, face('JetBrains Mono', '400 600', 'J'));
	});

	test('a run never spans a weight served by a different file', () => {
		const r = mergeIdenticalFontFaces(OUTFIT, { byFamily: { outfit: [300, 400, 500, 600, 700] } });
		assert.equal(r.merged, 1, 'only 500 and 600 merge; 300 is cut off by the static 400');
		assert.equal(r.css, [face('Outfit', 300, 'V'), face('Outfit', 400, 'S4'), face('Outfit', '500 600', 'V'), face('Outfit', 700, 'S7')].join(''));
	});

	test('a used weight strictly inside a run, that no face declares, blocks the merge', () => {
		assert.equal(mergeIdenticalFontFaces(MONO, { byFamily: { 'jetbrains mono': [450] } }).applied, false);
		assert.equal(mergeIdenticalFontFaces(MONO, { byFamily: { other: [400] }, any: [550] }).applied, false, 'a literal weight counts for every family');
		assert.equal(mergeIdenticalFontFaces(MONO, { byFamily: { 'jetbrains mono': [300, 700] } }).applied, true, 'weights outside the run do not block it');
	});

	test('no measurement means no merge', () => {
		assert.equal(mergeIdenticalFontFaces(MONO, { byFamily: {} }).applied, false);
		assert.equal(mergeIdenticalFontFaces(MONO, undefined).applied, false);
	});

	test('styles and other descriptors keep faces apart', () => {
		const css = face('P', 400, 'X') + face('P', 700, 'X', 'italic') + face('P', 700, 'Y');
		assert.equal(mergeIdenticalFontFaces(css, { byFamily: { p: [400, 700] } }).applied, false);
		const ranged = face('Q', '300 500', 'Z') + face('Q', 600, 'Z');
		assert.equal(mergeIdenticalFontFaces(ranged, { byFamily: { q: [600] } }).applied, false, 'a face already ranged is left alone');
	});

	test('keyword weights read as numbers', () => {
		const css = face('K', 'normal', 'F') + face('K', 'bold', 'F');
		assert.equal(mergeIdenticalFontFaces(css, { byFamily: { k: [400, 700] } }).css, face('K', '400 700', 'F'));
	});

	test('the shipped faces still hold identical files, so the merge has work to do', () => {
		// If the assets are ever replaced with distinct per-weight files, this pins why the merge
		// exists and tells whoever changes them that it has become a no-op.
		const dir = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');
		const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
		assert.equal(hash('outfit-500.woff2'), hash('outfit-600.woff2'));
		assert.equal(hash('jetbrains-400.woff2'), hash('jetbrains-600.woff2'));
	});
});

describe('literalFontWeights', () => {
	test('reads font-weight, weight custom properties and the font shorthand', () => {
		const w = literalFontWeights('a{font-weight:600}b{--heading-weight: 650}c{font:italic 300 1em/1.2 X}d{font-weight:bold}');
		assert.deepEqual([...w].sort(), [300, 600, 650, 700]);
	});
});

describe('isPruneSkippedStyle', () => {
	test('the dark block and the hoisted-asset block are never the prune target', () => {
		assert.equal(isPruneSkippedStyle(' id="lattice-dual-mode"'), true);
		assert.equal(isPruneSkippedStyle(' id="lp-assets"'), true);
		assert.equal(isPruneSkippedStyle('lp-assets'), true);
		assert.equal(isPruneSkippedStyle(''), false);
		assert.equal(isPruneSkippedStyle(' id="lp-assets-extra"'), false);
	});
});
