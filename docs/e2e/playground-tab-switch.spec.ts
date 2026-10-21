import { expect, type Page, test } from '@playwright/test';

/**
 * Switching between Edit and Explore on a phone, where they are two tabs of one pane. Each test reads
 * what a person reads: the line the caret is on, how far the editor is scrolled, and which slide the
 * preview is showing.
 *
 *   - Explore opens on the slide the caret is in, and the caret does not move;
 *   - going back to Edit leaves the editor exactly as it was (no replaced document, no lost caret);
 *   - a click on another slide in Explore puts the caret at the end of that slide's title in Edit;
 *   - a reload of the same deck puts the caret back.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
const FOCUS_KEY = 'lattice-docs-pg-caret';
const SLIDES = 10;
const TAGS = '@mobile @webkit-phone';

const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

async function open(page: Page) {
	test.skip((page.viewportSize()?.width ?? 0) > 820, 'the tabbed single-pane layout only');
	await page.addInitScript(
		([key, src]) => {
			if (!localStorage.getItem(key)) localStorage.setItem(key, src);
		},
		[SOURCE_KEY, deck],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.locator('.cm-content').waitFor({ timeout: 60_000 });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
}

/** Put the caret on the line `text` and type after it. The editor draws only the lines near its viewport, so scroll until it does. */
async function editLine(page: Page, text: string) {
	const line = page.locator('.cm-line', { hasText: text }).first();
	await expect
		.poll(
			async () => {
				if (await line.count()) return true;
				await page.evaluate(() => {
					const sc = document.querySelector('.cm-scroller') as HTMLElement;
					sc.scrollTop += sc.clientHeight * 0.8;
				});
				return false;
			},
			{ timeout: 20_000 },
		)
		.toBe(true);
	await line.scrollIntoViewIfNeeded();
	await line.click();
	await page.keyboard.type(' edited');
}

const caretLine = (page: Page) => page.locator('.cm-activeLine').textContent();
const editorScroll = (page: Page) => page.evaluate(() => Math.round((document.querySelector('.cm-scroller') as HTMLElement).scrollTop));

/** The slide of the preview the reader sees most of (1-based). */
const shownSlide = (page: Page) =>
	page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const win = f.contentWindow as Window;
		let best = 0;
		let bestSeen = -1;
		f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').forEach((el, i) => {
			const r = el.getBoundingClientRect();
			const seen = Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top));
			if (seen > bestSeen) {
				bestSeen = seen;
				best = i + 1;
			}
		});
		return best;
	});

test(`Explore opens on the slide the caret is in, and Edit is as it was ${TAGS}`, async ({ page }) => {
	await open(page);
	await editLine(page, 'point 7.2');
	const line = await caretLine(page);
	expect(line).toContain('edited');
	const scroll = await editorScroll(page);
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect.poll(() => caretLine(page)).toBe(line);
	await expect.poll(async () => Math.abs((await editorScroll(page)) - scroll)).toBeLessThan(4);
});

test(`a click on another slide in Explore puts the caret at the end of its title ${TAGS}`, async ({ page }) => {
	await open(page);
	await editLine(page, 'point 7.2');
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
	await page.frameLocator('#preview').locator('section[data-lattice-slide="3"]').scrollIntoViewIfNeeded();
	await page.frameLocator('#preview').locator('section[data-lattice-slide="3"]').click({ position: { x: 40, y: 20 } });
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect.poll(() => caretLine(page)).toBe('# Slide 3 title');
});

test(`a reload of the same deck puts the caret back ${TAGS}`, async ({ page }) => {
	await open(page);
	await editLine(page, 'point 5.1');
	const line = await caretLine(page);
	// The caret is saved on the hub's idle lane, keyed by the text it was saved for: wait until that is the text as typed.
	await expect
		.poll(
			() =>
				page.evaluate(
					([k, src]) => {
						const saved = JSON.parse(localStorage.getItem(k) ?? 'null') as { h?: string } | null;
						return saved?.h?.endsWith(`:${localStorage.getItem(src)?.length}`) ?? false;
					},
					[FOCUS_KEY, SOURCE_KEY],
				),
			{ timeout: 10_000 },
		)
		.toBe(true);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('.cm-content').waitFor({ timeout: 60_000 });
	await expect.poll(() => caretLine(page), { timeout: 20_000 }).toBe(line);
});
