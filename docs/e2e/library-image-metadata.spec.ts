import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

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

test('@smoke a deck that writes the OLD name still paints after a rename, and a new upload cannot take the old name', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Probe Old.png');
	await expect(page.locator('[data-media-card="probe-old"]')).toBeVisible();

	await setEditorContent(page, '# Old name\n\n![A probe](asset:probe-old)\n');
	const img = livePreview(page).locator('img[alt="A probe"]').first();
	await expect(img).toBeVisible({ timeout: 30_000 });
	await expect.poll(async () => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1))).toBe(600);

	// Rename the photo. The deck's text still says `asset:probe-old`, and the slide must still show the photo.
	await page.locator('[data-media-card="probe-old"]').getByRole('button', { name: 'Details for probe-old' }).click();
	const dialog = page.locator('[data-media-detail="probe-old"]');
	await dialog.getByLabel('Name').fill('probe-new');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('[data-media-card="probe-new"]')).toBeVisible();
	const after = livePreview(page).locator('img[alt="A probe"]').first();
	await expect(after).toBeVisible({ timeout: 30_000 });
	await expect.poll(async () => after.getAttribute('src'), { message: 'the old name resolves to an object URL' }).toMatch(/^blob:/);
	await expect.poll(async () => after.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1)), { message: 'the browser LOADED the photo under its old name' }).toBe(600);
	// And the Library counts the deck that still writes the old name.
	await expect(page.locator('[data-media-card="probe-new"]').getByText(/used in 1 deck/)).toBeVisible({ timeout: 15_000 });

	// A new upload named like the old name is renamed, not refused: the old name is held.
	await addPhoto(page, 'Probe Old.png');
	await expect(page.locator('[data-media-card="probe-old-2"]')).toBeVisible();
	await expect(page.getByText(/“probe-old” was taken/)).toBeVisible();
});

test('@smoke a photo\'s description is its alt text: in the preview, live when edited, never over an author\'s own, and in the exported page', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Roof.png');
	await expect(page.locator('[data-media-card="roof"]')).toBeVisible();

	// No description yet: the image has an empty alt, as before.
	await setEditorContent(page, '# Alt\n\n![](asset:roof)\n\n![Mine](asset:roof)\n');
	const imgs = livePreview(page).locator('img[src^="blob:"]');
	await expect(imgs).toHaveCount(2, { timeout: 30_000 });
	await expect(imgs.nth(0)).toHaveAttribute('alt', '');

	// Describe it in the dialog. The empty alt fills, the author's own stays.
	await page.locator('[data-media-card="roof"]').getByRole('button', { name: 'Details for roof' }).click();
	const dialog = page.locator('[data-media-detail="roof"]');
	await dialog.getByLabel('Description').fill('The team on the roof at sunset');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(imgs.nth(0)).toHaveAttribute('alt', 'The team on the roof at sunset', { timeout: 30_000 });
	await expect(imgs.nth(1)).toHaveAttribute('alt', 'Mine');

	// Editing the description updates the slide with no deck edit.
	await page.locator('[data-media-card="roof"]').getByRole('button', { name: 'Details for roof' }).click();
	await dialog.getByLabel('Description').fill('Everyone on the roof');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(imgs.nth(0)).toHaveAttribute('alt', 'Everyone on the roof', { timeout: 30_000 });

	// The exported page carries it too: the empty alt is filled, the author's alt is kept, the photo is pixels.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, 'webpage');
	const html = readFileSync((await (await pending).path()) as string, 'utf8');
	const tags = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => /src="data:image\/png/.test(t));
	// The page shows each photo more than once (the slide and its reading view): every one must carry its alt.
	const alts = tags.map((t) => /\salt="([^"]*)"/.exec(t)?.[1]);
	expect(alts.length).toBeGreaterThanOrEqual(2);
	expect(alts, 'no photo is left with an empty alt').not.toContain('');
	expect([...new Set(alts)].sort()).toEqual(['Everyone on the roof', 'Mine']);
});

/** Add a JPEG whose EXIF holds a description, an artist, a date taken and a GPS latitude: the shape an edited phone photo has. */
async function addExifPhoto(page: Page, name: string) {
	await page.evaluate(async (fileName) => {
		const c = document.createElement('canvas');
		c.width = 800;
		c.height = 600;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		g.fillStyle = '#2f7d4f';
		g.fillRect(0, 0, 800, 600);
		const jpg = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.9))).arrayBuffer());
		const enc = new TextEncoder();
		const be16 = (n: number) => [(n >> 8) & 255, n & 255];
		const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
		type Tag = { tag: number; ascii?: string; ptr?: 'exif' | 'gps' };
		const ifd0: Tag[] = [{ tag: 0x010e, ascii: 'The team on the roof at sunset' }, { tag: 0x013b, ascii: 'Ada Lovelace' }, { tag: 0x8769, ptr: 'exif' }, { tag: 0x8825, ptr: 'gps' }];
		const exif: Tag[] = [{ tag: 0x9003, ascii: '2024:08:15 10:30:00' }];
		const gps: Tag[] = [{ tag: 0x0001, ascii: 'N' }, { tag: 0x0002, ascii: 'lat' }];
		const size = (t: Tag[]) => 2 + t.length * 12 + 4;
		const exifAt = 8 + size(ifd0);
		const gpsAt = exifAt + size(exif);
		const dataAt = gpsAt + size(gps);
		const heap: number[] = [];
		const entries = (tags: Tag[]) => {
			const out = [...be16(tags.length)];
			for (const t of tags) {
				if (t.ptr) out.push(...be16(t.tag), ...be16(4), ...be32(1), ...be32(t.ptr === 'exif' ? exifAt : gpsAt));
				else {
					const v = [...enc.encode(t.ascii as string), 0];
					if (v.length <= 4) out.push(...be16(t.tag), ...be16(2), ...be32(v.length), ...v, ...new Array(4 - v.length).fill(0));
					else {
						out.push(...be16(t.tag), ...be16(2), ...be32(v.length), ...be32(dataAt + heap.length));
						heap.push(...v);
					}
				}
			}
			return [...out, 0, 0, 0, 0];
		};
		const tiff = [0x4d, 0x4d, 0, 42, ...be32(8), ...entries(ifd0), ...entries(exif), ...entries(gps), ...heap];
		const body = [...enc.encode('Exif'), 0, 0, ...tiff];
		const app1 = new Uint8Array([0xff, 0xe1, ...be16(body.length + 2), ...body]);
		const out = new Uint8Array(jpg.length + app1.length);
		out.set(jpg.subarray(0, 2), 0);
		out.set(app1, 2);
		out.set(jpg.subarray(2), 2 + app1.length);
		const dt = new DataTransfer();
		dt.items.add(new File([out], fileName, { type: 'image/jpeg' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, name);
}

test('@smoke a photo\'s own description, artist and date are read at import; its location is flagged and gone', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addExifPhoto(page, 'Sunset Roof.jpg');
	await expect(page.locator('[data-media-card="sunset-roof"]')).toBeVisible();
	await expect(page.getByText(/It has a description in the file: open it to use it/)).toBeVisible();

	// The record: credit and date taken filled, the description held back as a suggestion, the location a fact only.
	const row = await page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: Record<string, unknown>[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as Record<string, unknown>[]);
		});
		const a = rows.find((x) => x.kind === 'image') as Record<string, unknown>;
		const buf = a.blob ? new Uint8Array(await (a.blob as Blob).arrayBuffer()) : new Uint8Array(a.data as ArrayBuffer);
		const head = new TextDecoder('latin1').decode(buf.subarray(0, 65536));
		const { blob: _b, data: _d, ...rest } = a;
		return { rest, exifInBytes: head.includes('Exif\u0000\u0000') };
	});
	expect(row.rest).toMatchObject({ credit: 'Ada Lovelace', taken: '2024-08-15', fileCaption: 'The team on the roof at sunset', hadLocation: true });
	expect(row.rest.caption, 'the file\'s text is a suggestion, not the description').toBeUndefined();
	expect(row.exifInBytes, 'the stored bytes carry no EXIF').toBe(false);
	expect(JSON.stringify(row.rest), 'no coordinate was kept anywhere').not.toMatch(/lat|\d+\.\d{3}/i);

	await page.locator('[data-media-card="sunset-roof"]').getByRole('button', { name: 'Details for sunset-roof' }).click();
	const dialog = page.locator('[data-media-detail="sunset-roof"]');
	await expect(dialog.getByLabel('Credit')).toHaveValue('Ada Lovelace');
	await expect(dialog.getByLabel('Date taken')).toHaveValue('2024-08-15');
	await expect(dialog.getByLabel('Description')).toHaveValue('');
	const fromFile = dialog.locator('[data-from-file]');
	await expect(fromFile).toContainText('The team on the roof at sunset');
	await expect(fromFile).toContainText('carried a location');
	await dialog.getByRole('button', { name: 'Use as description' }).click();
	await expect(dialog.getByLabel('Description')).toHaveValue('The team on the roof at sunset');
	await expect(dialog.getByRole('button', { name: 'Use as description' })).toBeHidden();
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('[data-media-card="sunset-roof"]')).toContainText('The team on the roof at sunset');
});
