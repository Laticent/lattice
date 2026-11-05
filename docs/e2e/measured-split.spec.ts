/**
 * The MEASURED split in the Studio's live preview (`fit: pack`,
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §16), on the real Studio, against the
 * same deck without it. The CLI's side is test/integration/parity/measured-split.test.js; this pins
 * that the preview packs the way the export does, and that a small edit keeps the split (§11).
 *
 *  - a slide past its component's item count that FITS stays one page under `fit: pack`, while the
 *    structural split cuts it;
 *  - a slide that overflows packs several items a page: fewer pages than one a page;
 *  - typing a few words into a packed slide does not change its page count (the memory).
 */
import { readFileSync } from 'node:fs';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

const items = (n: number) => Array.from({ length: n }, (_, i) => `- Item ${i + 1} on the agenda`).join('\n');
const deck = (fit: string, size: string, n: number) => `---\nmarp: true\ntheme: indaco\nsize: ${size}\n${fit ? `fit: ${fit}\n` : ''}---\n\n<!-- _class: agenda -->\n\n## The agenda\n\n${items(n)}\n`;

type Measured = { plan: Record<string, unknown>; remembered: string[]; facts: { slide: string; over: boolean }[]; rounds: number; fellBack: number; reused?: boolean } | null;
/** What the Studio's hidden frame last measured and planned (docs/src/lib/measured-split.ts). */
function lastMeasured(page: import('@playwright/test').Page): Promise<Measured> {
	return page.evaluate(() => ((window as unknown as { __latticeLastMeasuredSplit?: Measured }).__latticeLastMeasuredSplit ?? null));
}

// The measured split warns when it cannot measure and keeps the structural split: surface that in the
// test log, so a failure here says why.
test.beforeEach(({ page }) => {
	page.on('console', (m) => {
		if (/lattice: the measured split/.test(m.text())) console.log(`[${test.info().project.name}] ${m.text()}`);
	});
});

/** The split pill's page count for the shown slide ("Page 2, 1 of 4 in this slide"), or 1 when it shows none. */
async function pagesInSlide(page: import('@playwright/test').Page): Promise<number> {
	const pill = page.getByRole('status', { name: /of \d+ in this slide/ });
	if (!(await pill.count())) return 1;
	const name = (await pill.first().getAttribute('aria-label')) ?? (await pill.first().innerText());
	return Number(/of (\d+) in this slide/.exec(name)?.[1] ?? '1');
}

test.describe('@crosswidth @webkit-tablet @gecko the measured split in the Studio preview', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('a slide that fits stays one page under fit: pack; the structural split cuts it', async ({ page }, info) => {
		await gotoStudio(page);
		await setEditorContent(page, deck('', 'portrait', 8));
		await expect(livePreview(page).locator('section').first()).toBeVisible();
		await expect.poll(() => pagesInSlide(page), { timeout: 20000 }).toBeGreaterThan(1);

		await setEditorContent(page, deck('pack', 'portrait', 8));
		// The measured split ran, and planned this slide whole.
		await expect.poll(async () => Object.values((await lastMeasured(page))?.plan ?? {}), { timeout: 20000 }).toEqual(['whole']);
		await expect.poll(() => pagesInSlide(page), { timeout: 20000 }).toBe(1);
		const shown = livePreview(page).locator('section').first();
		await expect(shown).toContainText('Item 1 on the agenda');
		await expect(shown).toContainText('Item 8 on the agenda');
		await page.screenshot({ path: info.outputPath('fits-whole.png') });
	});

	test('an overflowing slide packs several items a page, and a small edit keeps its pages', async ({ page }, info) => {
		await gotoStudio(page);
		await setEditorContent(page, deck('', 'square', 18));
		await expect.poll(() => pagesInSlide(page), { timeout: 20000 }).toBeGreaterThan(18);
		const structural = await pagesInSlide(page);

		await setEditorContent(page, deck('pack', 'square', 18));
		// The measured split ran, and packed this slide's items onto pages of several.
		await expect.poll(async () => Object.values((await lastMeasured(page))?.plan ?? {}).some((v) => Array.isArray(v) && v.some((n) => n > 1)), { timeout: 20000 }).toBe(true);
		await expect.poll(() => pagesInSlide(page), { timeout: 20000 }).toBeLessThan(structural);
		// The CLI packs this deck as 9 + 9 (test/integration/parity/measured-split.test.js): the same pages here.
		expect(Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v))).toEqual([9, 9]);
		const packed = await pagesInSlide(page);
		expect(packed).toBeGreaterThan(1);
		await page.screenshot({ path: info.outputPath('packed.png') });

		// One item grows by a whole line: the memory is consulted, and the run keeps its pages (§11).
		const packedPlan = Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v));
		await page.locator('.cm-line', { hasText: 'Item 3 on the agenda' }).first().click();
		await page.keyboard.press('End');
		await page.keyboard.insertText(' and a longer note that wraps this item onto a second line');
		await expect(livePreview(page).locator('section').first()).toContainText('wraps this item onto a second line', { timeout: 20000 });
		await expect.poll(async () => (await lastMeasured(page))?.remembered ?? [], { timeout: 20000 }).toContain('1');
		expect(await pagesInSlide(page)).toBe(packed);
		await page.screenshot({ path: info.outputPath('edited.png') });

		// Undo puts the text back, and the slide's split for that text with it (fix B).
		await page.keyboard.press('ControlOrMeta+z');
		await expect(livePreview(page).locator('section').first()).not.toContainText('wraps this item onto a second line', { timeout: 20000 });
		await expect.poll(async () => Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v)), { timeout: 20000 }).toEqual(packedPlan);
		expect(await pagesInSlide(page)).toBe(packed);
	});
});

test.describe('@crosswidth @webkit-tablet @gecko typing in a fit: pack slide', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('does not measure while the author types, and measures once after the pause (§17)', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, deck('pack', 'square', 18));
		await expect.poll(async () => Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v)), { timeout: 20000 }).toEqual([9, 9]);
		const count = () => page.evaluate(() => (window as unknown as { __latticeMeasureCount?: number }).__latticeMeasureCount ?? 0);
		// Settled: the count holds across two reads half a second apart, so no measurement is in flight.
		let last = -1;
		await expect
			.poll(async () => {
				const c = await count();
				const steady = c === last;
				last = c;
				return steady;
			}, { intervals: [500], timeout: 15000 })
			.toBe(true);
		const before = await count();
		await page.locator('.cm-line', { hasText: 'Item 3 on the agenda' }).first().click();
		await page.keyboard.press('End');
		// Twelve keystrokes, faster than the pause: the preview redraws each one with the slide's last plan.
		await page.keyboard.type(' and more!!', { delay: 60 });
		expect(await count(), 'no measurement while typing').toBe(before);
		await expect(livePreview(page).locator('section').first()).toBeVisible();
		// The pause measures once, and the pages settle on the plan for the new text.
		await expect.poll(count, { timeout: 15000 }).toBe(before + 1);
		await expect.poll(async () => Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v)), { timeout: 15000 }).toEqual([9, 9]);
		// The preview RE-RENDERED with that plan: a measurement writes its record without `reused`, and
		// only the render the `lattice:measured-split-ready` event triggers reads the cached plan and
		// marks it `reused`. Without the event the record would stay as the measurement left it.
		await expect.poll(async () => (await lastMeasured(page))?.reused === true, { timeout: 15000 }).toBe(true);
	});
});

test.describe('@crosswidth @webkit-tablet @gecko the measured split in the Playground', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('a fit: pack deck packs its overflowing slide in the filmstrip, as the CLI does', async ({ page }) => {
		await page.addInitScript((s) => {
			try {
				localStorage.setItem('lattice-docs-pg-source', s);
			} catch {
				/* the assertions below then fail loudly */
			}
		}, deck('pack', 'square', 18));
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
		await expect(page.frameLocator('#preview').locator('section[data-lattice-slide]').first()).toBeVisible({ timeout: 30_000 });
		// The Playground's hidden frame measured the deck and packed the slide: every item placed,
		// several to a page. The CLI packs this deck as 9 + 9 (test/integration/parity/measured-split.test.js).
		await expect
			.poll(async () => {
				const sizes = Object.values((await lastMeasured(page))?.plan ?? {}).find((v) => Array.isArray(v)) as number[] | undefined;
				return sizes ?? null;
			}, { timeout: 30_000 })
			.toEqual([9, 9]);
	});
});

test.describe('@crosswidth @webkit-tablet @gecko the measured split in the Studio\'s webpage export', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('Share → Webpage packs a fit: pack deck as the CLI does', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, deck('pack', 'square', 18));
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: /Webpage/ }).click();
		const download = page.waitForEvent('download', { timeout: 240_000 });
		await dialog.getByRole('button', { name: /Download webpage/ }).click();
		const html = readFileSync((await (await download).path()) as string, 'utf8');
		// The downloaded file's own pages: a cover and two pages of nine list items, the CLI's 9 + 9 for
		// this deck. Items, not text: a page's carousel signal quotes the next page's first item.
		const bodies = html.split(/(?=<section\b)/).filter((p) => /data-split-role="body"/.test(p.slice(0, 1200)));
		expect(bodies.map((p) => (p.slice(0, p.indexOf('</section>')).match(/<li\b/g) || []).length)).toEqual([9, 9]);
	});
});
