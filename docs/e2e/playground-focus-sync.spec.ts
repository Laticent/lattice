import { expect, type Page, test } from '@playwright/test';

/**
 * The Playground's one focus: the editor, the preview and the slide map move together
 * (lib/playground-sync.ts, over the Fuoco hub). Each test reads what a person reads: the band the
 * editor paints over a slide's lines, the line the caret is on, and the preview's own scroll. None of
 * them reads the hub.
 *
 *   - scrolling the preview shows the viewed slide in the editor and leaves the caret alone;
 *   - the next key in the editor brings the preview back to the caret;
 *   - a click on a slide puts the caret at the end of its title with the slide, `---` fences
 *     included, on screen;
 *   - a click inside the band lands where it was made;
 *   - both scrollers carry the thin, quiet scrollbar.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
const SLIDES = 8;

const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

/** The editor and the preview share the screen only in the two-pane layout; a phone shows one pane at a time. */
const TAGS = '@crosswidth @gecko @webkit-tablet';

async function open(page: Page) {
	test.skip((page.viewportSize()?.width ?? 0) < 821, 'two-pane layout only');
	await page.addInitScript(
		([key, src]) => {
			localStorage.setItem(key, src);
		},
		[SOURCE_KEY, deck],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.locator('.cm-content').waitFor({ timeout: 60_000 });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
	await expect.poll(() => sectionCount(page)).toBeGreaterThanOrEqual(SLIDES);
}

const sectionCount = (page: Page) => page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement | null)?.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').length ?? 0);

/** The text of the lines the band covers, in order. */
const band = (page: Page) => page.locator('.cm-line.cm-slide-band').allTextContents();

/** The caret: its line's text and its column in that line. */
const caret = (page: Page) =>
	page.evaluate(() => {
		const line = document.querySelector('.cm-activeLine') as HTMLElement | null;
		const sel = window.getSelection();
		if (!line || !sel?.focusNode) return null;
		const r = document.createRange();
		r.setStart(line, 0);
		r.setEnd(sel.focusNode, sel.focusOffset);
		return { line: line.textContent ?? '', col: r.toString().length };
	});

/** Scroll the preview until slide `n` (1-based) is the one in view. */
const scrollPreviewTo = (page: Page, n: number) =>
	page.evaluate((i) => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const el = f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]')[i - 1] as HTMLElement | undefined;
		if (el) f.contentWindow?.scrollTo({ top: el.getBoundingClientRect().top + (f.contentWindow?.scrollY ?? 0) - 12, behavior: 'auto' });
	}, n);

/** The page of the preview the reader sees most of. */
const previewSlide = (page: Page) =>
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

/** Whether the band's first and last line are inside the editor's scroller. */
const bandOnScreen = (page: Page) =>
	page.evaluate(() => {
		const scroller = document.querySelector('.cm-scroller')?.getBoundingClientRect();
		const first = document.querySelector('.cm-slide-band-first')?.getBoundingClientRect();
		const last = document.querySelector('.cm-slide-band-last')?.getBoundingClientRect();
		if (!scroller || !first || !last) return false;
		return first.top >= scroller.top - 1 && last.bottom <= scroller.bottom + 1;
	});

test(`the preview and editor scrollbars are thin and quiet ${TAGS}`, async ({ page }) => {
	await open(page);
	const bars = await page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const html = f.contentDocument?.documentElement as HTMLElement;
		const cm = document.querySelector('.cm-scroller') as HTMLElement;
		return { frame: [getComputedStyle(html).scrollbarWidth, getComputedStyle(html).scrollbarColor], editor: [getComputedStyle(cm).scrollbarWidth, getComputedStyle(cm).scrollbarColor] };
	});
	// Firefox resolves `thin` to `none` under the headless runner's overlay scrollbars, so the width is
	// only asserted to be ours (not the browser's `auto`); the colour is the claim that never varies.
	for (const [width, color] of [bars.frame, bars.editor]) {
		expect(width).not.toBe('auto');
		expect(color).not.toBe('auto');
	}
});

test(`scrolling the preview shows that slide in the editor and leaves the caret where it was ${TAGS}`, async ({ page }) => {
	await open(page);
	await page.locator('.cm-content').focus();
	const before = await caret(page);
	await scrollPreviewTo(page, 5);
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 5 title'))).toBe(true);
	// The band frames the slide, `---` fences included, and the editor has scrolled to it.
	const lines = await band(page);
	expect(lines[0]).toBe('---');
	expect(lines.at(-1)).toBe('---');
	await expect.poll(() => bandOnScreen(page)).toBe(true);
	// The caret did not move.
	expect(await caret(page)).toEqual(before);
});

test(`the next key in the editor brings the preview and the band back to the caret ${TAGS}`, async ({ page }) => {
	await open(page);
	await page.locator('.cm-content').focus();
	await scrollPreviewTo(page, 6);
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 6 title'))).toBe(true);
	await page.keyboard.press('ArrowDown');
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 1 title'))).toBe(true);
	await expect.poll(() => previewSlide(page)).toBe(1);
});

test(`a click on a slide in the preview puts the caret at the end of its title and frames the slide ${TAGS}`, async ({ page }) => {
	await open(page);
	const frame = page.frameLocator('#preview');
	await scrollPreviewTo(page, 6);
	await frame.locator('section[data-lattice-slide="6"]').click();
	await expect.poll(() => caret(page)).toEqual({ line: '# Slide 6 title', col: '# Slide 6 title'.length });
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 6 title'))).toBe(true);
	await expect.poll(() => bandOnScreen(page)).toBe(true);
	// The editor took keyboard focus (a mouse pick), so typing lands at the title.
	await page.keyboard.type('!');
	await expect(page.locator('.cm-activeLine')).toHaveText('# Slide 6 title!');
});

test(`a click inside the band lands where it was made ${TAGS}`, async ({ page }) => {
	await open(page);
	const frame = page.frameLocator('#preview');
	await scrollPreviewTo(page, 3);
	await frame.locator('section[data-lattice-slide="3"]').click();
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 3 title'))).toBe(true);
	const point = page.locator('.cm-line.cm-slide-band', { hasText: 'point 3.4' });
	const box = await point.boundingBox();
	if (!box) throw new Error('the band line is not on screen');
	await page.mouse.click(box.x + 28, box.y + box.height / 2);
	const at = await caret(page);
	expect(at?.line).toBe('- point 3.4');
	expect(at?.col).toBeGreaterThan(0);
	expect(at?.col).toBeLessThan('- point 3.4'.length);
});
