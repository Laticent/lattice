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
	await dialog.getByLabel('Name').fill('new-name');
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
	const imagesTab = page.getByRole('tab', { name: 'Images' });
	if (!(await imagesTab.isVisible().catch(() => false))) await page.getByRole('button', { name: CHROME.library }).click();
	await imagesTab.click();
	await page.locator('[data-media-card="shared-probe"]').getByRole('button', { name: 'Details for shared-probe' }).click();
	const dialog = page.locator('[data-media-detail="shared-probe"]');
	await dialog.getByLabel('Name').fill('team-probe');
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

async function mockOpenRouter(page: Page, opts: { key: boolean; vision: boolean; reply?: string }): Promise<{ bodies: { messages: { role: string; content: unknown }[] }[] }> {
	await page.addInitScript((withKey) => {
		try {
			if (withKey) localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable: the spec fails loudly on the missing control */
		}
	}, opts.key);
	const seen: { bodies: { messages: { role: string; content: unknown }[] }[] } = { bodies: [] };
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/chat/completions')) {
			const body = route.request().postDataJSON() as { stream?: boolean; messages: { role: string; content: unknown }[] };
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
			const model = { id: MOCK_MODEL, name: 'Mock model', pricing: { prompt: '0.000003', completion: '0.000015' }, context_length: 200000, architecture: { input_modalities: opts.vision ? ['text', 'image'] : ['text'] } };
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [model] }) });
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
	const seen = await mockOpenRouter(page, { key: true, vision: true, reply: '"A team standing on a roof at sunset."' });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'suggest-me');
	await dialog.getByRole('button', { name: 'Suggest' }).click();
	await expect(dialog.getByLabel('Description')).toHaveValue('A team standing on a roof at sunset.', { timeout: 30_000 });

	// What went to the model: an image part carrying a small JPEG thumbnail, and the no-guessing contract.
	expect(seen.bodies).toHaveLength(1);
	const [sys, user] = seen.bodies[0].messages;
	// The system message may arrive as cache-wrapped text parts, so read its text whichever shape it has.
	expect(JSON.stringify(sys.content)).toMatch(/Never guess names, places, brands/);
	const parts = user.content as { type: string; image_url?: { url: string } }[];
	const img = parts.find((p) => p.type === 'image_url')?.image_url?.url ?? '';
	expect(img.startsWith('data:image/jpeg;base64,')).toBe(true);
	expect(img.length, 'a thumbnail, not the stored photo').toBeLessThan(200_000);

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
	await dialog.getByRole('button', { name: 'Suggest' }).click();
	await expect(dialog.getByText(/can't read images/)).toBeVisible({ timeout: 30_000 });
	await expect(dialog.getByLabel('Description')).toHaveValue('');
});

test('@smoke Suggest with no model connected points to Setup and sends nothing', async ({ page }) => {
	test.slow();
	const seen = await mockOpenRouter(page, { key: false, vision: true });
	await gotoStudio(page);
	const dialog = await openPhotoDialog(page, 'no-key');
	await dialog.getByRole('button', { name: 'Suggest' }).click();
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
	await dialog.getByLabel('Description').fill('Pressed Enter to save');
	await page.keyboard.press('Enter');
	await expect(dialog).toBeHidden();
	expect((await mediaRows(page))[0].caption).toBe('Pressed Enter to save');

	// Escape closes without saving, and focus goes back to the control that opened it.
	await thumb.focus();
	await page.keyboard.press('Enter');
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Credit').fill('Not saved');
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

	const imagesTab = page.getByRole('tab', { name: 'Images' });
	if (!(await imagesTab.isVisible().catch(() => false))) await page.getByRole('button', { name: CHROME.library }).click();
	await imagesTab.click();
	await page.locator('[data-media-card="full-disk"]').getByRole('button', { name: 'Details for full-disk' }).click();
	const first = page.locator('[data-media-detail="full-disk"]');
	await first.getByLabel('Name').fill('roomy');
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
