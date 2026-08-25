/**
 * `checkLineEndingBoundaries` — the LF ingest-boundary list is a GATE (#1524).
 *
 * WHY THIS GATE EXISTS, and why its test is written to be hostile to it. #1349: a
 * Windows-authored deck exported in the WRONG PALETTE because one front-matter reader of
 * ~55 lacked a `\r?`. #1357 fixed that by normalizing at every INGEST instead of in every
 * reader — which converts N redundant partial guarantees into ONE guarantee plus a list
 * that must stay true. The list is therefore the design, and #1357's own note said the
 * list was enforced by `checkLineEndingBoundaries` + `SANCTIONED_EOL_BOUNDARIES` in
 * `tools/check-ownership.js`.
 *
 * It was not. Nine places cited the function as shipped — CLAUDE.md's doc-index row,
 * `.gitattributes`, the changelog, four source comments — and `build:check` ran nothing,
 * because there was nothing to run. #1388 (`export-marp` exports a BOM'd deck in the wrong
 * palette) is #1349 recurring one file over, at the ninth ingest, and it reasoned that the
 * file was "missing from the list" when the truth was that the list was fiction.
 *
 * So the failure mode this suite exists to prevent is not "a boundary regressed". It is
 * "a gate that cannot fail passes forever and everyone cites its green". Every arm below
 * asserts a RED, and the file-level guard at the bottom asserts the real tree is green —
 * the two together are what make a green run mean something.
 *
 * Probes live in a TEMP tree, never in the real one: `node --test` runs files concurrently,
 * so a probe written into `lib/` is seen by check-ownership.test.js scanning the same tree,
 * and a crash between write and cleanup leaves a file that fails `build:check`.
 */
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
	checkLineEndingBoundaries,
	SANCTIONED_EOL_BOUNDARIES,
	SANCTIONED_EOL_NON_BOUNDARIES,
} = require('../../../tools/check-ownership.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-eol-gate-'));
fs.mkdirSync(path.join(TMP, 'lib', 'core'), { recursive: true });
const PROBE_REL = 'lib/core/probe.js';
const PROBE_ABS = path.join(TMP, PROBE_REL);

afterEach(() => fs.rmSync(PROBE_ABS, { force: true }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Run the real gate over the temp tree with `src` as its only source file. */
function gate(src, sanctions = [], exempt = []) {
	fs.writeFileSync(PROBE_ABS, src);
	const errors = [];
	checkLineEndingBoundaries(errors, sanctions, exempt, TMP);
	return errors;
}

/** The canonical ingest idiom: BOM strip + `\r\n?` fold. */
const FOLD = String.raw`.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')`;
const boundary = (file = PROBE_REL, extra = {}) => ({ file, why: 'probe', ...extra });

describe('arm 1 — a listed boundary that STOPPED normalizing', () => {
	test('fires when the fold is gone', () => {
		const errors = gate('const src = read(p);\n', [boundary()]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /no longer normalizes author text/);
		assert.match(errors[0], /fold sites: 0, BOM strips: 0/);
	});

	test('fires when the fold is there but the BOM STRIP is not — an ingest owes both', () => {
		const errors = gate(String.raw`const s = read(p).replace(/\r\n?/g, '\n');` + '\n', [boundary()]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /fold sites: 1, BOM strips: 0/);
	});

	test('passes on the full idiom', () => {
		assert.deepEqual(gate(`const s = read(p)${FOLD};\n`, [boundary()]), []);
	});

	test('accepts the literal BOM character as well as the \\uFEFF escape', () => {
		const literal = `const s = read(p).replace(/^\uFEFF/, '').replace(/\\r\\n?/g, '\\n');\n`;
		assert.deepEqual(gate(literal, [boundary()]), []);
	});

	test('an `expect` entry is checked against its own pattern, not the JS idiom', () => {
		fs.writeFileSync(path.join(TMP, '.gitattributes'), '* text=auto eol=lf\n');
		const ok = [];
		checkLineEndingBoundaries(ok, [{ file: '.gitattributes', expect: /^\*\s+text=auto\s+eol=lf\s*$/m, why: 'probe' }], [], TMP);
		assert.deepEqual(ok, []);
		fs.writeFileSync(path.join(TMP, '.gitattributes'), '* text=auto\n');
		const bad = [];
		checkLineEndingBoundaries(bad, [{ file: '.gitattributes', expect: /^\*\s+text=auto\s+eol=lf\s*$/m, why: 'probe' }], [], TMP);
		assert.equal(bad.length, 1);
		assert.match(bad[0], /no longer matches its declared normalization/);
		fs.rmSync(path.join(TMP, '.gitattributes'), { force: true });
	});
});

describe('arm 2 — a STALE entry, so the list cannot rot', () => {
	test('fires when a sanctioned boundary file is gone', () => {
		const errors = gate(`const s = read(p)${FOLD};\n`, [boundary(), boundary('lib/core/deleted.js')]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /stale line-ending sanction/);
		assert.match(errors[0], /lib\/core\/deleted\.js no longer exists/);
	});
});

describe('arm 3 — a pinned COUNT that moved (the engine has two doors)', () => {
	const two = `const a = x${FOLD};\nconst b = y${FOLD};\n`;

	test('passes when the count matches', () => {
		assert.deepEqual(gate(two, [boundary(PROBE_REL, { count: 2 })]), []);
	});

	test('fires when a door stops normalizing — on BOTH channels, since it lost both', () => {
		const errors = gate(`const a = x${FOLD};\nconst b = y;\n`, [boundary(PROBE_REL, { count: 2 })]);
		assert.equal(errors.length, 2);
		assert.ok(errors.some((e) => /carries 1 fold\(s\)/.test(e)), errors.join('\n'));
		assert.ok(errors.some((e) => /carries 1 BOM-strip\(s\)/.test(e)), errors.join('\n'));
	});

	test('fires when a door keeps its fold but loses its BOM STRIP', () => {
		// The hole the first cut left: `count` was compared to the FOLD sites only, so a file
		// could carry 2 folds and 1 BOM strip and pass — the same two-door divergence the pin
		// exists to prevent, in the channel this gate's own comment calls the worse one.
		const mixed = `const a = x${FOLD};\n` + String.raw`const b = y.replace(/\r\n?/g, '\n');` + '\n';
		const errors = gate(mixed, [boundary(PROBE_REL, { count: 2 })]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /carries 1 BOM-strip\(s\)/);
	});

	test('fires when a THIRD door appears undeclared', () => {
		const errors = gate(`${two}const c = z${FOLD};\n`, [boundary(PROBE_REL, { count: 2 })]);
		assert.equal(errors.length, 2);
		assert.ok(errors.every((e) => /carries 3/.test(e)), errors.join('\n'));
	});
});

describe('arm 4 — an UNLISTED normalizer makes the list a lie', () => {
	test('fires on a fold outside the list', () => {
		const errors = gate(`const s = read(p)${FOLD};\n`, []);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /folds line endings to LF but is not in SANCTIONED_EOL_BOUNDARIES/);
	});

	test('reports the LINE of the offending fold', () => {
		const errors = gate(`// header\n\nconst s = read(p)${FOLD};\n`, []);
		assert.match(errors[0], /^lib\/core\/probe\.js:3 /);
	});

	test('catches the spellings a maker reaches for without thinking', () => {
		// `replaceAll` and split/join are the same fold. Missing them cut BOTH ways: a real
		// second normalizer slipped past arm 4, AND a listed boundary that switched spelling
		// would have been reported by arm 1 as having stopped normalizing — a gate failure on
		// correct code.
		for (const spelling of [
			String.raw`raw.replace(/^\uFEFF/, '').replaceAll(/\r\n?/g, '\n')`,
			String.raw`raw.replace(/^\uFEFF/, '').split(/\r\n?/).join('\n')`,
		]) {
			assert.equal(gate(`const s = ${spelling};\n`, []).length, 1, spelling);
			assert.deepEqual(gate(`const s = ${spelling};\n`, [boundary()]), [], spelling);
		}
	});

	test('does NOT fire on a call to the shared helper — delegating is the right answer', () => {
		assert.deepEqual(gate('const s = normalizeSourceText(raw);\n', []), []);
	});

	test('does NOT fire on the pattern written down in PROSE', () => {
		const src = `/**\n * Repeating a bare ${FOLD} at every ingest is what this replaces.\n */\nexport const x = 1;\n`;
		assert.deepEqual(gate(src, []), []);
	});

	test('an exempt non-boundary is excused', () => {
		assert.deepEqual(gate(`const s = raw${FOLD};\n`, [], [{ file: PROBE_REL, why: 'probe' }]), []);
	});

	test('a STALE exemption fires — the waiver list cannot rot either', () => {
		const errors = gate('export const x = 1;\n', [], [{ file: PROBE_REL, why: 'probe' }]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /stale line-ending non-boundary sanction/);
	});
});

describe('arm 5 — `\\r?\\n` used to NORMALIZE, where a boundary needs `\\r\\n?`', () => {
	test('fires on the backwards fold, listed or not', () => {
		const src = String.raw`const s = raw.replace(/\r?\n/g, '\n');` + '\n';
		const errors = gate(src, [boundary()]);
		assert.ok(errors.some((e) => /cannot match a lone CR/.test(e)), errors.join('\n'));
	});

	test('leaves a READER pattern alone — `/^---\\r?\\n/` is a match, not a fold', () => {
		const src = String.raw`const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---/);` + `\nconst s = raw${FOLD};\n`;
		assert.deepEqual(gate(src, [boundary()]), []);
	});

	test('leaves an ESCAPER alone — folding into a literal `\\n` is not a canonicalization', () => {
		const src = String.raw`const v = String(s).replace(/\r?\n/g, '\\n');` + '\n';
		assert.deepEqual(gate(src, []), []);
	});
});

describe('arm 6 — an ingest that never normalizes AT ALL', () => {
	// The arm the other five could not cover. #1349 and #1388 were both readers with NO fold, and
	// arms 1-5 all key on a fold that exists — so a tenth unnormalized ingest
	// (`tools/export-chart-svg.js`) sat in the tree, reading a deck raw and anchoring on
	// `/^---\n/`, while every doc said the loop was closed. Found by an independent checker on
	// this change's own diff, which is the reason this arm exists.
	const INGEST = `const s = fs.readFileSync(p, 'utf8');\nconst m = s.match(/^---\\n([\\s\\S]*?)\\n---/);\n`;

	test('fires on a utf8 read plus a strict `^---` front-matter anchor', () => {
		const errors = gate(INGEST, []);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /anchors front matter on `\^---` without normalizing/);
	});

	test('is silent once the read normalizes', () => {
		assert.deepEqual(gate(`const s = fs.readFileSync(p, 'utf8')${FOLD};\n`, [boundary()]), []);
	});

	test('needs BOTH halves — a read alone, or an anchor alone, is not an ingest', () => {
		assert.deepEqual(gate("const s = fs.readFileSync(p, 'utf8');\n", []), []);
		assert.deepEqual(gate('const m = s.match(/^---\\n/);\n', []), []);
	});

	test('leaves a SLIDE-SEPARATOR split alone — `\\s` and `$/m` already tolerate a CR', () => {
		// The first cut of this arm fired on four of these over repo-committed gallery decks.
		// They are not the #1349 shape: `/^---\s*$/m` matches a CRLF fence perfectly well.
		for (const anchor of ['/^---\\s*$/m', '/^---[ \\t]*$/gm', '/^---[ \\t]*\\r?\\n/']) {
			assert.deepEqual(gate(`const parts = fs.readFileSync(p, 'utf8').split(${anchor});\n`, []), [],
				`${anchor} tolerates a CR already and must not be flagged`);
		}
	});
});

describe('the arms compose — one file, one answer', () => {
	test('an excused file is answered once, whichever way it folds', () => {
		// Arm 5 used to run before the exemption check and never consult it, so a legitimate
		// comparison-fold spelled `\r?\n` red-lit the build with NO legal remedy: listing it as a
		// non-boundary added a bogus stale-sanction error on top, and the fix its message implied
		// moved the failure to arm 4. A gate a maker cannot satisfy is worse than no gate.
		const wrong = String.raw`const n = (s) => s.replace(/\r?\n/g, '\n');` + '\n';
		assert.deepEqual(gate(wrong, [], [{ file: PROBE_REL, why: 'probe' }]), []);
		assert.equal(gate(wrong, []).length, 1);
	});

	test('a listed boundary is still judged by arm 5 — being listed is not a waiver', () => {
		const wrong = String.raw`const s = read(p).replace(/^\uFEFF/, '').replace(/\r?\n/g, '\n');` + '\n';
		const errors = gate(wrong, [boundary()]);
		assert.ok(errors.some((e) => /cannot match a lone CR/.test(e)), errors.join('\n'));
	});

	test('the `\\r\\n`-only fold is caught too — same defect, different spelling', () => {
		// Four live sites were folding this way, unlisted and silent, when the arm only knew
		// `\r?\n`: tier-filter, the two index builders, and changelog.js.
		const errors = gate(String.raw`const t = String(src).replace(/\r\n/g, '\n');` + '\n', [boundary()]);
		assert.ok(errors.some((e) => /cannot match a lone CR/.test(e)), errors.join('\n'));
	});
});

describe('the shipped tree', () => {
	test('is green against its own boundary list', () => {
		const errors = [];
		checkLineEndingBoundaries(errors);
		assert.deepEqual(errors, []);
	});

	test('a stateful `expect` regex is rejected, not silently trusted', () => {
		// `.test()` on a `/g` regex advances lastIndex. This function runs once per build:check
		// AND several times per test file in one process, so a global `expect` would report a
		// boundary as broken at random on the second call.
		fs.writeFileSync(path.join(TMP, '.gitattributes'), '* text=auto eol=lf\n');
		const errors = [];
		checkLineEndingBoundaries(errors, [{ file: '.gitattributes', expect: /eol=lf/g, why: 'probe' }], [], TMP);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /stateful `expect` regex/);
		fs.rmSync(path.join(TMP, '.gitattributes'), { force: true });
	});

	test('every sanction carries a justification, and the list is not empty', () => {
		assert.ok(SANCTIONED_EOL_BOUNDARIES.length >= 12);
		for (const s of [...SANCTIONED_EOL_BOUNDARIES, ...SANCTIONED_EOL_NON_BOUNDARIES]) {
			assert.equal(typeof s.file, 'string');
			assert.ok((s.why || '').length > 40, `${s.file} needs a real justification`);
		}
	});

	test('names the ingests #1357 normalized, plus the two found since', () => {
		const files = new Set(SANCTIONED_EOL_BOUNDARIES.map((s) => s.file));
		for (const f of [
			'.gitattributes',
			'lib/engine/index.js',
			'lattice-emulator.js',
			'tools/lint-deck.js',
			'lib/core/resolve-palette.js',
			'docs/src/lib/normalize-source-text.ts',
			'docs/src/components/studio/ai/architect-edits.js',
			'lib/layout/ai.js',
			'tools/export-marp.js', // #1388 — the recurrence this gate was meant to prevent
			'lib/core/boundary-parser.mjs', // found by arm 4 while writing the gate
			'lib/exemplars/tier-filter.js', // found by arm 5 (it folded `\r\n`, which cannot match a lone CR)
			'tools/export-chart-svg.js', // found by arm 6 — the tenth ingest, with no fold at all
		]) assert.ok(files.has(f), `${f} is missing from SANCTIONED_EOL_BOUNDARIES`);
	});
});
