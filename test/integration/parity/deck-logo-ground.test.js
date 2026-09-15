/**
 * Integration: the deck mark's treatment is derived from the RESOLVED GROUND, in a browser.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT REPLACES. The engine half of #2156/#2201 shipped with a
 * test that asserted a SELECTOR — its text, its occurrence count, its source position and its
 * brace depth — and never what that selector declares. A checker mutated five sites in
 * `lib/base/base.modifiers.css`, including deleting the `--deck-logo-filter` declaration that
 * IS the fix, and the full 9,509-test unit suite passed with an identical failure set. The
 * headline claim of that change had, measured, zero coverage.
 *
 * A text assertion cannot catch that, because the mutation kept the text it asserts. So this
 * file asks the only question that cannot be satisfied by spelling: render the real deck
 * through the real emulator, open the real exported document in Chromium, and read the
 * COMPUTED `filter` off the mark. `img.deck-logo` resolves
 * `filter: var(--deck-logo-filter, <light fallback>)`, so the computed value IS the treatment
 * and the fallback IS the light case — there is no third state to confuse them with.
 *
 * Slow tier because it renders through the emulator and then drives a browser.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { ROOT, runEmulator } = require('../../helpers/render');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

// RESOLVE THE BROWSER THROUGH THE SHARED HELPER, NOT `process.env.CHROME_PATH`.
// The first cut of this file read that variable directly and died in CI with
// "An `executablePath` or `channel` must be specified for `puppeteer-core`": the
// integration job never exports it — it lets `npm ci` populate `~/.cache/puppeteer`
// and lets puppeteer find its own download. `test/helpers/chrome.js` exists because
// that exact assumption silently skipped three gates once; it resolves the env pin,
// then the puppeteer cache, then puppeteer's own resolver.
const CHROME = resolveChrome();

const LIGHT_FALLBACK = 'grayscale(1) brightness(0.4) contrast(1.2)';
const INVERSE = 'grayscale(1) brightness(2.4) contrast(1.1)';

// `runEmulator` defaults to `palette: 'indaco'`, and that palette argument OVERRIDES the
// deck's own `theme:` front matter — so calling it without one renders a `-dark` fixture as a
// LIGHT deck and asserts against a document that never had the attribute under test. The first
// run of this file did exactly that and failed for that reason, which is the whole argument
// for asserting a resolved value instead of a selector string: a text assertion would have
// passed on the wrong document.
async function marksOf(fixture, { osDark = false, palette = 'indaco' } = {}) {
	const pdf = runEmulator(path.join(ROOT, 'test', 'fixtures', fixture), { palette, timeout: 120000 });
	const html = pdf.replace(/\.pdf$/, '.html');
	if (!fs.existsSync(html)) throw new Error(`HTML sidecar missing: ${html}`);
	const puppeteer = require('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
	try {
		const page = await browser.newPage();
		await page.emulateMediaFeatures([
			{ name: 'prefers-color-scheme', value: osDark ? 'dark' : 'light' },
		]);
		await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
		return await page.evaluate(() =>
			[...document.querySelectorAll('section')].map((s) => {
				const img = s.querySelector('img.deck-logo');
				return img ? getComputedStyle(img).filter : null;
			}));
	} finally {
		await browser.close();
	}
}

describe('deck-logo ground', { skip: skipWithoutChrome(CHROME) }, () => {
	test('a `-dark` THEME flips the mark, and a slide that pins light takes it back', { timeout: 180000 }, async () => {
		const marks = await marksOf('deck-logo-ground.md', { palette: 'indaco-dark' });
		assert.equal(marks.length, 3, 'expected 3 slides');
		assert.ok(marks.every(Boolean), 'every slide carries a deck mark');

		// Slide 1 — the deck-wide flip, reached by theme NAME with no slide class involved.
		// Deleting the declaration on `section[data-theme$="-dark"]` drops this to the light
		// fallback, which is #2156 exactly: an invisible mark on a dark canvas.
		assert.equal(marks[0], INVERSE, 'an unpinned slide on a `-dark` theme takes the inverse mark');

		// Slides 2-3 — the two resets. Each pins the ground back to light, so the mark must
		// follow. Deleting either reset leaves a brightened mark at 0.45 opacity on white.
		assert.equal(marks[1], LIGHT_FALLBACK, '`light` pins the ground light and the mark with it');
		assert.equal(marks[2], LIGHT_FALLBACK, '`color-light` resets the same pair');

		// The claim is that these DIFFER. Stated separately so a future change that collapses
		// both to one value fails here rather than passing two equal assertions.
		assert.notEqual(marks[0], marks[1], 'the flipped and reset treatments are distinguishable');
	});

	test('`color-mode: system` follows the RECEIVER, in both directions', { timeout: 180000 }, async () => {
		// The pair that makes this a media query rather than a pin: the same exported bytes,
		// read by two different readers. Nothing about the document changes between these.
		const dark = await marksOf('deck-logo-system.md', { osDark: true });
		const light = await marksOf('deck-logo-system.md', { osDark: false });

		assert.equal(dark[0], INVERSE, 'an OS-dark reader gets the inverse mark');
		assert.equal(light[0], LIGHT_FALLBACK, 'an OS-light reader gets the light-canvas mark');
	});
});
