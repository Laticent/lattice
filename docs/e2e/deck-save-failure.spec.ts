// A deck save the browser refuses is REPORTED, on the real Studio (HARD RULE #23). A full
// localStorage used to swallow the write in `saveSource`, so the author's edits were lost on
// reload without a word (engineering/decisions/2026-11-11-studio-storage-pointer-records.md §3).
// localStorage's quota is fixed per engine with no switch to lower it, so the refusal is
// simulated the way a full quota throws: `setItem` raises QuotaExceededError for deck sources.
import { appendToEditor, expect, gotoStudio, test, toastText } from './studio-fixture';

for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`deck save failure ${tag}`, () => {
	test('a deck edit the browser refuses says so instead of vanishing', async ({ page }) => {
		await page.addInitScript(() => {
			const setItem = Storage.prototype.setItem;
			Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
				if (key.startsWith('lattice-studio-src-')) throw new DOMException('quota', 'QuotaExceededError');
				return setItem.call(this, key, value);
			};
		});
		await gotoStudio(page);
		await appendToEditor(page, '\n\nAn edit that will not fit');
		await expect(toastText(page)).toContainText("Couldn't save a deck: this browser's storage is full.");
	});
});
