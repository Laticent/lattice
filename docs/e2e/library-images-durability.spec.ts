import fs from 'node:fs';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { CHROME, expect, gotoStudio, openSection, setEditorContent, test, toastText } from './studio-fixture';

// A Library photo has to SURVIVE: a backup carries it, a restore puts it back where it was, the storage
// line counts it, and deleting a deck takes its private photos with it
// (engineering/decisions/2026-10-12-library-media-assets.md §5-§6).
//
// Driven on the real Studio because the parts that decide these are the browser's own: IndexedDB
// storing a Blob, the download, and a restore reading a file back through the real Workspace sheet.
// `@webkit-tablet` and `@gecko` put the Blob round trip on the engines whose IndexedDB differs most
// from Chromium's (Safari has a history of Blob-in-IndexedDB bugs); `@crosswidth` keeps it on `desktop`
// and adds the 390px `mobile` project, where the Workspace sheet opens its sections from a menu.
test.describe.configure({ timeout: 300_000 });

/** A WxH PNG of the given color, or of random noise (incompressible, so its size is real). */
async function addPhoto(page: Page, name: string, o: { w?: number; h?: number; noise?: boolean } = {}) {
	await page.evaluate(
		async ({ fileName, w, h, noise }) => {
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.fillStyle = 'rgb(16,160,90)';
			g.fillRect(0, 0, w, h);
			if (noise) {
				const img = g.getImageData(0, 0, w, h);
				for (let i = 0; i < img.data.length; i += 4) {
					img.data[i] = (Math.random() * 256) | 0;
					img.data[i + 1] = (Math.random() * 256) | 0;
					img.data[i + 2] = (Math.random() * 256) | 0;
				}
				g.putImageData(img, 0, 0);
			}
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
			const dt = new DataTransfer();
			dt.items.add(new File([blob], fileName, { type: 'image/png' }));
			const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			// The format dialog asks how to store them; the probes take its default.
			for (let i = 0; i < 200; i++) {
				const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
				if (b) {
					// These probes are PNGs that must stay byte-exact, so they ask for the original.
					const keep = document.querySelector('[role="dialog"] [role="radio"][aria-label="Keep original"]') as HTMLButtonElement | null;
					if (keep) {
					keep.click();
					await new Promise((r) => setTimeout(r, 150));
				}
					b.click();
					break;
				}
				await new Promise((r) => setTimeout(r, 50));
			}
		},
		{ fileName: name, w: o.w ?? 320, h: o.h ?? 180, noise: o.noise ?? false },
	);
}

async function openLibraryImages(page: Page) {
	// Idempotent: the docked panel stays open, and clicking its launcher again would close it.
	const images = page.getByRole('tab', { name: 'Media', exact: true });
	if (await images.isVisible().catch(() => false)) return void (await images.click());
	const width = page.viewportSize()?.width ?? 1440;
	if (width >= 1100) {
		await page.getByRole('button', { name: CHROME.library }).click();
	} else if (width >= 700) {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
		await page.getByRole('menuitem', { name: /^Library/ }).click();
	} else {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: /^Library/ }).click();
	}
	await images.click();
	await page.getByRole('button', { name: 'Filter' }).click();
	await page.getByRole('menuitemradio', { name: 'Images' }).click();
}

/** The Library is a docked column at desktop widths (it stays open) and a modal sheet below that
 *  (it must be dismissed before another panel opens). Never `Escape` the docked one: it closes it
 *  and leaves the launcher out of step with the panel. */
async function closeLibrary(page: Page) {
	if ((page.viewportSize()?.width ?? 1440) >= 1100) return;
	// A phone reaches the Library through a menu sheet: dismiss the Library, then the menu behind it,
	// until the header's controls are reachable again.
	const gear = page.getByRole('button', { name: 'Workspace settings', exact: true }).first();
	for (let i = 0; i < 3 && !(await gear.isVisible().catch(() => false)); i++) {
		await page.keyboard.press('Escape');
		// Wait on the signal itself, bounded: the control behind the sheet becoming reachable.
		await gear.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
	}
	await expect(gear).toBeVisible();
}

/** The header's deck switcher. At phone width it shows only the title, no slide count. */
function deckSwitcher(page: Page) {
	return page.locator('header').getByRole('button', { name: /slides?$|Untitled deck|Markdown for the boardroom/ }).first();
}

async function closeWorkspace(page: Page) {
	// Focus is already inside the dialog (we just used it), so Escape closes the dialog and nothing else.
	await page.getByRole('dialog', { name: /Workspace/ }).press('Escape');
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeHidden();
}

async function shelf(page: Page): Promise<{ name: string; scope: string; bytes: number; caption: string | null }[]> {
	return page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: Record<string, unknown>[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as Record<string, unknown>[]);
		});
		db.close();
		return rows
			.filter((x) => x.kind === 'image')
			// A row holds its bytes as a Blob, or as an ArrayBuffer where the engine refuses to store a Blob.
			.map((x) => ({ name: x.name as string, scope: x.scope as string, bytes: (x.blob as Blob | undefined)?.size ?? (x.data as ArrayBuffer).byteLength, caption: (x.caption as string | undefined) ?? null }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});
}

/** Put a caption on a stored photo the way the chat's `caption_asset` does (media-store `setMediaCaption`):
 *  one readwrite put on the same row. The chat's own path is proven against a real model elsewhere. */
async function captionPhoto(page: Page, name: string, caption: string) {
	await page.evaluate(
		async ([n, c]) => {
			const db: IDBDatabase = await new Promise((res, rej) => {
				const r = indexedDB.open('lattice-workbench');
				r.onsuccess = () => res(r.result);
				r.onerror = () => rej(r.error);
			});
			await new Promise<void>((res, rej) => {
				const t = db.transaction('assets', 'readwrite');
				const store = t.objectStore('assets');
				const all = store.getAll();
				all.onsuccess = () => {
					const row = (all.result as Record<string, unknown>[]).find((x) => x.kind === 'image' && x.name === n);
					if (row) store.put({ ...row, caption: c });
				};
				t.oncomplete = () => res();
				t.onerror = () => rej(t.error);
			});
			db.close();
		},
		[name, caption],
	);
}

async function openWorkspaceData(page: Page) {
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
}

test('a backup carries the photos and a restore puts them back where they were @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await openLibraryImages(page);
	await addPhoto(page, 'Keep Shared.png');
	await expect(page.locator('[data-media-card="keep-shared"]')).toBeVisible();
	await page.getByRole('button', { name: 'Filter' }).click();
	await page.getByRole('menuitemradio', { name: 'This deck' }).click();
	await addPhoto(page, 'Keep Deck.png');
	await expect(page.locator('[data-media-card="keep-deck"]')).toBeVisible();
	// One photo has been looked at by the chat and captioned; the other has not.
	await captionPhoto(page, 'keep-shared', 'Two flat colored squares side by side');
	const before = await shelf(page);
	expect(before.map((r) => r.name)).toEqual(['keep-deck', 'keep-shared']);
	expect(before.find((r) => r.name === 'keep-shared')?.caption).toBe('Two flat colored squares side by side');
	const deckScope = before.find((r) => r.name === 'keep-deck')?.scope as string;
	expect(deckScope, 'a deck-only photo is scoped to a deck id').not.toBe('library');
	await closeLibrary(page);
	// The deck NAMES both photos, so the restore is judged on the slide, not only on the shelf.
	// The editor is behind a tab on a phone; the slide-level check runs where it is on screen (the engines are the point).
	const wide = (page.viewportSize()?.width ?? 0) >= 1100;
	if (wide) await setEditorContent(page, '# Restored\n\n![shared pic](asset:keep-shared)\n\n![deck pic](asset:keep-deck)\n');
	const slidePic = (alt: string) => page.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator(`img[alt="${alt}"]`).first();
	if (wide) {
		await expect(slidePic('shared pic')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
		await expect(slidePic('deck pic')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	}

	// Back up. The file itself is the oracle, not the toast.
	await openWorkspaceData(page);
	const pending = page.waitForEvent('download', { timeout: 120_000 });
	await page.getByRole('button', { name: 'Download backup' }).click();
	const backupPath = (await (await pending).path()) as string;
	const zip = await JSZip.loadAsync(fs.readFileSync(backupPath));
	const index = JSON.parse(await (zip.file('media.json') as JSZip.JSZipObject).async('string')) as { name: string; scope: string; file: string; caption?: string }[];
	expect(index.map((r) => r.name).sort(), 'both photos are in the index').toEqual(['keep-deck', 'keep-shared']);
	expect(index.find((r) => r.name === 'keep-shared')?.caption, 'the caption is in the backup file').toBe('Two flat colored squares side by side');
	expect(index.find((r) => r.name === 'keep-deck')?.caption, 'an uncaptioned photo carries no caption key').toBeUndefined();
	for (const r of index) expect(zip.file(`media/${r.file}`), `media/${r.file} holds the bytes`).toBeTruthy();
	const manifest = JSON.parse(await (zip.file('manifest.json') as JSZip.JSZipObject).async('string'));
	expect(manifest.counts.media).toBe(2);
	await closeWorkspace(page);

	// Lose them: delete both through the Library's own two-tap delete.
	// The deck names both, so each delete also asks "N deck uses it. Delete anyway?": accept it.
	page.on('dialog', (d) => void d.accept());
	await openLibraryImages(page);
	for (const name of ['keep-deck', 'keep-shared']) {
		const card = page.locator(`[data-media-card="${name}"]`);
		await card.getByRole('button', { name: `Delete ${name}` }).click();
		await card.getByRole('button', { name: new RegExp(`Confirm delete ${name}`) }).click();
		await expect(card).toHaveCount(0);
	}
	expect(await shelf(page)).toEqual([]);
	await closeLibrary(page);

	// Restore from the file we just downloaded.
	await openWorkspaceData(page);
	await page.getByLabel('Restore a workspace backup').setInputFiles(backupPath);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first()).toContainText('2 photos', { timeout: 60_000 });
	await page.waitForLoadState('load');

	await expect.poll(async () => (await shelf(page)).map((r) => r.name), { timeout: 30_000 }).toEqual(['keep-deck', 'keep-shared']);
	const after = await shelf(page);
	expect(after.find((r) => r.name === 'keep-shared')?.scope).toBe('library');
	expect(after.find((r) => r.name === 'keep-deck')?.scope, 'the deck-only photo came back to the same deck').toBe(deckScope);
	expect(after.map((r) => r.bytes)).toEqual(before.map((r) => r.bytes));
	expect(after.find((r) => r.name === 'keep-shared')?.caption, 'the caption came back with the photo').toBe('Two flat colored squares side by side');
	expect(after.find((r) => r.name === 'keep-deck')?.caption, 'the uncaptioned photo is still uncaptioned').toBeNull();
	// And on the slide: the same deck, after the reload, paints the shared photo instead of the stand-in.
	if (wide) {
		await expect(slidePic('shared pic')).toHaveAttribute('src', /^blob:/, { timeout: 60_000 });
		await expect(slidePic('deck pic'), 'the deck-only photo is visible to its own deck after the restore').toHaveAttribute('src', /^blob:/, { timeout: 60_000 });
		await expect.poll(async () => slidePic('shared pic').evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1)), { timeout: 30_000 }).toBeGreaterThan(0);
	}
});

test('the storage line counts a photo by its bytes, not as nothing @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await openLibraryImages(page);
	// ~1.5 MB of incompressible pixels: a size no rounding can hide.
	await addPhoto(page, 'Heavy.png', { w: 700, h: 700, noise: true });
	await expect(page.locator('[data-media-card="heavy"]')).toBeVisible();
	const [heavy] = await shelf(page);
	expect(heavy.bytes, 'the photo really is big').toBeGreaterThan(1_000_000);
	await closeLibrary(page);

	await openWorkspaceData(page);
	// The Library row of the Data list reads "1 asset · 1.4 MB": a photo counted by its bytes.
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toContainText(/1 asset · ~\d(\.\d+)? MB/, { timeout: 15_000 });
});

test('deleting a deck takes the photos kept to that deck, and only those @crosswidth', async ({ page }) => {
	await gotoStudio(page);
	// A second deck, so there is one to delete that is not the boot deck.
	await deckSwitcher(page).click();
	await page.getByRole('menuitem', { name: 'New deck' }).click();
	await expect(toastText(page)).toContainText('New deck created');
	// At desktop a new deck opens in the calm Read stop, which has no Library; step back up to Craft.
	const craft = page.locator('header').getByText('Craft', { exact: true });
	if (await craft.isVisible().catch(() => false)) await craft.click();

	await openLibraryImages(page);
	await addPhoto(page, 'Shared Stays.png');
	await expect(page.locator('[data-media-card="shared-stays"]')).toBeVisible();
	await page.getByRole('button', { name: 'Filter' }).click();
	await page.getByRole('menuitemradio', { name: 'This deck' }).click();
	await addPhoto(page, 'Goes With Deck.png');
	await expect(page.locator('[data-media-card="goes-with-deck"]')).toBeVisible();
	expect((await shelf(page)).map((r) => r.name)).toEqual(['goes-with-deck', 'shared-stays']);
	await closeLibrary(page);

	await deckSwitcher(page).click();
	const row = page.getByRole('menuitem').filter({ hasText: /Untitled deck/ }).first();
	await row.hover();
	// The deck owns a photo, so deleting it asks first. Dismissing keeps the deck and the photo.
	const asked: string[] = [];
	let answer = false;
	page.on('dialog', (d) => {
		asked.push(d.message());
		void (answer ? d.accept() : d.dismiss());
	});
	await row.getByRole('button', { name: /^Delete Untitled deck/ }).click();
	await expect.poll(() => asked.length, { timeout: 15_000 }).toBe(1);
	expect(asked[0]).toMatch(/1 photo or video kept to it.*can't be undone/);
	expect((await shelf(page)).map((r) => r.name)).toEqual(['goes-with-deck', 'shared-stays']);
	// Now confirm.
	answer = true;
	if (!(await row.isVisible().catch(() => false))) await deckSwitcher(page).click();
	await row.hover();
	await row.getByRole('button', { name: /^Delete Untitled deck/ }).click();
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /photo/ }).first()).toContainText('belonged only to that deck', { timeout: 15_000 });
	await expect.poll(async () => (await shelf(page)).map((r) => r.name), { timeout: 15_000 }).toEqual(['shared-stays']);
});
