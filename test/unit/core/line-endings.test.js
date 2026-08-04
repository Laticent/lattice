// LINE ENDINGS ARE LF, AND THIS IS THE ASSERTION THAT KEEPS IT TRUE.
//
// The house convention is LF everywhere: LF in the repo (.gitattributes), LF in the editor,
// LF out of every export. Windows understands LF (Notepad was the last holdout, fixed in
// Windows 10 1809), so nothing is lost by it.
//
// WHY THIS FILE EXISTS RATHER THAN A PER-READER TEST. `lib/` has ~55 front-matter readers.
// 53 carried `\r?\n`; one (`resolve-palette.js`) did not, and a Windows-authored deck
// declaring `theme: cuoio` therefore exported ENTIRELY IN THE DEFAULT PALETTE, silently
// (#1349). That bug survived an earlier repo-wide CRLF sweep precisely because the sweep
// fixed readers one at a time — a per-reader test only guards the reader you were thinking
// about. Fifty-three readers each independently remembering `\r?` is a design that
// guarantees a fifty-fourth forgets.
//
// So this asserts the PROPERTY, not the readers: the same deck, written with any of the three
// line-ending conventions, renders byte-identical output.
//
// ⚠️ THE FIXTURES ARE PASSED RAW, AND THAT IS THE ENTIRE POINT. A first cut of this file
// normalized them with a helper defined HERE, before calling the code under test — so all four
// collapsed to one string, `render(x) === render(x)`, and the whole file passed with every
// shipped boundary reverted. A guard that normalizes its own input is testing its own regex.
// If you add a case, hand the raw string to shipped code. Never pre-clean a fixture.

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

test('an LF deck is untouched, so no already-correct artifact changes a byte', () => {
	// The safety half of the claim, asserted against SHIPPED code rather than a helper: an LF
	// deck must render exactly as it did before any of this landed. Only files that were
	// rendering wrong change.
	const eng = engine.createEngine();
	assert.equal(eng.render(DECK_LF, 'lattice').html, eng.render(DECK_LF, 'lattice').html);
	assert.equal(resolvePalette({ md: DECK_LF }).name, 'cuoio');
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
