// Version history storage on the real Studio (HARD RULE #23): checkpoints live in IndexedDB,
// legacy localStorage lists migrate, a saved version survives a reload, and a save that fails
// is REPORTED instead of vanishing (checkpoint-store.ts; slice 0 of
// engineering/decisions/2026-10-27-filo-undo-history.md). Runs in all three engines:
// WebKit is the engine whose localStorage quota made the old silent loss common.
import { appendToEditor, expect, gotoStudio, persistedCheckpoints, test, toastText } from './studio-fixture';

const SNAP = 'lattice-studio-snap-';
const legacy = (id: string, label: string, ts: number) => ({ id, ts, label, source: `# ${label}\n` });

// One body, two tags: `@gecko` runs on desktop Chromium AND Firefox; `@webkit-tablet` runs on
// WebKit (desktop's grepInvert leaves WebKit-tagged specs to the WebKit projects).
for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`version history storage ${tag}`, () => {
	test('a legacy localStorage list migrates into IndexedDB and still shows in Version history', async ({ page }) => {
		await page.addInitScript(
			([key, list]) => {
				// Seed only on the first load, as an older build would have left it.
				if (!sessionStorage.getItem('seeded')) {
					localStorage.setItem(key as string, JSON.stringify(list));
					sessionStorage.setItem('seeded', '1');
				}
			},
			[`${SNAP}welcome`, [legacy('cp-old-2', 'Old version two', 2_000), legacy('cp-old-1', 'Old version one', 1_000)]],
		);
		await gotoStudio(page);
		await expect.poll(() => persistedCheckpoints(page)).toEqual(expect.objectContaining({ welcome: 2 }));
		await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), `${SNAP}welcome`)).toBeNull();
		await page.reload();
		await page.getByRole('button', { name: 'Version history' }).click();
		await expect(page.getByText('Old version two')).toBeVisible();
		await expect(page.getByText('Old version one')).toBeVisible();
	});

	test('a saved version survives a reload', async ({ page }) => {
		await gotoStudio(page);
		await page.getByRole('button', { name: 'Version history' }).click();
		await page.getByRole('button', { name: 'Save a version' }).click();
		await expect(toastText(page)).toContainText('Version saved');
		await expect.poll(async () => Object.values(await persistedCheckpoints(page)).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
		await page.reload();
		await page.getByRole('button', { name: 'Version history' }).click();
		await expect(page.getByText('Saved version').first()).toBeVisible();
	});

	test('a save that fails says so instead of vanishing', async ({ page }) => {
		// Every checkpoint write fails the way a full quota does.
		await page.addInitScript(() => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
				if (this.name === 'checkpoints') throw new DOMException('quota', 'QuotaExceededError');
				return put.apply(this, args);
			};
		});
		await gotoStudio(page);
		await page.getByRole('button', { name: 'Version history' }).click();
		await page.getByRole('button', { name: 'Save a version' }).click();
		await expect(toastText(page)).toContainText("Couldn't save this version: this browser's storage is full.");
		// Still listed for this session, as the notice promises.
		await expect(page.getByText('Saved version').first()).toBeVisible();
	});
});

// A REAL quota, not a faked `put`: Chromium enforces a per-origin quota set over the DevTools
// protocol, so the browser itself refuses the write and aborts the transaction, which is the
// path a real full disk takes. (WebKit and Firefox have no equivalent switch, so this one runs on
// Chromium; the faked failure above covers their notice.)
test('a save the browser refuses for quota says so, and nothing half-written survives', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'quota override is a Chromium DevTools feature');
	await gotoStudio(page);
	const before = await persistedCheckpoints(page);
	const origin = new URL(page.url()).origin;
	const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: usage + 256 });
	try {
		await page.getByRole('button', { name: 'Version history' }).click();
		await page.getByRole('button', { name: 'Save a version' }).click();
		await expect(toastText(page)).toContainText("Couldn't save this version: this browser's storage is full.");
		expect(await persistedCheckpoints(page), 'the refused version did not land').toEqual(before);
	} finally {
		await cdp.send('Storage.overrideQuotaForOrigin', { origin });
	}
});

// Two REAL tabs: two pages in one browser context share IndexedDB and the BroadcastChannel,
// as two tabs of one browser do. Neither may erase the version the other saved.
test('two tabs on one deck keep both of their versions', async ({ page, context }) => {
	await gotoStudio(page);
	const second = await context.newPage();
	await gotoStudio(second);
	// Each tab saves a DIFFERENT text: a save identical to the newest version is skipped on
	// purpose, and tab two hears tab one's version over the channel, so the same text would
	// (correctly) save nothing.
	for (const [tab, line] of [
		[page, 'From the first tab.'],
		[second, 'From the second tab.'],
	] as const) {
		await appendToEditor(tab, `\n\n${line}`);
		await tab.getByRole('button', { name: 'Version history' }).click();
		await tab.getByRole('button', { name: 'Save a version' }).click();
		await expect(toastText(tab)).toContainText('Version saved');
		await tab.keyboard.press('Escape');
	}
	await expect.poll(async () => Object.values(await persistedCheckpoints(page)).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
	await second.close();
	await page.reload();
	await page.getByRole('button', { name: 'Version history' }).click();
	await expect(page.getByText('Saved version')).toHaveCount(2);
});
