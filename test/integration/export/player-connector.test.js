/**
 * Integration: the prune's CONNECTOR seam (`prunePlayerHtml`'s declarations, lib/export/player-prune.js
 * LATTICE_CONNECTOR; engineering/decisions/2026-10-16-player-as-library-audit.md §10, §11.3).
 *
 * The reveal.js falsifier (§11.3) ran in scratch against a hand-written reveal.js export; this
 * file pins the three kernel behaviors that experiment forced, on a small foreign document, so
 * none of them can regress silently:
 *
 *   1. A gate whose root matches nothing refuses. Under the Lattice declaration a foreign
 *      document has no `#lp-app`, every snapshot was empty, and the gate "passed" while the prune
 *      dropped most of the sheet.
 *   2. A rule that matches only in a runtime state is kept when the connector DECLARES that state,
 *      and is dropped (with the gate unable to tell) when it does not. The second half is the
 *      limit the note states: the gate checks the states it is told about, nothing more.
 *   3. Every probe starts each state from the page as loaded and leaves the page as it found it
 *      (no state class, no `freezeMotion` style), and a gate with no declared state refuses.
 *      What `freezeMotion` is FOR is measured on the reveal.js file, not pinned here: a small
 *      synthetic deck did not reproduce reveal's timing in four variants.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { prunePlayerHtml } = require(path.join(ROOT, 'lib', 'export', 'player-prune.js'));

let browser;
before(async () => {
	const puppeteer = require('puppeteer');
	const opts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
	if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
	browser = await puppeteer.launch(opts);
});
after(async () => {
	await browser?.close();
});

const page = async (html) => {
	const p = await browser.newPage();
	await p.setContent(html, { waitUntil: 'load' });
	return { run: (probe, arg) => p.evaluate(probe, arg), close: () => p.close() };
};

/** A foreign deck: its own root, a runtime class (`on`) that nothing in the markup carries, and filler. */
const foreignDeck = () => {
	const filler = Array.from({ length: 40 }, (_, i) => `.unused-${i} p{color:#${String(i).padStart(3, '0')}}`).join('');
	const css = `.deck .slide{color:rgb(200, 0, 0)}.deck .slide.on{color:rgb(0, 0, 200)}${filler}`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="deck"><section class="slide"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div>
</body></html>`;
};

const declared = (extra = {}) => ({ root: '.deck', states: [[]], reset: [], fontBlockId: '-none-', minSheetChars: 100, ...extra });

test('under the Lattice declaration a foreign document is refused, never pruned against an empty gate', async () => {
	const pr = await prunePlayerHtml(foreignDeck(), page, { minSheetChars: 100 });
	assert.equal(pr.applied, false);
	assert.equal(pr.gateFailed, true, 'no #lp-app: the gate must refuse rather than compare two empty snapshots');
});

test('a runtime-class rule survives only when the connector declares its state', async () => {
	const blind = await prunePlayerHtml(foreignDeck(), page, declared());
	assert.equal(blind.applied, true);
	assert.doesNotMatch(blind.html, /\.slide\.on/, 'undeclared, the `on` rule is dropped, and the gate cannot see it (the stated limit)');
	const told = await prunePlayerHtml(foreignDeck(), page, declared({ states: [[], [['.deck .slide', '+class', 'on']]] }));
	assert.equal(told.applied, true);
	assert.equal(told.gateFailed, false);
	assert.match(told.html, /\.deck \.slide\.on\{color:rgb\(0, ?0, ?200\)\}/, 'declared, the `on` rule is kept');
	assert.doesNotMatch(told.html, /\.unused-3 p/, 'and the rules nothing matches still go');
});

// The probes must leave the page as they found it, or the next probe measures a DOM one state
// has leaked into. Read the page itself after each probe: the output string cannot show this,
// because `prunePlayerHtml` builds it from its input, not from the page (the checker's finding).
test('every probe starts each state from the page as loaded, and leaves nothing behind', async () => {
	const { probeUsedSelectors, probeFontUse, probeGate, GATE_PROPS } = require(path.join(ROOT, 'lib', 'export', 'player-prune.js'));
	const p = await browser.newPage();
	try {
		await p.setContent(foreignDeck(), { waitUntil: 'load' });
		// A reset that does NOT undo the last state: only the restore keeps `on` from leaking.
		const arg = { root: '.deck', states: [[['.deck .slide', '+class', 'on']], []], reset: [], freezeMotion: true };
		const leftovers = () => p.evaluate(() => ({ on: document.querySelectorAll('.slide.on').length, styles: document.querySelectorAll('style').length }));
		const clean = await leftovers();
		const { used } = await p.evaluate(probeUsedSelectors, { ...arg, selectors: ['.deck .slide.on', '.deck .slide:not(.on)'] });
		assert.deepEqual(used.sort(), ['.deck .slide.on', '.deck .slide:not(.on)'], 'both states were visited');
		assert.deepEqual(await leftovers(), clean, 'probeUsedSelectors left a state class or the freeze style behind');
		await p.evaluate(probeFontUse, arg);
		assert.deepEqual(await leftovers(), clean, 'probeFontUse left a state class or the freeze style behind');
		const sheet = await p.evaluate(() => document.querySelector('style').textContent);
		// In state 2 (no writes) the page must be as loaded: if `on` leaked from state 1, the
		// `:not(.on)` color would be missing there and a sheet without the `.on` rule would look
		// identical in both states, so this pruned sheet would wrongly pass.
		const withoutOn = sheet.replace('.deck .slide.on{color:rgb(0, 0, 200)}', '');
		assert.equal(await p.evaluate(probeGate, { ...arg, prunedCss: withoutOn, props: GATE_PROPS, skip: [], fontBlockId: '-' }), false, 'the gate must see the `.on` rule matter in state 1');
		assert.equal(await p.evaluate(probeGate, { ...arg, prunedCss: sheet, props: GATE_PROPS, skip: [], fontBlockId: '-' }), true);
		assert.deepEqual(await leftovers(), clean, 'probeGate left a state class or the freeze style behind');
		assert.equal(await p.evaluate(probeGate, { ...arg, states: [], prunedCss: sheet, props: GATE_PROPS, skip: [], fontBlockId: '-' }), false, 'no declared state, no verdict');
	} finally {
		await p.close();
	}
});
