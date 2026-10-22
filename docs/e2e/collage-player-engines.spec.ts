import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Page, test } from '@playwright/test';

// The exported player's collage lightbox wheel and digits, in the OTHER two engine families.
// @gecko @webkit-tablet
//
// `test/integration/export/collage-player.test.js` drives the real export of `examples/collage.md`
// through Puppeteer, which has Chromium only. Its wheel arm ("a plain wheel flick steps the photo
// ... and does not turn the slide behind it") is the one that matters most across engines: the
// player listens for `wheel` on the WINDOW and turns a slide on a decisive flick, and the lightbox
// must stop that event before it gets there (`e.stopPropagation()` in
// `lib/core/collage-lightbox.mjs`). Whether a `wheel` listener on a dialog root reaches a window
// listener the same way, and whether `preventDefault` on it holds, is engine behavior. This spec
// runs the same assertions on the same built file in Firefox and WebKit (#2648 P2).
//
// A CONTROL ARM SITS FIRST. "The deck did not move" proves nothing if the player's wheel listener
// never fires in that engine (it returns early outside Present). So arm 1 wheels the CLOSED deck
// and requires the slide to turn; only then does arm 2's unchanged index mean the lightbox stopped it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let html = '';

test.beforeAll(async (_fixtures, testInfo) => {
	test.setTimeout(300_000);
	const dir = testInfo.outputDir;
	fs.mkdirSync(dir, { recursive: true });
	html = path.join(dir, 'collage.html');
	// Same hand-off as export-subresource-engines.spec.ts: the emulator needs a Chrome binary, and
	// this tier already installs Playwright's.
	const res = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'examples', 'collage.md'), html, '--player', '-q'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 280_000,
		env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
	});
	expect(res.status, `the export itself succeeded — stderr: ${(res.stderr || '').slice(-800)}`).toBe(0);
});

const slideIndex = (page: Page) =>
	page.evaluate(() => [...document.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active')));
const counter = (page: Page) => page.locator('.collage-lightbox p').nth(1);

async function openCollage(page: Page) {
	await page.goto(`file://${html}`);
	await expect(page.locator('.lp-frame.lp-active')).toHaveCount(1);
	await page.keyboard.press('ArrowRight'); // slide 2 is the first collage
	await expect(page.locator('.lp-active .collage-tile > img').first()).toBeVisible();
	await expect.poll(() => slideIndex(page)).toBe(1);
}

test('a wheel flick turns the closed deck: the control for the lightbox arm', async ({ page }) => {
	await openCollage(page);
	const before = await slideIndex(page);
	await page.mouse.move(400, 300);
	await page.mouse.wheel(0, 240);
	await expect.poll(() => slideIndex(page), { message: 'the player\'s own wheel listener is live in this engine' }).toBe(before + 1);
});

test('the open lightbox takes the wheel and digits and the deck behind does not turn', async ({ page }) => {
	await openCollage(page);
	const before = await slideIndex(page);
	const n = await page.locator('.lp-active .collage-tile').count();
	expect(n).toBeGreaterThanOrEqual(4);
	await page.locator('.lp-active .collage-tile > img').first().click();
	await expect(page.locator('dialog.collage-lightbox[open]')).toBeVisible();
	await expect(counter(page)).toHaveText(`1 / ${n}`);

	// A burst of two decisive notches is one step (the lightbox's own wheel gate), and no notch
	// reaches the window listener that would have turned the slide.
	await page.mouse.move(400, 300);
	await page.mouse.wheel(0, 120);
	await page.mouse.wheel(0, 120);
	await expect(counter(page)).toHaveText(`2 / ${n}`);
	// Settle past the player's 350 ms wheel cooldown so a leaked event would have fired by now.
	await page.waitForTimeout(600);
	expect(await slideIndex(page), 'the deck behind did not turn').toBe(before);

	await page.keyboard.press('3');
	await expect(counter(page)).toHaveText(`3 / ${n}`);
	expect(await slideIndex(page), 'and the deck did not hear the digit').toBe(before);

	// Closing returns the wheel to the deck.
	await page.keyboard.press('Escape');
	await expect(page.locator('.collage-lightbox')).toHaveCount(0);
	await page.waitForTimeout(600);
	await page.mouse.wheel(0, 240);
	await expect.poll(() => slideIndex(page), { message: 'the wheel is the deck\'s again once the photo closes' }).toBe(before + 1);
});
