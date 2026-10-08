import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, gotoStudio, railButtons, setEditorContent, test, toastText } from './studio-fixture';

// Drop a deck file on the Studio to open it (deck-drop.ts; owner's model, 2026-10-07: the
// whole shell, except the zones that own a drop). The drops are NATIVE: CDP
// `Input.dispatchDragEvent` sends them through the browser's own hit testing, so a drop
// over the preview iframe lands where a real one would. A `dispatchEvent('drop')` on a
// chosen element would skip exactly that routing, and pass while a real drop on the
// largest surface of the Studio went somewhere else.
//
// The native-drag arms are Chromium only: the CDP drag domain is Chromium's. One arm below
// builds its drag in the page instead, so it runs in WebKit and Gecko too (their CI projects
// pick it up by tag): it checks the shell's own logic in each engine, not the OS drag routing.

test.describe.configure({ timeout: 300_000 });

const DECK = [
	'# Halcyon quarterly — revue',
	'<!-- notes: open with the retention number -->\n\n## Retention held\n\n- 94% of accounts renewed.',
].join('\n\n---\n\n');
const SCRATCH = '# Scratch deck';

async function activeSource(page: Page): Promise<string> {
	return page.evaluate(() => {
		try {
			const active = JSON.parse(localStorage.getItem('lattice-studio-active') || '{}');
			return JSON.parse(localStorage.getItem(`lattice-studio-src-${active.deckId}`) || '""');
		} catch {
			return '';
		}
	});
}

/** The files a drop carries, written to disk (a CDP drag takes paths, as the OS does). */
async function deckFiles(): Promise<Record<'pdf' | 'lattice' | 'png' | 'md', string>> {
	const dir = mkdtempSync(join(tmpdir(), 'lattice-drop-'));
	writeFileSync(join(dir, 'deck.md'), DECK);
	const root = resolve(import.meta.dirname, '..', '..');
	// The PDF from the real CLI, as a recipient would get it.
	const r = spawnSync(process.execPath, [join(root, 'lattice-emulator.js'), join(dir, 'deck.md'), join(dir, 'Halcyon.pdf'), '--reopenable', '-q'], { encoding: 'utf8', timeout: 240_000 });
	expect(r.status, r.stderr).toBe(0);
	// The `.lattice` from the same kernel both writers use (lib/core/reopenable.js).
	const req = createRequire(join(root, 'package.json'));
	const bytes: Uint8Array = await req('./lib/core/reopenable.js').buildLatticeZip(req('jszip'), { source: DECK, title: 'Halcyon quarterly', comments: [], now: 0, packages: [], date: new Date(0) });
	writeFileSync(join(dir, 'Halcyon.lattice'), bytes);
	// Not a deck: a PNG header. The reader must refuse it by its bytes.
	writeFileSync(join(dir, 'photo.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
	// A Markdown file, for the code editor's own drop (it inserts the text).
	writeFileSync(join(dir, 'note.md'), 'dropped-line-7c3a');
	return { pdf: join(dir, 'Halcyon.pdf'), lattice: join(dir, 'Halcyon.lattice'), png: join(dir, 'photo.png'), md: join(dir, 'note.md') };
}

/** Drag `paths` in from outside the window to the center of `target`, then drop or cancel. */
async function nativeDrag(page: Page, target: Locator, paths: string[], { drop = true, before }: { drop?: boolean; before?: () => Promise<void> } = {}) {
	const box = await target.boundingBox();
	if (!box) throw new Error('drop target is not on screen');
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const cdp = await page.context().newCDPSession(page);
	const data = { items: [], files: paths, dragOperationsMask: 1 };
	try {
		await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
		await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
		if (before) await before();
		if (drop) await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
		else await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x, y, data });
	} finally {
		await cdp.detach();
	}
}

const sign = (page: Page) => page.locator('[data-deck-drop-sign]');
const preview = (page: Page) => page.locator('[aria-label="Live deck preview"]').first();

/** The source stored under every deck in the switcher (studio-store keys). */
async function allSources(page: Page): Promise<string[]> {
	return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-src-')).map((k) => JSON.parse(localStorage.getItem(k) || '""')));
}

let files: Awaited<ReturnType<typeof deckFiles>>;
test.beforeAll(async () => {
	files = await deckFiles();
});

test.beforeEach(async ({ page, viewport }) => {
	// Seeding types into the code editor, which is off-screen at phone width; the one arm that
	// reaches the 390 px project (the cross-engine arm, by its `@crosswidth` tag) stands down there.
	test.skip((viewport?.width ?? 1440) < 600, 'the shared setup seeds the deck through the code editor, off-screen at phone width');
	await gotoStudio(page);
	await setEditorContent(page, SCRATCH);
	await expect.poll(() => activeSource(page)).toBe(SCRATCH);
});

// THE CROSS-ENGINE ARM. It needs `@crosswidth` so the desktop project keeps it (desktop drops
// any `@webkit` title without that tag), which also routes it to the 390 px `mobile` project.
// There the shared beforeEach cannot seed the deck: it types into the code editor, which is
// off-screen at phone width. This arm is about ENGINES, not widths (the sign at 390 px is the
// screenshot arm's), so the shared beforeEach stands it down below 600 px rather than reshaping the setup.
// The drag is built in the page (Playwright passes a real DataTransfer
// holding a real File), so it runs in WebKit and Gecko as well as Chromium. It replays the
// WebKit pattern the checker flagged: a `dragleave` between two children with a NULL
// `relatedTarget`, which must not take the sign down. Then the drop must import.
// The preview needs no native-routing arm in those engines: its frame sits inside a
// `pointer-events-none` box (StudioShell's slide frame), so hit testing never picks the iframe.
test.describe('cross-engine', () => {
	test('@crosswidth @gecko @webkit-tablet a dropped .lattice opens in this engine, and a null-relatedTarget leave keeps the sign', async ({ page }) => {
	const bytes = [...readFileSync(files.lattice)];
	const dt = await page.evaluateHandle((b) => {
		const d = new DataTransfer();
		d.items.add(new File([new Uint8Array(b)], 'Halcyon.lattice'));
		return d;
	}, bytes);
	const target = page.locator('header').first();
	const box = await target.boundingBox();
	if (!box) throw new Error('header is not on screen');
	const at = { clientX: Math.round(box.x + box.width / 2), clientY: Math.round(box.y + box.height / 2) };
	await target.dispatchEvent('dragenter', { dataTransfer: dt, ...at });
	await target.dispatchEvent('dragover', { dataTransfer: dt, ...at });
	await expect(sign(page)).toBeVisible();
	// A leave with no relatedTarget, the pointer still inside the window: the sign stays.
	await target.dispatchEvent('dragleave', { dataTransfer: dt, relatedTarget: null, ...at });
	await expect(sign(page)).toBeVisible();
	await target.dispatchEvent('drop', { dataTransfer: dt, ...at });
	await expect(sign(page)).toBeHidden();
	await expect(toastText(page)).toContainText('Imported');
	await expect.poll(() => activeSource(page)).toBe(DECK);
	expect(await allSources(page)).toContain(SCRATCH);
});
});

test.describe('native drags (Chromium CDP)', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'CDP drag events are Chromium-only');

	test('a re-openable PDF dropped on the preview opens as a new deck, and the open one is kept', async ({ page }) => {
		await nativeDrag(page, preview(page), [files.pdf], {
			before: async () => {
				// The sign is up while the file is over the shell, and says what a drop does.
				await expect(sign(page)).toBeVisible();
				await expect(sign(page)).toContainText('Drop to open as a new deck');
			},
		});
		await expect(sign(page)).toBeHidden();
		await expect(toastText(page)).toContainText('Imported');
		await expect.poll(() => activeSource(page)).toBe(DECK);
		// A drop never edits the open deck: the scratch deck is still there, unchanged.
		expect(await allSources(page)).toContain(SCRATCH);
	});

	test('a .lattice dropped on the header opens the exact deck', async ({ page }) => {
		await nativeDrag(page, page.locator('header').first(), [files.lattice]);
		await expect(toastText(page)).toContainText('Imported');
		await expect.poll(() => activeSource(page)).toBe(DECK);
	});

	test('a drop that is not one deck is refused with the reason, and nothing opens', async ({ page }) => {
		await nativeDrag(page, preview(page), [files.pdf, files.lattice]);
		await expect(toastText(page)).toContainText('Drop one deck at a time');
		await nativeDrag(page, preview(page), [files.png]);
		await expect(toastText(page)).toContainText('can’t open that kind of file');
		expect(await activeSource(page)).toBe(SCRATCH);
		expect((await allSources(page)).filter((s) => s === DECK)).toHaveLength(0);
		await expect(railButtons(page)).toHaveCount(1);
	});

	test('the code editor keeps its own drop: no sign, no import', async ({ page }) => {
		const editor = page.locator('.cm-editor').first();
		test.skip(!(await editor.isVisible()), 'the code editor is not on screen at this width');
		await nativeDrag(page, editor, [files.pdf], {
			before: async () => {
				await expect(sign(page)).toBeHidden();
			},
		});
		await page.waitForTimeout(1000);
		expect(await activeSource(page)).toBe(SCRATCH);
		expect((await allSources(page)).filter((s) => s === DECK)).toHaveLength(0);
	});

	// The shell refuses a file drop in a zone that did not take it, instead of letting the
	// browser navigate the tab to the file. The compose editor is the case that needs it:
	// ProseMirror cancels `dragover`, then ignores a drop with no text in it.
	test('a PDF dropped on the compose editor is refused: no import, and the tab stays in the Studio', async ({ page }) => {
		const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
		if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
		await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
		const compose = page.locator('.cs-host .ProseMirror').first();
		await compose.waitFor();
		const url = page.url();
		await nativeDrag(page, compose, [files.pdf], {
			before: async () => {
				await expect(sign(page)).toBeHidden();
			},
		});
		await page.waitForTimeout(1000);
		expect(page.url()).toBe(url);
		expect(await activeSource(page)).toBe(SCRATCH);
		expect((await allSources(page)).filter((s) => s === DECK)).toHaveLength(0);
	});

	// Present is a talk in progress: a drop must not swap the deck the audience is watching.
	test('a drop while presenting is refused, and Present stays on the open deck', async ({ page }) => {
		await page.getByRole('button', { name: 'Present' }).click();
		const present = page.getByRole('dialog', { name: 'Present' });
		await expect(present).toBeVisible();
		const url = page.url();
		await nativeDrag(page, page.locator('body'), [files.pdf], {
			before: async () => {
				await expect(sign(page)).toBeHidden();
			},
		});
		await page.waitForTimeout(1000);
		await expect(present).toBeVisible();
		expect(page.url()).toBe(url);
		expect(await activeSource(page)).toBe(SCRATCH);
		expect((await allSources(page)).filter((s) => s === DECK)).toHaveLength(0);
	});

	// The refusal above must not reach the code editor, which takes a dropped text file itself.
	test('the code editor still takes a dropped Markdown file as text', async ({ page }) => {
		const editor = page.locator('.cm-editor').first();
		test.skip(!(await editor.isVisible()), 'the code editor is not on screen at this width');
		await nativeDrag(page, editor.locator('.cm-content'), [files.md]);
		await expect.poll(() => activeSource(page)).toContain('dropped-line-7c3a');
		expect((await allSources(page)).filter((s) => s === DECK)).toHaveLength(0);
	});

	// The sign at the three widths the site ships to. Taken here, not by tools/screenshot.js,
	// because it is only on screen DURING a drag, and that tool cannot hold one. Set
	// DROP_SHOTS=<dir> to keep the shots; they land in the test's output folder otherwise.
	test('the sign fits the screen at desktop, tablet and phone widths, light and dark', async ({ page }, info) => {
		const shots = [['1440', 1440, 900, 'light'], ['820', 820, 1180, 'light'], ['390', 390, 844, 'light'], ['1440-dark', 1440, 900, 'dark']] as const;
		for (const [label, width, height, colorScheme] of shots) {
			await page.setViewportSize({ width, height });
			if (colorScheme === 'dark') {
				// The site's own mode switch (the key its pre-paint script reads), then a reload.
				await page.evaluate(() => localStorage.setItem('lattice-docs-mode', 'dark'));
				await page.reload();
				await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
			}
			await nativeDrag(page, page.locator('header').first(), [files.pdf], {
				drop: false,
				before: async () => {
					await expect(sign(page)).toBeVisible();
					const box = await sign(page).boundingBox();
					expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `sign inside the ${label}px viewport`).toBe(true);
					const out = process.env.DROP_SHOTS ? join(process.env.DROP_SHOTS, `drop-sign-${label}.png`) : info.outputPath(`drop-sign-${label}.png`);
					await page.screenshot({ path: out });
				},
			});
			await expect(sign(page)).toBeHidden();
		}
		expect(await activeSource(page)).toBe(SCRATCH);
	});
});
