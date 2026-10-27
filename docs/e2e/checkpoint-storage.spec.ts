// Version history storage on the real Studio (HARD RULE #23): checkpoints live in IndexedDB,
// legacy localStorage lists migrate, a saved version survives a reload, and a save that fails
// is REPORTED instead of vanishing (checkpoint-store.ts; slice 0 of
// engineering/decisions/2026-10-27-filo-undo-history.md). Tagged for all three engines:
// WebKit is the engine whose localStorage quota made the old silent loss common.
import { expect, gotoStudio, persistedCheckpoints, test, toastText } from './studio-fixture';

const SNAP = 'lattice-studio-snap-';
const legacy = (id: string, label: string, ts: number) => ({ id, ts, label, source: `# ${label}\n` });

test.describe('version history storage @webkit-tablet @gecko', () => {
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
