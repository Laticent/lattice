import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { expect, gotoStudio, test } from './studio-fixture';

// EXPORTS KEEP THE DECK'S NAME — on every engine, and natively on iOS.
//
// The bug (#2555): every export saved as `<uuid>.<ext>` on the owner's iPhone in Firefox. Firefox
// for iOS saves a page's blob: download with its own script, which names the file after the URL's
// UUID and ignores the `download` attribute. So on iOS EVERY browser — Safari, Firefox, Chrome —
// now saves through the share sheet with a named File, behind one "<file> is ready · Save" toast;
// the desktop keeps a one-tap download named on the URL itself (download.js).
//
// Where each half runs:
//   desktop (Chromium) + gecko (Firefox) — the one-tap download: the saved name is the deck's.
//   mobile (Chromium at phone width) + webkit-phone (real WebKit at iPhone 15 Pro) — the iOS
//     save, once per iOS browser user agent. All three are WebKit on a real iPhone; the user
//     agent is what download.js keys on, and what the Share sheet keys its toast on.
//
// WHAT THIS CANNOT REACH: the iOS share sheet itself, and Firefox for iOS's own download script.
// Neither exists in a Linux browser, so `navigator.share` is stubbed to record what it was handed.
// The test pins everything up to that hand-off — that no link download fires, that one toast
// shows, that its Save button takes a tap over the open Share sheet, that it shares ONE named
// file and no title, and that the toast goes when the author moves on. What iOS then does with
// the file is verified on a device (the owner's iPhone 15 Pro, PR #2555).

const IOS_AGENTS = {
	safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
	firefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/157.0 Mobile/15E148 Safari/604.1',
	chrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
};

const saveToast = (page: Page) => page.locator('[data-sonner-toast]', { hasText: /is ready/ });

async function openExport(page: Page, row: RegExp) {
	await page.getByRole('button', { name: 'Share', exact: true }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: row }).first().click();
}

test('@gecko a desktop export downloads under the deck name, with no Save toast', async ({ page }) => {
	test.setTimeout(180_000);
	await gotoStudio(page);
	await openExport(page, /^PDF/);
	const download = page.waitForEvent('download', { timeout: 150_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Download PDF/ }).click();
	expect((await download).suggestedFilename()).toMatch(/^[a-z0-9-]+\.pdf$/);
	expect((await download).suggestedFilename()).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
	await expect(saveToast(page)).toHaveCount(0);
});

async function iosPage(browser: Browser, userAgent: string): Promise<Page> {
	// A fresh context per user agent, on the project's own device settings (iPhone 15 Pro on
	// webkit-phone, a phone viewport on mobile). `defaultBrowserType` is a device field, not a
	// context option.
	const { defaultBrowserType: _engine, ...use } = test.info().project.use as BrowserContextOptions & { defaultBrowserType?: string };
	const context = await browser.newContext({ ...use, userAgent, hasTouch: true, isMobile: browser.browserType().name() !== 'firefox' });
	const page = await context.newPage();
	await page.addInitScript(() => {
		const w = window as unknown as { __shared: { names: string[]; keys: string[] }[] };
		w.__shared = [];
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (d: ShareData) => {
				w.__shared.push({ names: (d.files ?? []).map((f) => f.name), keys: Object.keys(d) });
			},
		});
	});
	return page;
}

for (const [name, ua] of Object.entries(IOS_AGENTS)) {
	test(`@mobile @webkit-phone iOS ${name}: an export ends in one Save toast that shares the named file`, async ({ browser }) => {
		test.setTimeout(240_000);
		const page = await iosPage(browser, ua);
		const downloads: string[] = [];
		page.on('download', (d) => downloads.push(d.suggestedFilename()));
		await gotoStudio(page);

		// 1 · Export: one toast, naming the file, with a Save button — and no link download.
		await openExport(page, /^PDF/);
		await page.getByRole('dialog').getByRole('button', { name: /^Download PDF/ }).click();
		await expect(saveToast(page)).toHaveCount(1, { timeout: 150_000 });
		await expect(saveToast(page)).toContainText(/\.pdf is ready/);
		await expect(page.locator('[data-sonner-toast]', { hasText: /^PDF ready\.?$/ }), 'the Share sheet\'s own "ready." doubles the Save toast').toHaveCount(0);
		expect(downloads, 'an iOS export must not fall back to a link download (Firefox names it after the UUID)').toEqual([]);

		// 2 · Save takes a TAP over the open, modal Share sheet, and shares one named file, no title.
		await saveToast(page).getByRole('button', { name: 'Save' }).tap();
		const shared = await page.evaluate(() => (window as unknown as { __shared: { names: string[]; keys: string[] }[] }).__shared);
		expect(shared).toHaveLength(1);
		expect(shared[0].names).toHaveLength(1);
		expect(shared[0].names[0]).toMatch(/^[a-z0-9-]+\.pdf$/);
		expect(shared[0].keys, 'a title rides along as a second item, which Save to Files writes out as a text file').toEqual(['files']);

		// 3 · A waiting Save toast goes when the author moves on to another format.
		await page.getByRole('button', { name: /All formats/ }).click();
		await page.getByRole('dialog').getByRole('button', { name: /^PowerPoint/ }).first().click();
		await page.getByRole('dialog').getByRole('button', { name: /^Download PowerPoint/ }).click();
		await expect(saveToast(page)).toContainText(/\.pptx is ready/, { timeout: 150_000 });
		await page.getByRole('button', { name: /All formats/ }).click();
		await expect(saveToast(page)).toHaveCount(0);
		await page.context().close();
	});
}
