/**
 * THE ARTIFACT-GUARD CENSUS — every write path is held to the run's own promise.
 *
 * WHY A CENSUS, AND NOT ONLY BEHAVIORAL ARMS.
 *
 * `--lens` withholds slides. The last line of defence is `assertArtifactPages`: it compares what the
 * FINISHED file contains against the count the run printed, which subsumes every render-time trick at
 * once — a `@media print` rule, a `beforeprint` handler, a timer, something not yet invented —
 * because it asks about the only thing that actually ships.
 *
 * That defence is only as good as its COVERAGE, and coverage is an enumeration. Three consecutive
 * adversarial rounds each found a new hole in the same shape, which is what an enumeration with an
 * unbounded complement looks like:
 *
 *   · round 9  — the visibility check measured screen media while the PDF printed in print media;
 *   · round 10 — measuring both media lost to a `beforeprint` handler, so the check moved to the
 *                artifact; but its PROMISE was still counted off the DOM being attacked;
 *   · round 11 — the promise was anchored, and then the guard turned out to cover FOUR of the SEVEN
 *                write paths. `--raster` / `--paper` PDF, the `.html` deliverable and the `--player`
 *                carrier all reached disk unchecked. Measured: `PDF: … (raster, 6 pages)` printed
 *                directly beneath `3 of 6 slides ship`, at exit 0.
 *
 * The behavioral arms in `test/integration/export/lens-artifact-channels.test.js` prove the guard
 * WORKS. They cannot prove it is EVERYWHERE — a new format, or a new branch of an existing one, is
 * simply a path no arm was written for, and it lands green. That is exactly how the three above
 * landed.
 *
 * So this file pins the guard COUNT, by value, the way `style-guard-census.test.js` does for HARD
 * RULE #22 and for the same stated reason: it cannot tell you a guard is in the RIGHT PLACE, but it
 * makes "a write path arrived without one" impossible to land silently. Adding a format, or a branch
 * that writes a deliverable, is then a deliberate edit here with a reason, in review.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');

/**
 * Every per-slide deliverable the CLI can write, and the guard that holds it to the promise.
 *
 * `outHtml` is written several times BEFORE navigation (the render sidecar, then rewritten by the
 * auto-split and rails passes). Those are not deliverables — they are the document the browser is
 * about to measure — and guarding them would be measuring the pre-image again, which is the proxy
 * this whole apparatus exists to stop trusting. They are listed here as deliberately UNGUARDED so
 * the distinction is on the record rather than implied by their absence.
 */
const PATHS = [
	{ what: 'vector PDF', guarded: true, why: 'page count read from the assembled bytes via pdf-lib' },
	{ what: 'raster / paper PDF', guarded: true, why: 'same, on the --raster/--paper branch; unguarded until round 11' },
	{ what: 'image set (.zip)', guarded: true, why: "the assembled package's own manifest slide list" },
	{ what: '.html deliverable', guarded: true, why: 'non-hole sections counted out of the written file, not asked of the live DOM' },
	{ what: 'PNG sequence', guarded: true, why: 'files actually on disk, via readdir' },
	{ what: 'PPTX', guarded: true, why: 'ppt/slides/slideN.xml read back out of the written package' },
	{ what: '--player carrier', guarded: true, why: 'lp-frame count of the finished string, after the CSS/font prune' },
];

/**
 * The number of `assertArtifactPages(` CALL sites, excluding the definition itself.
 *
 * Pinned by value. If you add a format or a branch that writes a deliverable, add its guard, add its
 * row above, and raise this number — in the same change, with the reason in the PR. If you find
 * yourself LOWERING it, a write path just lost its last check.
 */
const EXPECTED_GUARDS = 7;

test('every per-slide write path is held to the run\'s promise', () => {
	const guarded = PATHS.filter((p) => p.guarded);
	assert.equal(guarded.length, PATHS.length, 'no write path is listed as deliberately unguarded');
	for (const p of PATHS) assert.ok(p.why && p.why.length > 20, `${p.what} states how its count is taken`);
});

test('the guard call-site count matches the census, so a new path cannot arrive without one', () => {
	// Call sites only: the definition line and any mention inside a comment do not count.
	const sites = CLI.split('\n').filter((line) => {
		const t = line.trim();
		if (t.startsWith('*') || t.startsWith('//')) return false;
		if (t.startsWith('function assertArtifactPages')) return false;
		return t.includes('assertArtifactPages(');
	});
	assert.equal(
		sites.length,
		EXPECTED_GUARDS,
		`expected ${EXPECTED_GUARDS} assertArtifactPages call sites, saw ${sites.length}.\n`
			+ 'A write path was added without a guard, or a guard was removed. Update PATHS and\n'
			+ 'EXPECTED_GUARDS together, with the reason, rather than only this number.',
	);
	assert.equal(sites.length, PATHS.length, 'one guard per declared write path');
});

test('the guard refuses under a reader view and only warns without one', () => {
	// The split every check in this feature uses, pinned so it cannot quietly invert: with a view the
	// run has promised a count and breaking it is the projection's contract broken; without one, a
	// deck that moves its own page count is something a deck could always do.
	const body = CLI.slice(CLI.indexOf('function assertArtifactPages'), CLI.indexOf('function assertArtifactPages') + 2600);
	assert.match(body, /if \(LENS_PROJECTION\) \{/, 'the refusal branch is gated on a projection');
	assert.match(body, /process\.exit\(1\)/, 'and it exits non-zero');
	assert.match(body, /console\.warn/, 'while the no-view path warns instead');
	// A zero or absent promise must not silently disable every assertion — that is what a broken
	// section selector produces, and it was a fail-open until round 11.
	assert.match(body, /PROMISED_PAGES <= 0/, 'a zero promise is handled explicitly');
	assert.doesNotMatch(
		body.slice(0, body.indexOf('if (got === PROMISED_PAGES) return;')),
		/PROMISED_PAGES <= 0 \|\| got === PROMISED_PAGES\) return;/,
		'and it is not folded back into a single silent early return',
	);
});
