// LINE ENDINGS ARE LF, AND THIS IS THE ASSERTION THAT KEEPS IT TRUE.
//
// The house convention is LF everywhere: LF in the repo (.gitattributes), LF in the editor,
// LF out of every export. Windows understands LF (Notepad was the last holdout, fixed in
// Windows 10 1809), so nothing is lost by it.
//
// WHY THIS FILE EXISTS RATHER THAN A PER-READER TEST. `lib/` has ~55 front-matter readers.
// All but one carried `\r?\n`; `resolve-palette.js` did not, and a Windows-authored deck
// declaring `theme: cuoio` therefore exported ENTIRELY IN THE DEFAULT PALETTE, silently
// (#1349). That bug survived an earlier repo-wide CRLF sweep precisely because the sweep
// fixed readers one at a time — a per-reader test only guards the reader you were thinking
// about. Fifty-odd readers each independently remembering `\r?` is a design that
// guarantees the next one forgets.
//
// So this asserts the PROPERTY, not the readers: the same deck, written with any of the three
// line-ending conventions, renders byte-identical output.
//
// ⚠️ THE FIXTURES ARE PASSED RAW, AND THAT IS THE ENTIRE POINT. A first cut of this file
// normalized them with a helper defined HERE, before calling the code under test — so all four
// collapsed to one string, `render(x) === render(x)`, and the whole file passed with every
// shipped boundary reverted. A guard that normalizes its own input is testing its own regex.
// If you add a case, hand the raw string to shipped code. Never pre-clean a fixture.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../../lib/engine/index.js');
const { resolvePalette } = require('../../../lib/core/resolve-palette.js');

// A deck that exercises what line endings can break: front matter (the #1349 surface), a
// slide separator, a directive comment, and a fenced block whose content must survive.
const DECK_LF = [
	'---',
	'theme: cuoio',
	'paginate: true',
	'---',
	'',
	'# First',
	'',
	'Body copy.',
	'',
	'---',
	'',
	'<!-- _class: divider -->',
	'',
	'# Second',
	'',
	'```js',
	'const a = 1;',
	'const b = 2;',
	'```',
	'',
].join('\n');

const AS = {
	LF: DECK_LF,
	CRLF: DECK_LF.replace(/\n/g, '\r\n'),
	CR: DECK_LF.replace(/\n/g, '\r'),
	/** The nastiest real case: content pasted from Windows into an LF file. */
	mixed: DECK_LF.split('\n').map((l, i) => (i % 3 === 0 ? `${l}\r\n` : `${l}\n`)).join('').replace(/\n$/, ''),
	/**
	 * A UTF-8 BOM — the OTHER thing a Windows editor emits, and STRICTLY WORSE than CRLF. Notepad,
	 * PowerShell `>` / `Out-File` and Visual Studio all write one, and it defeats the same `^---`
	 * anchor: measured through the real CLI, a BOM'd deck declaring `theme: cuoio` exported in
	 * `indaco`, lost its `size:`, and rendered its own front matter as an extra visible slide
	 * (13 slides → 14). It also diverged by PATH — `Blob.text()` strips a BOM during the UTF-8
	 * decode, `fs.readFileSync(p, 'utf8')` does not — so the same file was right in the Studio and
	 * wrong through the CLI. Both spellings are the same failure, so both live in one fixture set.
	 */
	BOM: `﻿${DECK_LF}`,
	'BOM+CRLF': `﻿${DECK_LF.replace(/\n/g, '\r\n')}`,
};

test('every line-ending convention resolves the same declared palette', () => {
	for (const [name, src] of Object.entries(AS)) {
		assert.equal(
			resolvePalette({ md: src }).name,
			'cuoio',
			`${name}: the deck declares 'theme: cuoio' and must resolve it — this is #1349, where a CRLF deck exported in the default palette`,
		);
	}
});

test('every line-ending convention renders byte-identical HTML and CSS', () => {
	const eng = engine.createEngine();
	const baseline = eng.render(AS.LF, 'lattice');
	for (const [name, src] of Object.entries(AS)) {
		const got = eng.render(src, 'lattice');
		assert.equal(got.html, baseline.html, `${name}: rendered HTML differs from the LF baseline`);
		assert.equal(got.css, baseline.css, `${name}: rendered CSS differs from the LF baseline`);
	}
});

test('the normalization is a no-op on LF, so no already-correct artifact changes a byte', () => {
	// THE SAFETY HALF — and note what this test can and cannot establish. "An LF deck renders
	// exactly as it did BEFORE this landed" is a base-vs-HEAD claim, and no single-build test can
	// make it: comparing `render(x)` to `render(x)` inside one build is a tautology, which is what
	// an earlier cut of this test did. So this asserts the property that IS local — the
	// normalization leaves LF text byte-identical, therefore nothing downstream can observe it —
	// and the base-vs-HEAD claim is carried by a measurement recorded in the CHANGELOG: 252
	// committed decks rendered on base and on HEAD, html+css hashed, 0 differ.
	const norm = (s) => s.replace(/\r\n?/g, '\n');
	assert.equal(norm(DECK_LF), DECK_LF, 'the pattern must not touch text that is already LF');
	// And the same, one level up, through shipped code: an LF deck resolves and renders.
	const eng = engine.createEngine();
	assert.equal(resolvePalette({ md: DECK_LF }).name, 'cuoio');
	assert.ok(eng.render(DECK_LF, 'lattice').html.includes('First'));
});

test('the engine\'s two public doors agree — geometry() resolves the same box render() uses', () => {
	// BOTH DOORS, OR NEITHER. Normalizing only `render()` made `geometry()` diverge on a lone-CR
	// deck: geometry reported 1280x720 for a box render laid out at 960x720. `geometry()` exists
	// so a host can fit-scale WITHOUT a full render, so a disagreement between them is the
	// "4K previews rendered 3x oversized + exported a cropped page" bug by another route.
	//
	// THE THEME CSS MUST BE LOADED for this to test anything. A bare `createEngine()` has no
	// registered theme, so `geometryFor` returns the 1280x720 default for EVERY input and all
	// three conventions "agree" vacuously — a first cut of this test did exactly that and passed
	// with the fix reverted. Measured with the real stylesheet: without the boundary, `size: 4K`
	// resolves 3840x2160 as LF and 1280x720 as lone CR.
	const eng = engine.createEngine();
	eng.addThemes([fs.readFileSync(path.join(__dirname, '../../../dist/lattice.css'), 'utf8')]);
	for (const size of ['standard', '4K']) {
		const SIZED = ['---', `size: ${size}`, '---', '', '# Sized', ''].join('\n');
		const base = eng.geometry(SIZED, 'lattice');
		assert.notDeepEqual(base, { width: 1280, height: 720 }, `size: ${size} must resolve to a NON-default box, or this test asserts nothing`);
		for (const [name, src] of Object.entries({ CRLF: SIZED.replace(/\n/g, '\r\n'), CR: SIZED.replace(/\n/g, '\r') })) {
			assert.deepEqual(eng.geometry(src, 'lattice'), base, `${name} @ size: ${size} — geometry() must resolve the same slide box as the LF deck`);
		}
	}
});

test('lone CR is covered, which a reader-side `\\r?\\n` cannot be', () => {
	// Why the boundaries use `\r\n?` rather than the `\r?\n` the other readers carry: a
	// reader's pattern can only tolerate CRLF, because there is no `\n` in a lone-CR file to
	// anchor on. Classic Mac OS (<= 9) is the only producer and it is long dead, but the
	// coverage is free and its absence is a silent wrong-render rather than a loud failure.
	// Before this change a lone-CR deck rendered 365 bytes of HTML against LF's 140.
	const eng = engine.createEngine();
	assert.equal(eng.render(AS.CR, 'lattice').html, eng.render(AS.LF, 'lattice').html);
	assert.equal(resolvePalette({ md: AS.CR }).name, 'cuoio');
});

test('export-marp reads its deck through the boundary — #1388, the ninth ingest', () => {
	// THE RECURRENCE THIS FILE EXISTS TO PREVENT, and it happened anyway. #1357 normalized
	// eight ingests; `tools/export-marp.js` was the ninth and was never touched, so a BOM'd
	// deck exported to a Marp bundle carrying the DEFAULT palette's theme files while its own
	// front matter declared another (#1388) — #1349, one file over.
	//
	// It escaped because the gate that would have caught it did not exist: `checkLineEndingBoundaries`
	// was cited as shipped in nine places and was never written (#1524,
	// `engineering/decisions/2026-08-24-what-shipped-was-a-claim.md`). Both halves are now real —
	// the gate lists this file, and this test drives the boundary function itself.
	const { readTheme, readDeckSource } = require('../../../tools/export-marp.js');
	const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lattice-eol-marp-'));
	try {
		const LF = ['---', 'theme: cuoio', '---', '', '# Probe', ''].join('\n');
		for (const [name, raw] of Object.entries({
			LF,
			CRLF: LF.replace(/\n/g, '\r\n'),
			CR: LF.replace(/\n/g, '\r'),
			BOM_CRLF: `﻿${LF.replace(/\n/g, '\r\n')}`,
		})) {
			const p = path.join(dir, `${name}.md`);
			fs.writeFileSync(p, raw);
			// The BOUNDARY is what makes the reader work. Reverting the normalization in
			// readDeckSource turns the CR and BOM_CRLF rows red — two of the three non-LF rows;
			// CRLF survives on its own because `readTheme`'s pattern already carries `\r?\n`.
			// That mutation is what proves this test is not asserting `readTheme(x) === readTheme(x)`.
			assert.equal(readTheme(readDeckSource(p)), 'cuoio', `${name} must export in its declared palette`);
		}
		// And the reason the boundary is load-bearing rather than belt-and-braces: readTheme
		// alone CANNOT rescue either input, because `^---` is what a BOM and a lone CR defeat.
		assert.equal(readTheme(`﻿${LF}`), null, 'a BOM defeats the ^--- anchor — this is the bug, not a hypothetical');
		assert.equal(readTheme(LF.replace(/\n/g, '\r')), null, 'a lone CR defeats it too, and `\\r?\\n` cannot help');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
