import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The Library's photo detail dialog, driven on the real Studio: open a card, edit description, credit,
// date and name, and prove the record, the reopened dialog and the fit of the dialog at 1440 / 820 / 390.
// A renamed photo keeps its old name as an alias (engineering/decisions/2026-10-12-library-media-assets.md).
// jsdom has no layout, so the fit is only knowable here (HARD RULE #23).

async function addPhoto(page: Page, name: string) {
	await page.evaluate(async (fileName) => {
		const c = document.createElement('canvas');
		c.width = 600;
		c.height = 400;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		g.fillStyle = '#d02828';
		g.fillRect(0, 0, 300, 400);
		g.fillStyle = '#2840d0';
		g.fillRect(300, 0, 300, 400);
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], fileName, { type: 'image/png' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, name);
}

type Row = { name: string; aliases?: string[]; caption?: string; credit?: string; taken?: string };
async function mediaRows(page: Page): Promise<Row[]> {
	return page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: Row[] & { kind?: string }[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as never);
		});
		return (rows as (Row & { kind: string })[]).filter((x) => x.kind === 'image').map(({ name, aliases, caption, credit, taken }) => ({ name, aliases, caption, credit, taken }));
	});
}

async function openLibraryImages(page: Page, width: number) {
	if (width >= 1100) {
		await page.getByRole('button', { name: CHROME.library }).click();
	} else if (width >= 700) {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
		await page.getByRole('menuitem', { name: /^Library/ }).click();
	} else {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: /^Library/ }).click();
	}
	await page.getByRole('tab', { name: 'Images' }).click();
}

/** Wait for the dialog's open animation to end, so a screenshot shows the settled state. */
const settled = (d: ReturnType<Page['locator']>) => d.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => undefined));

for (const vw of [1440, 820, 390]) {
	test.describe(`at ${vw}px`, () => {
		test.use({ viewport: { width: vw, height: vw === 1440 ? 900 : 1000 } });

		test('@smoke a photo\'s description, credit, date and name are editable; a rename keeps the old name as an alias', async ({ page }, testInfo) => {
			test.slow();
			await gotoStudio(page);
			await openLibraryImages(page, vw);
			await addPhoto(page, 'Team Offsite.png');
			const card = page.locator('[data-media-card="team-offsite"]');
			await expect(card).toBeVisible();

			await card.getByRole('button', { name: 'Details for team-offsite' }).click();
			const dialog = page.locator('[data-media-detail="team-offsite"]');
			await expect(dialog).toBeVisible();
			await settled(dialog);

			// The dialog fits the viewport: nothing wider than the screen, and Save is reachable.
			const box = await dialog.boundingBox();
			expect(box && box.x >= 0 && box.x + box.width <= vw + 0.5, `dialog ${JSON.stringify(box)} inside ${vw}px`).toBe(true);
			await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

			await dialog.getByLabel('Description').fill('The team on the "roof" at sunset');
			await dialog.getByLabel('Credit').fill('Ada L.');
			await dialog.getByLabel('Date taken').fill('2026-03-04');
			await dialog.getByLabel('Name').fill('q3-offsite');
			await page.screenshot({ path: testInfo.outputPath(`detail-edit-${vw}.png`) });
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toBeHidden();

			// The record, not just the screen.
			const [row] = await mediaRows(page);
			expect(row).toEqual({ name: 'q3-offsite', aliases: ['team-offsite'], caption: 'The team on the "roof" at sunset', credit: 'Ada L.', taken: '2026-03-04' });

			// The card now shows the description under the new name; reopening shows the alias.
			const renamed = page.locator('[data-media-card="q3-offsite"]');
			await expect(renamed).toContainText('The team on the "roof" at sunset');
			await renamed.getByRole('button', { name: 'Details for q3-offsite' }).click();
			const again = page.locator('[data-media-detail="q3-offsite"]');
			await expect(again.getByText('asset:team-offsite')).toBeVisible();
			await settled(again);
			await page.screenshot({ path: testInfo.outputPath(`detail-alias-${vw}.png`) });

			// Removing the alias frees the name.
			await again.getByRole('button', { name: 'Remove the alias team-offsite' }).click();
			await expect(again.getByText('asset:team-offsite')).toBeHidden();
			expect((await mediaRows(page))[0].aliases).toBeUndefined();
		});
	});
}
