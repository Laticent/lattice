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
	await confirmFormat(page);
}

/** The format dialog asks how to store the photo; these tests take its default. */
async function confirmFormat(page: Page) {
	await page.getByRole('dialog').getByRole('button', { name: /^Add photo/ }).click();
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
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
}

/** Open the Old names section if it is shut (it opens itself only while a deck still writes an old name). */
async function openOldNames(dialog: ReturnType<Page['locator']>) {
	const trigger = dialog.getByRole('button', { name: /^Old names/ });
	await expect(trigger).toBeVisible();
	if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

/** Wait for the dialog's open animation to end, so a screenshot shows the settled state. */
const settled = (d: ReturnType<Page['locator']>) => d.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => undefined));

/** Wait until a deck's text has reached storage: the shell saves the open deck on a short debounce. */
async function savedDeckWith(page: Page, text: string) {
	await expect
		.poll(() =>
			page.evaluate((needle) => {
				for (let i = 0; i < localStorage.length; i++) {
					const k = localStorage.key(i) as string;
					if (k.startsWith('lattice-studio-src-') && (localStorage.getItem(k) ?? '').includes(needle)) return true;
				}
				return false;
			}, text),
		{ message: `a deck holding "${text}" is saved`, timeout: 15_000 })
		.toBe(true);
}

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

			// One control system: the inputs are one height and the Credit | Date pair is one width; Name takes the column; and the
			// Save row is on screen without scrolling the dialog.
			const g = await dialog.evaluate((el) => {
				const r = (sel: string) => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
				const credit = r('input[placeholder="Photographer"]');
				const date = r('input[type="date"]');
				const nameField = [...el.querySelectorAll('input')].find((i) => i.id.endsWith('-name')) as HTMLElement;
				const name = nameField.getBoundingClientRect();
				const save = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save') as HTMLElement;
				const body = (el.querySelector('form > div') as HTMLElement).getBoundingClientRect();
				return { credit: [credit.width, credit.height], date: [date.width, date.height], name: [name.width, name.height], saveBottom: save.getBoundingClientRect().bottom, bodyWidth: body.width };
			});
			expect(g.credit[1], 'Credit and Date and Name are one height').toBe(g.date[1]);
			expect(g.name[1]).toBe(g.date[1]);
			expect(Math.abs(g.credit[0] - g.date[0]), 'Credit and Date are one width').toBeLessThanOrEqual(1);
			expect(g.name[0], 'Name takes the column').toBeGreaterThan(g.credit[0] * 1.9);
			expect(g.saveBottom, 'Save is on screen').toBeLessThanOrEqual(vw === 1440 ? 900 : 1000);

			await dialog.getByLabel('Description', { exact: true }).fill('The team on the "roof" at sunset');
			await dialog.getByLabel('Credit', { exact: true }).fill('Ada L.');
			await dialog.getByLabel('Date taken', { exact: true }).fill('2026-03-04');
			await dialog.getByLabel('Name', { exact: true }).fill('q3-offsite');
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
			await openOldNames(again);
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

test('@smoke a deck that writes the OLD name still paints after a rename, and a new upload cannot take the old name @crosswidth @webkit-tablet @gecko', async ({ page }) => {
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
	await dialog.getByLabel('Name', { exact: true }).fill('probe-new');
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

test('@smoke a photo\'s description is its alt text: in the preview, live when edited, never over an author\'s own, and in the exported page @crosswidth @webkit-tablet @gecko', async ({ page }) => {
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
	await dialog.getByLabel('Description', { exact: true }).fill('The team on the roof at sunset');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(imgs.nth(0)).toHaveAttribute('alt', 'The team on the roof at sunset', { timeout: 30_000 });
	await expect(imgs.nth(1)).toHaveAttribute('alt', 'Mine');

	// Editing the description updates the slide with no deck edit.
	await page.locator('[data-media-card="roof"]').getByRole('button', { name: 'Details for roof' }).click();
	await dialog.getByLabel('Description', { exact: true }).fill('Everyone on the roof');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(imgs.nth(0)).toHaveAttribute('alt', 'Everyone on the roof', { timeout: 30_000 });

	// The exported page carries it too: the empty alt is filled, the author's alt is kept, the photo is pixels.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, 'webpage');
	const html = readFileSync((await (await pending).path()) as string, 'utf8');
	const tags = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => /src="data:image\/(?:png|jpeg|webp)/.test(t));
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
	await confirmFormat(page);
}

test('@smoke a photo\'s own description, artist and date are read at import; its location is flagged and gone @crosswidth @webkit-tablet @gecko', async ({ page }) => {
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
	await expect(dialog.getByLabel('Credit', { exact: true })).toHaveValue('Ada Lovelace');
	await expect(dialog.getByLabel('Date taken', { exact: true })).toHaveValue('2024-08-15');
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('');
	const fromFile = dialog.locator('[data-from-file]');
	await expect(fromFile).toContainText('The team on the roof at sunset');
	await expect(fromFile).toContainText('carried a location');
	await dialog.getByRole('button', { name: 'Use as description' }).click();
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('The team on the roof at sunset');
	await expect(dialog.getByRole('button', { name: 'Use as description' })).toBeHidden();
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('[data-media-card="sunset-roof"]')).toContainText('The team on the roof at sunset');
});

test('@smoke "Use new name" rewrites the decks that write an old name, leaves code samples as written, and keeps an undo', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Old Name.png');
	await expect(page.locator('[data-media-card="old-name"]')).toBeVisible();
	await setEditorContent(page, '# Names\n\n![A probe](asset:old-name)\n\nWrite `asset:old-name` in a deck.\n');
	const img = livePreview(page).locator('img[alt="A probe"]').first();
	await expect(img).toBeVisible({ timeout: 30_000 });

	await page.locator('[data-media-card="old-name"]').getByRole('button', { name: 'Details for old-name' }).click();
	const dialog = page.locator('[data-media-detail="old-name"]');
	await dialog.getByLabel('Name', { exact: true }).fill('new-name');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();

	await page.locator('[data-media-card="new-name"]').getByRole('button', { name: 'Details for new-name' }).click();
	const again = page.locator('[data-media-detail="new-name"]');
	await expect(again.locator('li').getByText('in 1 deck')).toBeVisible({ timeout: 15_000 });
	await again.getByRole('button', { name: 'Use new name in the deck' }).click();

	// The deck text: the reference that renders is renamed, the sample inside code is not.
	const editor = page.locator('.cm-content[aria-label="Deck source"]');
	await expect(editor).toContainText('![A probe](asset:new-name)', { timeout: 15_000 });
	await expect(editor).toContainText('Write `asset:old-name` in a deck.');
	await expect(again.locator('li').getByText('not used in a deck')).toBeVisible({ timeout: 15_000 });
	// The picture is still there, now under its current name.
	await expect(livePreview(page).locator('img[alt="A probe"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	await expect(page.getByText(/Updated 1 deck to asset:new-name/)).toBeVisible();

	// The way back: the deck's Version history holds the text from before.
	const stored = await page.evaluate(() => {
		const out: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i) as string;
			if (/snap|checkpoint/i.test(k)) out.push(localStorage.getItem(k) ?? '');
		}
		return out.join('\n');
	});
	expect(stored).toContain('Before using asset:new-name');
	expect(stored).toContain('![A probe](asset:old-name)');
});

test('@smoke "Use new name" also rewrites a deck that is not open, and says how many it changed', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Shared Probe.png');
	await expect(page.locator('[data-media-card="shared-probe"]')).toBeVisible();
	await setEditorContent(page, '# Deck A\n\n![A probe](asset:shared-probe)\n');
	await expect(livePreview(page).locator('img[alt="A probe"]').first()).toBeVisible({ timeout: 30_000 });
	// The shell saves the source on a short debounce; wait for it to land before the second deck opens.
	await savedDeckWith(page, 'Deck A');

	// A second deck, which becomes the open one. Deck A is then a stored deck.
	await page.locator('header').getByRole('button', { name: /slides?$|Untitled deck|Markdown for the boardroom/ }).first().click();
	await page.getByRole('menuitem', { name: 'New deck' }).click();
	const craft = page.locator('header').getByText('Craft', { exact: true });
	if (await craft.isVisible().catch(() => false)) await craft.click();
	await setEditorContent(page, '# Deck B\n\n![B probe](asset:shared-probe)\n');
	await expect(livePreview(page).locator('img[alt="B probe"]').first()).toBeVisible({ timeout: 30_000 });
	await savedDeckWith(page, 'Deck B');

	// The docked Library may already be open from the first deck: the toolbar button toggles it, so only press it when closed.
	const mediaPill = page.getByRole('tab', { name: 'Media', exact: true });
	if (!(await mediaPill.isVisible().catch(() => false))) await page.getByRole('button', { name: CHROME.library }).click();
	await mediaPill.click();
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await page.locator('[data-media-card="shared-probe"]').getByRole('button', { name: 'Details for shared-probe' }).click();
	const dialog = page.locator('[data-media-detail="shared-probe"]');
	await dialog.getByLabel('Name', { exact: true }).fill('team-probe');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await page.locator('[data-media-card="team-probe"]').getByRole('button', { name: 'Details for team-probe' }).click();
	const again = page.locator('[data-media-detail="team-probe"]');
	await expect(again.locator('li').getByText('in 2 decks')).toBeVisible({ timeout: 15_000 });
	await again.getByRole('button', { name: 'Use new name in decks' }).click();
	await expect(page.getByText(/Updated 2 decks to asset:team-probe/)).toBeVisible({ timeout: 15_000 });

	// Both decks now say the new name: the open one in the editor, the other in storage.
	await expect(page.locator('.cm-content[aria-label="Deck source"]')).toContainText('![B probe](asset:team-probe)');
	// The open deck reaches storage on the shell's short save debounce, so wait for it.
	await expect
		.poll(
			async () => {
				const stored = await page.evaluate(() => {
					const out: string[] = [];
					for (let i = 0; i < localStorage.length; i++) {
						const k = localStorage.key(i) as string;
						if (k.startsWith('lattice-studio-src-')) out.push(localStorage.getItem(k) ?? '');
					}
					return out;
				});
				const probes = stored.filter((t) => /probe/.test(t));
				return probes.length === 2 && probes.every((t) => t.includes('asset:team-probe') && !t.includes('asset:shared-probe'));
			},
			{ message: 'both decks, the open one and the stored one, name the photo by its new name', timeout: 15_000 },
		)
		.toBe(true);
});

// ── Suggest: the connected model drafts a description ──────────────────────────────────────────────────────
// OpenRouter is MOCKED (HARD RULE #24): no test spends the owner's budget. What this proves on the real Studio is the
// wiring: the real thumbnail goes out as an image part, the reply lands in the editable field and is NOT saved until Save,
// and a missing connection or a model that cannot read images gets a plain line, not a silent button.
const MOCK_MODEL = '~anthropic/claude-sonnet-latest';

type OrBody = { model?: string; reasoning?: { effort?: string }; messages: { role: string; content: unknown }[] };
async function mockOpenRouter(page: Page, opts: { key: boolean; vision: boolean; reply?: string; settings?: Record<string, unknown> }): Promise<{ bodies: OrBody[] }> {
	await page.addInitScript(
		({ withKey, settings }) => {
			try {
				if (withKey) localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
				localStorage.setItem('lattice-db-dedup', 'off');
				if (settings) localStorage.setItem('lattice-studio-settings', JSON.stringify(settings));
			} catch {
				/* storage unavailable: the spec fails loudly on the missing control */
			}
		},
		{ withKey: opts.key, settings: opts.settings ?? null },
	);
	const seen: { bodies: OrBody[] } = { bodies: [] };
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/chat/completions')) {
			const body = route.request().postDataJSON() as OrBody & { stream?: boolean };
			seen.bodies.push(body);
			const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 };
			const text = opts.reply ?? 'a team on a roof';
			if (body.stream) {
				const frames = [
					{ id: 'gen-1', choices: [{ index: 0, delta: { content: text } }] },
					{ id: 'gen-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
				];
				await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n` });
			} else {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'gen-1', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage }) });
			}
		} else if (url.endsWith('/models') || url.includes('/models?')) {
			const entry = (id: string, name: string, vision: boolean) => ({ id, name, pricing: { prompt: '0.000003', completion: '0.000015' }, context_length: 200000, architecture: { input_modalities: vision ? ['text', 'image'] : ['text'] } });
			const data = [entry(MOCK_MODEL, 'Mock model', opts.vision), entry('openai/gpt-5', 'OpenAI: GPT-5', true), entry('deepseek/deepseek-chat', 'DeepSeek: Chat', false)];
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
		} else {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
		}
	});
	return seen;
}

async function openPhotoDialog(page: Page, name: string): Promise<ReturnType<Page['locator']>> {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, `${name}.png`);
	await expect(page.locator(`[data-media-card="${name}"]`)).toBeVisible();
	await page.locator(`[data-media-card="${name}"]`).getByRole('button', { name: `Details for ${name}` }).click();
	const dialog = page.locator(`[data-media-detail="${name}"]`);
	await expect(dialog).toBeVisible();
	return dialog;
}

test('@smoke Suggest drafts a description from the real thumbnail; it is not saved until Save', async ({ page }) => {
	test.slow();
	const seen = await mockOpenRouter(page, { key: true, vision: true, reply: JSON.stringify({ name: 'Team on the Roof', description: '"A team standing on a roof at sunset."' }) });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'suggest-me');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('A team standing on a roof at sunset.', { timeout: 30_000 });

	// What went to the model: an image part carrying a small JPEG thumbnail, and the no-guessing contract.
	expect(seen.bodies).toHaveLength(1);
	// The default image model is the latest Sonnet, at the Careful look: no reasoning asked for.
	expect(seen.bodies[0].model).toBe('~anthropic/claude-sonnet-latest');
	expect(seen.bodies[0].reasoning).toBeUndefined();
	const [sys, user] = seen.bodies[0].messages;
	// The system message may arrive as cache-wrapped text parts, so read its text whichever shape it has.
	expect(JSON.stringify(sys.content)).toMatch(/Never guess names, places, brands/);
	const parts = user.content as { type: string; image_url?: { url: string } }[];
	const img = parts.find((p) => p.type === 'image_url')?.image_url?.url ?? '';
	expect(img.startsWith('data:image/jpeg;base64,')).toBe(true);
	expect(img.length, 'a thumbnail, not the stored photo').toBeLessThan(400_000);
	// The name is offered, not applied: `suggest-me` is a name the person chose.
	await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('suggest-me');
	await expect(dialog.locator('[data-suggested-name]')).toContainText('team-on-the-roof');

	// A draft only: the record holds no description until Save.
	const before = await page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: { kind: string; caption?: string }[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as never);
		});
		return rows.find((x) => x.kind === 'image')?.caption;
	});
	expect(before).toBeUndefined();
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	expect((await mediaRows(page))[0].caption).toBe('A team standing on a roof at sunset.');
});

test('@smoke Suggest says plainly when the model cannot read images, and when no model is connected', async ({ page }) => {
	test.slow();
	await mockOpenRouter(page, { key: true, vision: false });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'no-vision');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByText(/can't read images/)).toBeVisible({ timeout: 30_000 });
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('');
});

test('@smoke Suggest with no model connected points to Setup and sends nothing', async ({ page }) => {
	test.slow();
	const seen = await mockOpenRouter(page, { key: false, vision: true });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'no-key');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByText(/Connect your OpenRouter account in Setup/)).toBeVisible({ timeout: 30_000 });
	expect(seen.bodies, 'no photo left the browser').toHaveLength(0);
});

test('@smoke the detail view works from the keyboard: Enter opens it, Tab stays inside, Enter saves, Escape closes and returns focus', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Keys.png');
	const thumb = page.locator('[data-media-card="keys"]').getByRole('button', { name: 'Details for keys' });
	await expect(thumb).toBeVisible();

	// Open it with the keyboard.
	await thumb.focus();
	await page.keyboard.press('Enter');
	const dialog = page.locator('[data-media-detail="keys"]');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

	// Focus never leaves the dialog while tabbing around it.
	for (let i = 0; i < 14; i++) {
		await page.keyboard.press('Tab');
		expect(await page.evaluate(() => !!document.activeElement?.closest('[data-media-detail]')), `Tab ${i + 1} stays inside the dialog`).toBe(true);
	}

	// Enter in the description saves it (the description is one line), and the dialog closes.
	await dialog.getByLabel('Description', { exact: true }).fill('Pressed Enter to save');
	await page.keyboard.press('Enter');
	await expect(dialog).toBeHidden();
	expect((await mediaRows(page))[0].caption).toBe('Pressed Enter to save');

	// Escape closes without saving, and focus goes back to the control that opened it.
	await thumb.focus();
	await page.keyboard.press('Enter');
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Credit', { exact: true }).fill('Not saved');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(thumb).toBeFocused();
	expect((await mediaRows(page))[0].credit).toBeUndefined();
});

test('@smoke "Use new name" says so when the browser has no room, and rewrites nothing it could not undo', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Full Disk.png');
	await expect(page.locator('[data-media-card="full-disk"]')).toBeVisible();
	await setEditorContent(page, '# Deck A\n\n![A probe](asset:full-disk)\n');
	await savedDeckWith(page, 'Deck A');

	// A second deck becomes the open one; deck A is then a stored deck that still writes the old name.
	await page.locator('header').getByRole('button', { name: /slides?$|Untitled deck|Markdown for the boardroom/ }).first().click();
	await page.getByRole('menuitem', { name: 'New deck' }).click();
	const craft = page.locator('header').getByText('Craft', { exact: true });
	if (await craft.isVisible().catch(() => false)) await craft.click();

	// The Library button TOGGLES the panel, and "New deck" and the Craft switch re-render the shell
	// after their clicks return. A one-shot `isVisible()` read mid-re-render chose wrong on a CI
	// runner (#2739: the tab was never found, twice) while passing every local run, so open it until
	// the tab is really there. A Library that cannot open still fails here, after 15 s.
	const mediaPill = page.getByRole('tab', { name: 'Media', exact: true });
	await expect(async () => {
		if (!(await mediaPill.isVisible())) await page.getByRole('button', { name: CHROME.library }).click();
		await expect(mediaPill).toBeVisible({ timeout: 2_000 });
		await mediaPill.click({ timeout: 2_000 });
		await page.getByRole('tab', { name: 'Images' }).click({ timeout: 2_000 });
	}).toPass({ timeout: 15_000 });
	await page.locator('[data-media-card="full-disk"]').getByRole('button', { name: 'Details for full-disk' }).click();
	const first = page.locator('[data-media-detail="full-disk"]');
	await first.getByLabel('Name', { exact: true }).fill('roomy');
	await first.getByRole('button', { name: 'Save' }).click();
	await expect(first).toBeHidden();

	// From here the browser refuses to store a Version history entry, as it does when its storage is full.
	await page.evaluate(() => {
		const real = Storage.prototype.setItem;
		Storage.prototype.setItem = function (k: string, v: string) {
			if (k.startsWith('lattice-studio-snap')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
			return real.call(this, k, v);
		};
	});
	await page.locator('[data-media-card="roomy"]').getByRole('button', { name: 'Details for roomy' }).click();
	const dialog = page.locator('[data-media-detail="roomy"]');
	const row = dialog.locator('li').filter({ hasText: 'asset:full-disk' });
	// No `if`: the button MUST be there, or the setup is wrong and this test would prove nothing.
	await expect(row.getByRole('button', { name: /Use new name/ })).toBeVisible({ timeout: 15_000 });
	await row.getByRole('button', { name: /Use new name/ }).click();
	await expect(dialog.getByRole('alert')).toContainText(/no room left/, { timeout: 15_000 });
	await expect(page.getByText(/Updated \d+ decks? to asset:roomy/)).toHaveCount(0);
	// Nothing was rewritten on the promise of an undo that could not be written.
	const stored = await page.evaluate(() => {
		const out: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i) as string;
			if (k.startsWith('lattice-studio-src-')) out.push(localStorage.getItem(k) ?? '');
		}
		return out.filter((t) => t.includes('Deck A'));
	});
	expect(stored).toHaveLength(1);
	expect(stored[0]).toContain('asset:full-disk');
	expect(stored[0]).not.toContain('asset:roomy');
});

// ── Polish found on a phone: layout, the edit button, the picture after a save, the name, and the image model ─────────────────

test('@smoke a camera-made name is replaced by the suggested one, and the old name stays as an alias', async ({ page }) => {
	test.slow();
	await mockOpenRouter(page, { key: true, vision: true, reply: JSON.stringify({ name: 'Black Suede Brogue', description: 'Black suede and polished leather dress shoe on a dark surface.' }) });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'img-4568');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('black-suede-brogue', { timeout: 30_000 });
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Black suede and polished leather dress shoe on a dark surface.');
	await expect(dialog.getByRole('status')).toContainText('Nothing is saved until you press Save');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	const [row] = await mediaRows(page);
	expect(row).toMatchObject({ name: 'black-suede-brogue', aliases: ['img-4568'] });
});

test('@smoke the image model and the look come from the workspace settings', async ({ page }) => {
	test.slow();
	const seen = await mockOpenRouter(page, { key: true, vision: true, reply: JSON.stringify({ name: 'x-ray', description: 'A chest x-ray on a light box.' }), settings: { imageModel: 'openai/gpt-5', imageLook: 'thorough' } });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'scan-me');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('A chest x-ray on a light box.', { timeout: 30_000 });
	expect(seen.bodies[0].model).toBe('openai/gpt-5');
	expect(seen.bodies[0].reasoning).toEqual({ effort: 'medium' });
	const parts = seen.bodies[0].messages[1].content as { type: string; image_url?: { url: string } }[];
	expect(parts.find((p) => p.type === 'image_url')?.image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true);
});

test('@smoke Suggest says plainly when the chosen image model cannot read images', async ({ page }) => {
	test.slow();
	await mockOpenRouter(page, { key: true, vision: true, settings: { imageModel: 'deepseek/deepseek-chat' } });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'blind-model');
	await dialog.getByRole('button', { name: 'Suggest a name and description' }).click();
	await expect(dialog.getByText(/image model you picked can't read images/)).toBeVisible({ timeout: 30_000 });
});

test('@smoke Workspace → Model has an Image model picker (vision models only, the latest Sonnet by default) and a Look closer dial', async ({ page }) => {
	test.slow();
	await mockOpenRouter(page, { key: true, vision: true });
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.workspaceSettings, exact: true }).first().click();
	const panel = page.locator('[data-image-model-settings]');
	await panel.scrollIntoViewIfNeeded();
	await expect(panel.getByText('Latest Claude Sonnet')).toBeVisible({ timeout: 30_000 });
	await expect(panel.getByRole('button', { name: 'Careful' })).toHaveAttribute('aria-pressed', 'true');

	await panel.getByRole('button', { name: 'Thorough' }).click();
	await expect(panel.getByRole('button', { name: 'Thorough' })).toHaveAttribute('aria-pressed', 'true');
	await expect(panel).toContainText('the model thinks before it answers');

	await panel.getByRole('button', { name: /Latest Claude Sonnet/ }).click();
	await expect(panel.getByText('GPT-5', { exact: true })).toBeVisible({ timeout: 30_000 });
	await expect(panel.getByText('Chat', { exact: true }), 'a model that cannot read pictures is not offered').toHaveCount(0);
	await panel.getByText('GPT-5', { exact: true }).click();

	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}'));
	expect(saved).toMatchObject({ imageModel: 'openai/gpt-5', imageLook: 'thorough' });
	await panel.getByRole('button', { name: /GPT-5/ }).click();
	await panel.getByRole('button', { name: 'Use the latest Claude Sonnet again' }).click();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').imageModel)).toBe('~anthropic/claude-sonnet-latest');
});

test('@smoke @mobile @webkit-phone on a phone the dialog does not pan sideways, the date field is short, and the picture survives a save', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await openLibraryImages(page, 390);
	await addPhoto(page, 'IMG_4568.png');
	const card = page.locator('[data-media-card="img-4568"]');
	await expect(card).toBeVisible();

	// An Edit button sits beside Delete, so the way in is not a guess at the thumbnail.
	await card.getByRole('button', { name: 'Edit img-4568' }).click();
	const dialog = page.locator('[data-media-detail="img-4568"]');
	await expect(dialog).toBeVisible();
	await settled(dialog);

	const fit = await dialog.evaluate((el) => {
		const date = el.querySelector('input[type="date"]') as HTMLInputElement;
		const box = el.getBoundingClientRect();
		const wide = [...el.querySelectorAll('*')].filter((n) => getComputedStyle(n).display !== 'contents' && n.getClientRects().length > 0).filter((n) => n.getBoundingClientRect().right > box.right + 0.5 || n.getBoundingClientRect().left < box.left - 0.5).map((n) => `${n.tagName}.${(n as HTMLElement).className}`.slice(0, 80));
		return { scrollW: el.scrollWidth, clientW: el.clientWidth, dateW: date.getBoundingClientRect().width, touch: getComputedStyle(el).touchAction, overflowX: getComputedStyle(el).overflowX, wide };
	});
	expect(fit.scrollW, `nothing is wider than the dialog: ${fit.wide.join(' | ')}`).toBeLessThanOrEqual(fit.clientW);
	expect(fit.wide, 'no control pokes out of the dialog').toEqual([]);
	expect(fit.dateW, 'the date field is short').toBeLessThanOrEqual(200);
	// The date control is the one that went wrong on a real iPhone: taller than its neighbors and wider than its column, so it ran
	// off the right edge. Measured in the engine, it is the same height as Credit and ends inside the dialog's padding.
	const pair = await dialog.evaluate((el) => {
		const credit = (el.querySelector('input[placeholder="Photographer"]') as HTMLElement).getBoundingClientRect();
		const date = (el.querySelector('input[type="date"]') as HTMLElement).getBoundingClientRect();
		const body = (el.querySelector('form > div') as HTMLElement).getBoundingClientRect();
		return { creditH: credit.height, dateH: date.height, creditRight: credit.right, dateLeft: date.left, dateRight: date.right, bodyRight: body.right };
	});
	expect(pair.dateH, 'Date is as tall as Credit').toBe(pair.creditH);
	expect(pair.dateRight, 'Date ends inside the dialog').toBeLessThanOrEqual(pair.bodyRight + 0.5);
	expect(pair.creditRight, 'Credit and Date do not overlap').toBeLessThanOrEqual(pair.dateLeft);
	expect(fit.overflowX).toBe('hidden');
	expect(fit.touch).toContain('pan-y');

	// Save a change; the picture is still a picture, in the dialog's place on the shelf and on reopening.
	await dialog.getByLabel('Description', { exact: true }).fill('A shoe');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	const loaded = (sel: string) => page.evaluate((s) => { const i = document.querySelector(s) as HTMLImageElement | null; return !!i && i.complete && i.naturalWidth > 0; }, sel);
	await expect.poll(() => loaded('[data-media-card="img-4568"] img'), { message: 'the card picture is still painted after a save' }).toBe(true);
	await card.getByRole('button', { name: 'Edit img-4568' }).click();
	await expect(dialog).toBeVisible();
	await expect.poll(() => loaded('[data-media-detail="img-4568"] img'), { message: 'the dialog picture is painted' }).toBe(true);
});

// ── A saved photo stays a photo ───────────────────────────────────────────────────────────────────────────
// On a real iPhone, editing a photo's details left its card showing WebKit's broken-image mark with the name and size intact: the
// edit wrote the record back with the same Blob handle IndexedDB had just handed out, a file WebKit deletes when it replaces the
// record. The proof has to be the STORED bytes, read fresh and decoded, in the engine that failed (webkit-phone, webkit-tablet,
// gecko) as well as Chromium.
async function storedPixels(page: Page): Promise<{ w: number; h: number; left: string; right: string } | null> {
	return page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: { kind: string; blob?: Blob; data?: ArrayBuffer; mime: string }[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as never);
		});
		const row = rows.find((x) => x.kind === 'image');
		if (!row) return null;
		try {
			const blob = row.blob ?? new Blob([row.data as ArrayBuffer], { type: row.mime });
			const bmp = await createImageBitmap(blob);
			const c = document.createElement('canvas');
			c.width = bmp.width;
			c.height = bmp.height;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.drawImage(bmp, 0, 0);
			const px = (x: number) => [...g.getImageData(x, 10, 1, 1).data.slice(0, 3)].map((v) => (v > 127 ? 'H' : 'L')).join('');
			return { w: bmp.width, h: bmp.height, left: px(10), right: px(bmp.width - 10) };
		} catch {
			return { w: 0, h: 0, left: 'unreadable', right: 'unreadable' };
		}
	});
}

test('@smoke an edit, a rename and a reload leave the stored picture readable and drawn @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openLibraryImages(page, page.viewportSize()?.width ?? 1440);
	await addPhoto(page, 'Loafers.png');
	const card = page.locator('[data-media-card="loafers"]');
	await expect(card).toBeVisible();
	const first = await storedPixels(page);
	expect(first).toMatchObject({ w: 600, h: 400, left: 'HLL', right: 'LLH' });

	const drawn = (sel: string) => page.evaluate((s) => { const i = document.querySelector(s) as HTMLImageElement | null; return !!i && i.complete && i.naturalWidth > 0; }, sel);
	await expect.poll(() => drawn('[data-media-card="loafers"] img'), { message: 'drawn before any edit' }).toBe(true);

	// Edit the description, then the name: each rewrites the record.
	await card.getByRole('button', { name: 'Edit loafers' }).click();
	const dialog = page.locator('[data-media-detail="loafers"]');
	await dialog.getByLabel('Description', { exact: true }).fill('Brown loafers on a rug');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	expect(await storedPixels(page), 'readable after a description edit').toEqual(first);

	await page.locator('[data-media-card="loafers"]').getByRole('button', { name: 'Edit loafers' }).click();
	await dialog.getByLabel('Name', { exact: true }).fill('brown-loafers');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('[data-media-card="brown-loafers"]')).toBeVisible();
	expect(await storedPixels(page), 'readable after a rename').toEqual(first);
	await expect.poll(() => drawn('[data-media-card="brown-loafers"] img'), { message: 'drawn after the edits' }).toBe(true);

	// A fresh load reads the record from storage again: still a picture, never the placeholder.
	await page.reload();
	await openLibraryImages(page, page.viewportSize()?.width ?? 1440);
	await expect(page.locator('[data-media-card="brown-loafers"]')).toBeVisible();
	await expect.poll(() => drawn('[data-media-card="brown-loafers"] img'), { message: 'drawn after a reload' }).toBe(true);
	await expect(page.locator('[data-photo-placeholder]')).toHaveCount(0);
	expect(await storedPixels(page), 'readable after a reload').toEqual(first);
});

test('@smoke a photo the browser cannot draw shows our placeholder, not the browser\'s broken-image mark', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openLibraryImages(page, 1440);
	await addPhoto(page, 'Ruined.png');
	await expect(page.locator('[data-media-card="ruined"]')).toBeVisible();
	// Ruin the stored bytes the way a dropped file would read: a record whose Blob is not an image.
	await page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		await new Promise<void>((res) => {
			const t = db.transaction('assets', 'readwrite');
			const store = t.objectStore('assets');
			const all = store.getAll();
			all.onsuccess = () => {
				for (const row of all.result as { kind: string; blob?: Blob }[]) if (row.kind === 'image') store.put({ ...row, blob: new Blob(['this is not an image'], { type: 'image/png' }) });
			};
			t.oncomplete = () => res();
		});
	});
	await page.reload();
	await openLibraryImages(page, 1440);
	const card = page.locator('[data-media-card="ruined"]');
	await expect(card.locator('[data-photo-placeholder]')).toBeVisible({ timeout: 15_000 });
	await expect(card.locator('img')).toHaveCount(0);
	await expect(card.getByRole('img', { name: "This photo can't be shown" })).toBeVisible();
	await card.screenshot({ path: process.env.PLACEHOLDER_SHOT ?? 'test-results/placeholder-card.png' });

	await card.getByRole('button', { name: 'Edit ruined' }).click();
	const dialog = page.locator('[data-media-detail="ruined"]');
	await expect(dialog.locator('[data-photo-placeholder]')).toBeVisible();
	await settled(dialog);
	await dialog.screenshot({ path: process.env.PLACEHOLDER_SHOT_DIALOG ?? 'test-results/placeholder-dialog.png' });
});
