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
async function pickPhoto(page: Page, files: { name: string; width: number; height: number; exif?: boolean; type?: string; claimType?: string }[]): Promise<boolean[]> {
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
			// `claimType` is the type the BROWSER would report for the file name (a JPEG renamed .png claims image/png).
			made.push(new File([bytes as BlobPart], s.name, { type: s.claimType ?? type }));
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
		// The format dialog asks how to store them; the probes take its default.
		for (let i = 0; i < 200; i++) {
			const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
			if (b) {
				// A PNG probe must stay byte-exact, so it asks for the original; a camera JPEG takes the default.
				const choose = specs.every((s) => s.type === 'image/png') ? 'Keep original' : 'JPEG';
				// The dialog remembers the last choice, so every pick states its own.
				(document.querySelector(`[role="dialog"] [role="radio"][aria-label="${choose}"]`) as HTMLButtonElement | null)?.click();
				await new Promise((r) => setTimeout(r, 150));
				b.click();
				break;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
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
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
}

// Each width is its own describe with its own viewport, run in the `desktop` project: the
// `tablet` and `mobile` projects only take tests tagged for them, and a tag would also pull
// these into the visual baselines. The same shape `library-card-fit.spec.ts` uses.
const WIDTHS = [1440, 820, 390];
// The desktop-width variant also runs on real WebKit and Firefox in the nightly (studio-e2e-nightly.yml):
// decode, canvas re-encode, EXIF rotation and IndexedDB storing a photo are engine behavior, and the
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

		// Two files that really are called IMG_0042.jpg (a camera roll and a download): neither replaces the
		// first photo, and the notice says which name each took, so a deck that still shows the old one is no mystery.
		await pickPhoto(page, [
			{ name: 'IMG_0042.jpg', width: 800, height: 600 },
			{ name: 'IMG_0042.jpg', width: 800, height: 600 },
		]);
		await expect(page.getByText(/“img-0042” was taken, so IMG_0042\.jpg is “img-0042-2”/)).toBeVisible();
		rows = await storedMedia(page);
		expect(rows.map((r) => r.name)).toEqual(['img-0042', 'img-0042-1', 'img-0042-2', 'img-0042-3', 'rotated-gps-photo']);

		// A JPEG with GPS whose file name says .png: the browser reports image/png, and a type-by-extension
		// importer would store it untouched and ship the GPS in every export. The bytes decide.
		const spoofed = await pickPhoto(page, [{ name: 'Spoof.png', width: 800, height: 600, exif: true, claimType: 'image/png' }]);
		expect(spoofed, 'positive control: the input carried Exif').toEqual([true]);
		await expect(page.locator('[data-media-card="spoof"]')).toBeVisible();
		const spoof = (await storedMedia(page)).find((r) => r.name === 'spoof');
		expect(spoof, 'stored as the JPEG it is, re-encoded').toMatchObject({ mime: 'image/jpeg', original: false });
		expect(spoof?.hasExif, 'the stored bytes carry no EXIF').toBe(false);
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

// PNG, WebP and GIF are kept as given, but their metadata blocks are cut out (media-scrub.ts). A byte
// scrub must leave a picture the browser still decodes, so this drives the real importer and then asks the
// real decoder, on every engine.
test('@smoke a PNG with an eXIf GPS chunk and a GIF with comment and XMP blocks lose them and still decode @webkit-tablet @gecko', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	const MARK = 'GPSLatitude=51.5';
	const before = await page.evaluate(async (mark) => {
		const enc = (s: string) => [...s].map((c) => c.charCodeAt(0));
		const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
		const crcTable = Array.from({ length: 256 }, (_, n) => {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			return c >>> 0;
		});
		const crc = (bytes: number[]) => {
			let c = 0xffffffff;
			for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
			return (c ^ 0xffffffff) >>> 0;
		};
		// A real PNG from a canvas, then an eXIf chunk (with a valid CRC) spliced in right after IHDR.
		const cv = document.createElement('canvas');
		cv.width = 64;
		cv.height = 48;
		const g = cv.getContext('2d') as CanvasRenderingContext2D;
		g.fillStyle = '#c03030';
		g.fillRect(0, 0, 64, 48);
		const pngBlob: Blob = await new Promise((r) => cv.toBlob((b) => r(b as Blob), 'image/png'));
		const png = new Uint8Array(await pngBlob.arrayBuffer());
		const body = enc(`Exif\\0\\0${mark}`);
		const chunk = [...be32(body.length), ...enc('eXIf'), ...body, ...be32(crc([...enc('eXIf'), ...body]))];
		const ihdrEnd = 8 + 12 + 13;
		const dirtyPng = new Uint8Array([...png.subarray(0, ihdrEnd), ...chunk, ...png.subarray(ihdrEnd)]);
		// The standard 1x1 GIF, with a comment and an XMP application extension before its image.
		const head = [...enc('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 255, 255, 255, 0, 0, 0];
		const comment = [0x21, 0xfe, mark.length, ...enc(mark), 0];
		const xmp = [0x21, 0xff, 11, ...enc('XMP DataXMP'), mark.length, ...enc(mark), 0];
		const image = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b];
		const dirtyGif = new Uint8Array([...head, ...comment, ...xmp, ...image]);
		// A 64x48 PNG whose eXIf says Orientation = 6 (and carries the marker): some browsers show it 48x64.
		const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, ...enc(mark)];
		const rchunk = [...be32(tiff.length), ...enc('eXIf'), ...tiff, ...be32(crc([...enc('eXIf'), ...tiff]))];
		const rotatedPng = new Uint8Array([...png.subarray(0, ihdrEnd), ...rchunk, ...png.subarray(ihdrEnd)]);
		const shown = async (blob: Blob) => {
			const url = URL.createObjectURL(blob);
			const img = new Image();
			img.src = url;
			await img.decode();
			const d = [img.naturalWidth, img.naturalHeight];
			URL.revokeObjectURL(url);
			return d;
		};
		(window as unknown as { __rotatedShown: number[] }).__rotatedShown = await shown(new Blob([rotatedPng], { type: 'image/png' }));
		const dt = new DataTransfer();
		dt.items.add(new File([rotatedPng as BlobPart], 'Rotated PNG.png', { type: 'image/png' }));
		dt.items.add(new File([dirtyPng as BlobPart], 'Marked PNG.png', { type: 'image/png' }));
		dt.items.add(new File([dirtyGif as BlobPart], 'Marked GIF.gif', { type: 'image/gif' }));
		const has = (b: Uint8Array) => new TextDecoder('latin1').decode(b).includes(mark);
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		// The format dialog asks how to store them; the probes take its default.
		for (let i = 0; i < 200; i++) {
			const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
			if (b) {
				b.click();
				break;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
		return { pngHadMark: has(dirtyPng), gifHadMark: has(dirtyGif), pngLength: dirtyPng.length, gifLength: dirtyGif.length };
	}, MARK);
	expect([before.pngHadMark, before.gifHadMark], 'positive control: both inputs carried the marker').toEqual([true, true]);
	await expect(page.locator('[data-media-card="rotated-png"]')).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-media-card="marked-png"]')).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-media-card="marked-gif"]')).toBeVisible({ timeout: 30_000 });
	const after = await page.evaluate(async (mark) => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: { name: string; mime: string; original: boolean; blob?: Blob; data?: ArrayBuffer }[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').index('kind').getAll('image');
			r.onsuccess = () => res(r.result);
		});
		const out: Record<string, { mime: string; marked: boolean; decodes: boolean; original: boolean; bytes: number; shown: number[] }> = {};
		for (const row of rows) {
			const blob = row.blob ?? new Blob([row.data as ArrayBuffer], { type: row.mime });
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let decodes = true;
			let shown: number[] = [];
			try {
				(await createImageBitmap(blob)).close();
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.src = url;
				await img.decode();
				shown = [img.naturalWidth, img.naturalHeight];
				URL.revokeObjectURL(url);
			} catch {
				decodes = false;
			}
			out[row.name] = { mime: row.mime, marked: new TextDecoder('latin1').decode(bytes).includes(mark), decodes, original: row.original, bytes: bytes.length, shown };
		}
		return out;
	}, MARK);
	// `original: true` and a smaller file than the input prove the BYTE scrubber ran, not a canvas re-encode
	// (which would also drop the marker, and would mark the record resized).
	expect(after['marked-png']).toMatchObject({ mime: 'image/png', marked: false, decodes: true, original: true });
	expect(after['marked-gif']).toMatchObject({ mime: 'image/gif', marked: false, decodes: true, original: true });
	// The rotation survives the scrub as an orientation-only chunk, so the browser shows the stored picture at the
	// same size it showed the original (a dropped tag would turn 48x64 into 64x48 in a browser that applies it).
	expect(after['rotated-png']).toMatchObject({ marked: false, decodes: true, original: true });
	expect(after['rotated-png'].shown, 'displayed size, before vs after').toEqual(await page.evaluate(() => (window as unknown as { __rotatedShown: number[] }).__rotatedShown));
	expect(after['marked-png'].bytes).toBeLessThan(before.pngLength);
	expect(after['marked-gif'].bytes).toBeLessThan(before.gifLength);
});

// THE PERSON CHOOSES THE FORMAT, with sizes measured on their own files and what each choice means beside it.
// Real engine, real encoders: the oracle is the stored record and the numbers on screen.
// Two copies, not `@webkit-tablet @gecko`: the Chromium `desktop` project drops any `@webkit-*` title (playwright.config.ts).
for (const engine of [' @gecko', ' @webkit-tablet']) test(`@smoke adding a photo asks for the format, shows measured sizes, and stores what was chosen${engine}`, async ({ page }) => {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLibraryImages(page, 1440);
	await page.evaluate(async () => {
		// A photographic image (smooth structure plus grain) so the formats differ the way real photos do.
		const c = document.createElement('canvas');
		c.width = 2400;
		c.height = 1600;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		const grad = g.createLinearGradient(0, 0, 2400, 1600);
		grad.addColorStop(0, '#26466d');
		grad.addColorStop(0.5, '#d89a4a');
		grad.addColorStop(1, '#2b7a5a');
		g.fillStyle = grad;
		g.fillRect(0, 0, 2400, 1600);
		const px = g.getImageData(0, 0, 2400, 1600);
		let seed = 7;
		for (let i = 0; i < px.data.length; i += 4) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			const n = ((seed >>> 24) - 128) / 10;
			px.data[i] += n;
			px.data[i + 1] += n;
			px.data[i + 2] += n;
		}
		g.putImageData(px, 0, 0);
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.95));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], 'Harbour.jpg', { type: 'image/jpeg' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	const dialog = page.getByRole('dialog', { name: /Add 1 photo/ });
	await expect(dialog).toBeVisible();
	// Nothing is stored until the person chooses.
	expect(await storedMedia(page)).toHaveLength(0);
	// Every option shows a measured size, never a placeholder, once the encoders have run.
	const size = (f: string) => dialog.locator(`[data-format-size="${f}"]`);
	for (const f of ['original', 'jpeg', 'png']) await expect(size(f)).toContainText(/MB|KB/, { timeout: 60_000 });
	const mb = async (f: string) => {
		const m = /([\d.]+)\s*(MB|KB)/.exec((await size(f).innerText()) || '');
		return m ? Number(m[1]) * (m[2] === 'MB' ? 1_000_000 : 1_000) : Number.NaN;
	};
	const [orig, jpeg, png] = [await mb('original'), await mb('jpeg'), await mb('png')];
	// The claim the dialog makes in words: PNG is much bigger than JPEG for a photograph.
	expect(png, `PNG (${png}) is larger than JPEG (${jpeg})`).toBeGreaterThan(jpeg * 2);
	expect(orig).toBeGreaterThan(0);
	await expect(dialog.getByText('Smallest', { exact: true })).toBeVisible();
	await dialog.getByRole('radio', { name: 'PNG' }).click();
	await dialog.getByRole('button', { name: /^Add photos?/ }).click();
	await expect.poll(async () => (await storedMedia(page))[0]?.mime, { timeout: 30_000 }).toBe('image/png');
	const stored = (await storedMedia(page))[0];
	expect(stored.original, 'a JPEG converted to PNG is no longer the camera file').toBe(false);
	// The size shown for PNG is the size stored, within the measurement's own rounding.
	expect(Math.abs(stored.bytes - png) / png).toBeLessThan(0.1);
});
