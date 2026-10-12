import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The Library's Images tab, driven on the real Studio (engineering/decisions/2026-10-12-library-media-assets.md).
//
// Why a browser and not jsdom: the importer decodes with `createImageBitmap`, resizes on a
// canvas and re-encodes, and jsdom has none of that — a unit test there would only confirm a
// stub (HARD RULE #23). What this proves, on real bytes:
//   · a phone-style JPEG (EXIF Orientation 6 + a GPS block) lands UPRIGHT and CAPPED,
//   · the stored bytes carry no EXIF — the location is gone, not hidden,
//   · a camera-roll batch with colliding names lands as distinct assets,
//   · an image can move between "all decks" and "this deck" without a rename,
//   · the card's action row fits its card at 1440 / 820 / 390.

/** Build a 4000×3000 JPEG in the page, then splice in an APP1 Exif segment holding
 *  Orientation=6 and a GPS IFD — the shape a phone held upright writes. Returns file bytes
 *  through a DataTransfer onto the Images tab's hidden input, exactly what the OS picker does. */
async function pickPhoto(page: Page, files: { name: string; width: number; height: number; exif?: boolean; type?: string }[]): Promise<boolean[]> {
	return page.evaluate(async (specs) => {
		const made: File[] = [];
		for (const s of specs) {
			const c = document.createElement('canvas');
			c.width = s.width;
			c.height = s.height;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.fillStyle = '#d02828';
			g.fillRect(0, 0, s.width / 2, s.height); // left half red, so a rotation is visible in the pixels
			g.fillStyle = '#2840d0';
			g.fillRect(s.width / 2, 0, s.width / 2, s.height);
			const type = s.type ?? 'image/jpeg';
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), type, 0.92));
			let bytes = new Uint8Array(await blob.arrayBuffer());
			if (s.exif) {
				const tiff = [
					0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // MM, 42, IFD0 at 8
					0, 2, // two entries
					0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, // Orientation = 6
					0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 38, // GPS IFD pointer -> 38
					0, 0, 0, 0, // no next IFD
					0, 1, // GPS IFD: one entry
					0, 1, 0, 2, 0, 0, 0, 2, 0x4e, 0, 0, 0, // GPSLatitudeRef = "N"
					0, 0, 0, 0,
				];
				const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]; // "Exif\0\0" + TIFF
				const len = body.length + 2;
				const app1 = new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
				const out = new Uint8Array(bytes.length + app1.length);
				out.set(bytes.subarray(0, 2), 0);
				out.set(app1, 2);
				out.set(bytes.subarray(2), 2 + app1.length);
				bytes = out;
			}
			made.push(new File([bytes as BlobPart], s.name, { type }));
		}
		// Report whether each INPUT carried the Exif marker, so "the output has none" is not vacuous.
		const hadExif: boolean[] = [];
		for (const f of made) {
			const head = new TextDecoder('latin1').decode(new Uint8Array(await f.arrayBuffer()).subarray(0, 65536));
			hadExif.push(head.includes('Exif\u0000\u0000'));
		}
		const dt = new DataTransfer();
		for (const f of made) dt.items.add(f);
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		return hadExif;
	}, files);
}

type Stored = { name: string; scope: string; width: number; height: number; bytes: number; original: boolean; mime: string; hasExif: boolean };
async function storedMedia(page: Page): Promise<Stored[]> {
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
		const out: Stored[] = [];
		for (const a of rows.filter((x) => x.kind === 'image')) {
			// A row holds its bytes as a Blob, or as an ArrayBuffer where the engine refuses to store a Blob.
			const buf = a.blob ? new Uint8Array(await (a.blob as Blob).arrayBuffer()) : new Uint8Array(a.data as ArrayBuffer);
			// "Exif\0\0" anywhere in the first 64 KB — an APP1 segment sits at the very start.
			const head = new TextDecoder('latin1').decode(buf.subarray(0, 65536));
			out.push({ name: a.name as string, scope: a.scope as string, width: a.width as number, height: a.height as number, bytes: a.bytes as number, original: a.original as boolean, mime: a.mime as string, hasExif: head.includes('Exif\u0000\u0000') });
		}
		return out.sort((p, q) => p.name.localeCompare(q.name));
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

// Each width is its own describe with its own viewport, run in the `desktop` project: the
// `tablet` and `mobile` projects only take tests tagged for them, and a tag would also pull
// these into the visual baselines. The same shape `library-card-fit.spec.ts` uses.
const WIDTHS = [1440, 820, 390];
// The desktop-width variant also runs on real WebKit and Firefox in the nightly (studio-e2e-nightly.yml):
// decode, canvas re-encode, EXIF rotation and IndexedDB storing a photo are engine behaviour, and the
// two most likely to differ from Chromium are exactly the two that cannot be reached from a unit test.
// The narrower widths are layout checks and stay on Chromium.
const OTHER_ENGINES = (w: number) => (w === 1440 ? ' @webkit-tablet @gecko' : '');
for (const vw of WIDTHS) {
	test.describe(`at ${vw}px`, () => {
		test.use({ viewport: { width: vw, height: vw === 1440 ? 900 : 1000 } });

	test(`@smoke Images tab: a phone JPEG lands upright, capped and free of EXIF; a batch keeps distinct names${OTHER_ENGINES(vw)}`, async ({ page }, testInfo) => {
		test.slow();
		await gotoStudio(page);
		const width = page.viewportSize()?.width ?? 1440;
		await openLibraryImages(page, width);
		await expect(page.getByText('No images yet')).toBeVisible();

		// 4000×3000 stored landscape + Orientation 6 => displayed 3000×4000 => capped to 1920×2560.
		const hadExif = await pickPhoto(page, [{ name: 'Rotated GPS Photo.jpg', width: 4000, height: 3000, exif: true }]);
			expect(hadExif, 'positive control: the INPUT really carried an Exif segment').toEqual([true]);
		await expect(page.getByText(/Added 1 image to all decks/)).toBeVisible();
		await expect(page.locator('[data-media-card="rotated-gps-photo"]')).toBeVisible();
		// The thumbnail is cropped INTO its box, not painted at full height behind a clip: a
		// portrait photo once rendered 351px tall in an 88px frame and showed only its top strip.
		const thumb = await page.locator('[data-media-card="rotated-gps-photo"] img').evaluate((el) => ({ img: el.getBoundingClientRect().height, box: (el.parentElement as HTMLElement).getBoundingClientRect().height }));
		expect(thumb.img, `thumbnail is ${thumb.img}px tall in a ${thumb.box}px frame`).toBeLessThanOrEqual(thumb.box + 0.5);

		let rows = await storedMedia(page);
		expect(rows).toHaveLength(1);
		expect(rows[0], 'upright, capped to the 2560 long edge, marked resized').toMatchObject({ width: 1920, height: 2560, original: false, mime: 'image/jpeg', scope: 'library' });
		expect(rows[0].hasExif, 'the stored bytes carry no EXIF APP1 — the GPS is gone, not hidden').toBe(false);

		// Pixels, not just dimensions: the source's left half is red, Orientation 6 turns the left
		// edge to the TOP, so an upright result is red over blue. Sizes alone cannot tell a baked
		// rotation from a bitmap that was merely given swapped dimensions.
		const probe = await page.evaluate(async () => {
			const db: IDBDatabase = await new Promise((res, rej) => {
				const r = indexedDB.open('lattice-workbench');
				r.onsuccess = () => res(r.result);
				r.onerror = () => rej(r.error);
			});
			const rec: { blob?: Blob; data?: ArrayBuffer; mime: string } = await new Promise((res) => {
				const r = db.transaction('assets').objectStore('assets').index('kind').getAll('image');
				r.onsuccess = () => res(r.result[0]);
			});
			// Stored as a Blob, or as an ArrayBuffer where the engine refuses to store a Blob.
			const bmp = await createImageBitmap(rec.blob ?? new Blob([rec.data as ArrayBuffer], { type: rec.mime }), { imageOrientation: 'none' });
			const c = document.createElement('canvas');
			c.width = bmp.width;
			c.height = bmp.height;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.drawImage(bmp, 0, 0);
			const at = (fx: number, fy: number) => Array.from(g.getImageData(Math.floor(bmp.width * fx), Math.floor(bmp.height * fy), 1, 1).data.slice(0, 3));
			return { top: at(0.5, 0.25), bottom: at(0.5, 0.75) };
		});
		expect(probe.top[0], `top of the stored pixels should be red, got ${probe.top}`).toBeGreaterThan(150);
		expect(probe.bottom[2], `bottom of the stored pixels should be blue, got ${probe.bottom}`).toBeGreaterThan(150);

		// A camera-roll batch whose names collide.
		await pickPhoto(page, [
			{ name: 'IMG_0042.jpg', width: 800, height: 600 },
			{ name: 'IMG_0042 (1).jpg', width: 800, height: 600 },
		]);
		await expect(page.getByText(/Added 2 images/)).toBeVisible();
		rows = await storedMedia(page);
		expect(rows.map((r) => r.name)).toEqual(['img-0042', 'img-0042-1', 'rotated-gps-photo']);
		await page.screenshot({ path: testInfo.outputPath(`images-tab-${width}.png`) });
	});

	test(`@smoke Images tab: an image moves between all decks and this deck without a rename; the action row fits${OTHER_ENGINES(vw)}`, async ({ page }, testInfo) => {
		test.slow();
		await gotoStudio(page);
		const width = page.viewportSize()?.width ?? 1440;
		await openLibraryImages(page, width);

		// Add to THIS deck.
		await page.getByRole('tab', { name: 'This deck' }).click();
		await pickPhoto(page, [{ name: 'Team.png', width: 800, height: 600, type: 'image/png' }]);
		await expect(page.getByText(/Added 1 image to this deck/)).toBeVisible();
		const card = page.locator('[data-media-card="team"]');
		await expect(card.getByText('This deck', { exact: true })).toBeVisible();
		let rows = await storedMedia(page);
		expect(rows[0], 'a small PNG is stored as given, not re-encoded').toMatchObject({ name: 'team', original: true, mime: 'image/png' });
		expect(rows[0].scope, 'the scope is the deck id, not the word "library"').not.toBe('library');

		// The action row fits the card at this width.
		const del = card.getByRole('button', { name: 'Delete team' });
		const overflow = await del.evaluate((el) => (el.parentElement ? el.parentElement.scrollWidth - el.parentElement.clientWidth : -1));
		expect(overflow, `the media card's action row overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);

		// Share it: same name, new scope.
		await card.getByRole('button', { name: /Share to all decks/ }).click();
		await expect(card.getByText('All decks', { exact: true })).toBeVisible();
		rows = await storedMedia(page);
		expect(rows[0]).toMatchObject({ name: 'team', scope: 'library' });

		// Two-tap delete.
		await del.click();
		await card.getByRole('button', { name: /Confirm delete team/ }).click();
		await expect(page.locator('[data-media-card="team"]')).toHaveCount(0);
		expect(await storedMedia(page)).toHaveLength(0);
		await page.screenshot({ path: testInfo.outputPath(`images-scope-${width}.png`) });
	});
	});
}
