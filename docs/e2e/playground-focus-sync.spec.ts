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

/** Scroll the preview until slide `n` (1-based) is centered in it (the first and last come as near as the ends allow). */
const scrollPreviewTo = (page: Page, n: number) =>
	page.evaluate((i) => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const win = f.contentWindow as Window;
		const el = f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]')[i - 1] as HTMLElement | undefined;
		if (!el) return;
		const r = el.getBoundingClientRect();
		win.scrollTo({ top: r.top + win.scrollY - (win.innerHeight - r.height) / 2, behavior: 'auto' });
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

test(`the preview and editor scrollbars are thin and quiet ${TAGS}`, async ({ page, browserName }) => {
	await open(page);
	const bars = await page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const html = f.contentDocument?.documentElement as HTMLElement;
		const cm = document.querySelector('.cm-scroller') as HTMLElement;
		return { frame: [getComputedStyle(html).scrollbarWidth, getComputedStyle(html).scrollbarColor], editor: [getComputedStyle(cm).scrollbarWidth, getComputedStyle(cm).scrollbarColor] };
	});
	// Firefox resolves `thin` to `none` under the headless runner's overlay scrollbars, so the width is
	// only asserted to be ours (not the browser's `auto`); the color is the claim that never varies.
	if (browserName === 'chromium') {
		expect(bars.frame[0]).toBe('thin');
		expect(bars.editor[0]).toBe('thin');
	}
	// One scrollbar, two scrollers: the frame is handed the color the page resolves, so they are identical.
	expect(bars.frame[1]).toBe(bars.editor[1]);
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
	// …and the preview marks slide 1 again too.
	await expect.poll(() => markedSlide(page)).toBe('1');
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

/** The preview slide carrying the focus mark, as its stamp (`data-lattice-slide`), or ''. */
const markedSlide = (page: Page) =>
	page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		return Array.from(f.contentDocument?.querySelectorAll('.lattice > section.db-active') ?? []).map((el) => el.getAttribute('data-lattice-slide')).join(',');
	});

test(`scrolling the editor marks and shows the same slide in the preview ${TAGS}`, async ({ page }) => {
	await open(page);
	await page.locator('.cm-content').focus();
	const before = await caret(page);
	// Wheel the editor down the way a reader does.
	await page.locator('.cm-scroller').hover();
	await page.mouse.wheel(0, 900);
	// The slide marked in the preview and the one the editor's band names agree, and it is not the first: a wheel
	// can keep scrolling for a moment, so compare the two at the same instant until they settle.
	await expect
		.poll(async () => {
			const marked = await markedSlide(page);
			const named = (await band(page)).map((l) => /^# Slide (\d+) title/.exec(l)?.[1]).find(Boolean);
			return marked !== '' && marked !== '1' && marked === named;
		})
		.toBe(true);
	// …and the preview has scrolled along with it.
	await expect.poll(async () => Math.abs((await previewSlide(page)) - Number(await markedSlide(page)))).toBeLessThanOrEqual(1);
	// The caret did not move.
	expect(await caret(page)).toEqual(before);
});

test(`a middle slide is centered in both panes, the first at the top, the last at the bottom ${TAGS}`, async ({ page }) => {
	await open(page);
	await scrollPreviewTo(page, 4);
	// Center of the marked slide's band in the editor and of the slide in the preview, as heights in each pane.
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 4 title'))).toBe(true);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const f = document.getElementById('preview') as HTMLIFrameElement;
				const sec = f.contentDocument?.querySelector('section[data-lattice-slide="4"]')?.getBoundingClientRect();
				const first = document.querySelector('.cm-slide-band-first')?.getBoundingClientRect();
				const last = document.querySelector('.cm-slide-band-last')?.getBoundingClientRect();
				const ed = document.querySelector('.cm-scroller')?.getBoundingClientRect();
				if (!sec || !first || !last || !ed) return 999;
				const pvCenter = sec.top + sec.height / 2 - f.contentWindow!.innerHeight / 2;
				const edCenter = (first.top + last.bottom) / 2 - (ed.top + ed.height / 2);
				// Both are offsets from the middle of their own window: centered slides are both near zero.
				return Math.max(Math.abs(pvCenter), Math.abs(edCenter));
			}),
		)
		.toBeLessThan(60);
	// The ends: the first slide's band starts at the top of the editor, the last slide's ends at the bottom of the document.
	await scrollPreviewTo(page, 1);
	await expect.poll(async () => (await band(page)).some((l) => l.includes('Slide 1 title'))).toBe(true);
	expect(await page.evaluate(() => (document.querySelector('.cm-scroller') as HTMLElement).scrollTop)).toBeLessThan(4);
});

test(`the editor scrolls past its last line, as the Studio editor does ${TAGS}`, async ({ page }) => {
	await open(page);
	const room = await page.evaluate(async () => {
		const scroller = document.querySelector('.cm-scroller') as HTMLElement;
		scroller.scrollTop = scroller.scrollHeight;
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		const lines = document.querySelectorAll('.cm-line');
		const last = lines[lines.length - 1].getBoundingClientRect();
		return scroller.getBoundingClientRect().bottom - last.bottom;
	});
	// Pinned to the edge it would be a few pixels; scrolled past, a good part of the pane is left under it.
	expect(room).toBeGreaterThan(150);
});

test(`the slide in focus carries a bar down its left edge, not an outline ${TAGS}`, async ({ page }) => {
	await open(page);
	await scrollPreviewTo(page, 3);
	await expect.poll(() => markedSlide(page)).toBe('3');
	const look = await page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const sec = f.contentDocument?.querySelector('.lattice > section.db-active') as HTMLElement;
		const cs = getComputedStyle(sec);
		// The shadow is `inset <x> 0 0 0`: a bar of width x on the left, none on the other three sides.
		return { shadow: cs.boxShadow, outline: cs.outlineStyle };
	});
	expect(look.outline).toBe('none');
	expect(look.shadow).toMatch(/inset/);
	expect(look.shadow).toMatch(/\s6px 0px 0px 0px/);
});
