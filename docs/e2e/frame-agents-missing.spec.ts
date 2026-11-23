import { expect, gotoStudio, test } from './studio-fixture';

// The preview frames' agents ride in one fetched file (lib/core/frame-agents.mjs). Before it, they
// were inline and ran whatever else failed to load; a file that 404s after a deploy, or a load the
// browser refuses, must not leave a blank pane or a blank projector (found by the inversion lens on
// #3307). A real 404, not an abort: it is what a stale page meets.
const missing = async (context: import('@playwright/test').BrowserContext) =>
	context.route('**/lattice-frame-agents.js', (r) => r.fulfill({ status: 404, body: 'not found' }));

test('a preview whose agents file is missing still shows its slides @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await missing(context);
	// The Playground's filmstrip (deck-preview.js), the frame that hid its slides until the fit agent ran.
	await page.goto('/playground/');
	const frame = page.frameLocator('iframe[title]').first();
	await expect(frame.locator('.lattice > section').first()).toBeAttached();
	await expect(frame.locator('.lattice')).toHaveCSS('visibility', 'visible');
});

test('a Stage whose agents file is missing shows the deck and tells the presenter @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await gotoStudio(page);
	await missing(context);
	// Accumulated, not sampled: a toast leaves the DOM after a few seconds (stage-window.spec.ts, §12).
	await page.evaluate(() => {
		const w = window as unknown as { __toastLog: string[] };
		w.__toastLog = [];
		new MutationObserver(() => {
			for (const el of document.querySelectorAll('[data-sonner-toast]')) {
				const t = (el.textContent ?? '').trim();
				if (t && !w.__toastLog.includes(t)) w.__toastLog.push(t);
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	// Chromium stops parsing the written document at the failed script and never fires `load`, so there
	// the opener's deadline (stage-window.js AGENTS_DEADLINE_MS, 10 s) is what answers.
	await expect(stage.locator('#latt-stage')).toBeVisible({ timeout: 20_000 });
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __toastLog: string[] }).__toastLog), { timeout: 20_000 })
		.toContainEqual(expect.stringMatching(/could not load its player/));
});
