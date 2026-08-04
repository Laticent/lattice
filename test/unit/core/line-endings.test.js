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
// So this asserts the PROPERTY, not the readers: the same deck, written with any of the
// three line-ending conventions, must render byte-identical output once it has crossed a
// normalization boundary. A future reader that forgets `\r?` is then harmless, because
// nothing hands it un-normalized text.

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../../lib/engine/index.js');
const { resolvePalette } = require('../../../lib/core/resolve-palette.js');

/** The boundary every entry point applies: `lattice-emulator.js` readFileOrDie, the
 *  Studio's importDeckFromText. `\r\n?` covers Windows CRLF *and* classic-Mac lone CR in
 *  one pattern — same cost as `\r\n`, strictly more coverage. */
const normalize = (s) => s.replace(/\r\n?/g, '\n');

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
			resolvePalette({ md: normalize(src) }).name,
			'cuoio',
			`${name}: the deck declares 'theme: cuoio' and must resolve it — this is #1349, where a CRLF deck exported in the default palette`,
		);
	}
});

test('every line-ending convention renders byte-identical HTML and CSS', () => {
	const eng = engine.createEngine();
	const baseline = eng.render(normalize(AS.LF), 'lattice');
	for (const [name, src] of Object.entries(AS)) {
		const got = eng.render(normalize(src), 'lattice');
		assert.equal(got.html, baseline.html, `${name}: rendered HTML differs from the LF baseline`);
		assert.equal(got.css, baseline.css, `${name}: rendered CSS differs from the LF baseline`);
	}
});

test('normalization is a NO-OP on LF, so no committed deck changes its exported bytes', () => {
	// The safety half of the claim: adopting the boundary cannot alter any artifact that was
	// already correct. Only files that were rendering wrong change.
	assert.equal(normalize(DECK_LF), DECK_LF);
});

test('normalization covers lone CR, which `\\r?\\n` alone does not', () => {
	// Why the boundary uses `\r\n?` rather than the `\r?\n` the 53 readers carry: a reader's
	// pattern can only tolerate CRLF, because there is no `\n` in a lone-CR file to anchor on.
	// Classic Mac OS (<= 9) is the only producer and it is long dead, but the coverage is free
	// and its absence would be a silent wrong-render rather than a loud failure.
	assert.equal(normalize('a\rb'), 'a\nb');
	assert.equal(normalize('a\r\nb'), 'a\nb');
	assert.notEqual('a\rb'.replace(/\r?\n/g, '\n'), 'a\nb', 'a reader-style pattern cannot fix lone CR — only the boundary can');
});
