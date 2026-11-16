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
const WIDE = '@crosswidth @gecko @webkit-tablet';

const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

async function open(page: Page, wide = false) {
	const w = page.viewportSize()?.width ?? 0;
	test.skip(wide ? w <= 820 : w > 820, wide ? 'the two-pane layout only' : 'the tabbed single-pane layout only');
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

test(`on a wide screen, Explore and back leaves the editor where it was and the caret's slide in view ${WIDE}`, async ({ page }) => {
	await open(page, true);
	await editLine(page, 'point 7.2');
	// Let the preview follow the caret's slide before leaving.
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
	const line = await caretLine(page);
	const scroll = await editorScroll(page);
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
	await page.getByRole('tab', { name: 'Edit' }).click();
	// The outgoing document scrolls at the new width before the fresh one loads: it must not drag the editor.
	await expect.poll(() => caretLine(page)).toBe(line);
	await expect.poll(async () => Math.abs((await editorScroll(page)) - scroll), { timeout: 10_000 }).toBeLessThan(4);
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
});

/**
 * What the reader SEES across a switch: every animation frame, whether the preview is on screen and which slide
 * it shows, and whether it is still the document that was there before the click (a rewrite is a reload).
 */
async function watchSwitch(page: Page, click: () => Promise<void>) {
	await page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		(f.contentWindow as unknown as { __before: boolean }).__before = true;
		const w = window as unknown as { __frames: Array<{ seen: boolean; slide: number; same: boolean }>; __watching: boolean };
		w.__frames = [];
		w.__watching = true;
		const tick = () => {
			const cs = getComputedStyle(f);
			// On a phone the Edit pane hides the preview (zero width): that is not a frame the reader can see.
			const seen = cs.visibility === 'visible' && Number.parseFloat(cs.opacity) > 0.05 && f.getBoundingClientRect().width > 0;
			let slide = -1;
			let same = false;
			try {
				const win = f.contentWindow as Window;
				same = (win as unknown as { __before?: boolean }).__before === true;
				let best = -1;
				f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').forEach((el, i) => {
					const r = el.getBoundingClientRect();
					const v = Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top));
					if (v > best) {
						best = v;
						slide = i + 1;
					}
				});
			} catch {
				/* mid-navigation */
			}
			w.__frames.push({ seen, slide, same });
			if (w.__watching) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await click();
}

/** Wait `n` animation frames inside the page (a pause measured in what the reader sees, not in milliseconds). */
const frames = (page: Page, n: number) =>
	page.evaluate(
		(count) =>
			new Promise<void>((resolve) => {
				let left = count;
				const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
		n,
	);

/** Click a mode tab from inside the page, so two switches can be a given number of frames apart. */
const clickTab = (page: Page, name: 'Explore' | 'Edit') => page.evaluate((n) => (document.querySelector(`[role="tab"][aria-label="${n}"]`) as HTMLElement).click(), name);

const stopWatching = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as { __frames: Array<{ seen: boolean; slide: number; same: boolean }>; __watching: boolean };
		w.__watching = false;
		return w.__frames;
	});

for (const [name, wide, tags] of [
	['phone', false, TAGS],
	['wide', true, WIDE],
] as const) {
	test(`switching to Explore after an edit never shows a wrong slide, and does not reload the preview (${name}) ${tags}`, async ({ page }) => {
		await open(page, wide);
		await editLine(page, 'point 7.2');
		// A phone's Edit pane hides the preview, so only the wide layout shows it following the caret.
		if (wide) await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
		await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
		await watchSwitch(page, () => page.getByRole('tab', { name: 'Explore' }).click());
		await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
		await expect
			.poll(() => page.evaluate(() => document.querySelector('.pg-preview-wrap')?.classList.contains('is-live')), { timeout: 20_000 })
			.toBe(true);
		// Keep watching until the reader has SEEN the preview, and past it. `is-live` and the shown slide are both true
		// while the pane is still fading in (opacity under 0.05), so stopping on them alone recorded no seen frame at all
		// on a loaded WebKit, and `seen.length > 0` failed on a correct switch.
		await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: Array<{ seen: boolean }> }).__frames.some((f) => f.seen)), { timeout: 20_000 }).toBe(true);
		await frames(page, 20);
		const watched = await stopWatching(page);
		const seen = watched.filter((f) => f.seen);
		expect(seen.length).toBeGreaterThan(0);
		// Every frame the reader could see shows the slide the caret is in.
		expect(seen.filter((f) => f.slide !== 7)).toEqual([]);
		// And the document was patched, not replaced.
		expect(watched.every((f) => f.same)).toBe(true);
	});
}

// THE WALK THAT WARMS UP BEHIND THE EDITOR (PlaygroundApp.tsx, boot) fetches a component's plan. When that fetch landed
// AFTER the reader had switched to Explore, it rewrote the preview with the component's gallery: their own deck, shown
// for a moment, was replaced by `actors` (seen on WebKit as the switch test above reading a replaced document, 3 runs
// in 10 when the fetch was slow). Holding the fetch until after the switch makes that order certain here.
test(`a walk that warms up behind the editor and lands after the switch leaves Explore on the reader's deck ${TAGS}`, async ({ page }) => {
	const PLAN = /\/plans\/[^/]+\.json$/;
	let release = () => {};
	const held = new Promise<void>((done) => {
		release = done;
	});
	await page.route(PLAN, async (route) => {
		await held;
		await route.continue();
	});
	await open(page);
	await editLine(page, 'point 7.2');
	// The document the preview holds now is the reader's deck, written in Edit: mark it, to tell a patch from a rewrite.
	await page.evaluate(() => {
		((document.getElementById('preview') as HTMLIFrameElement).contentWindow as unknown as { __before: boolean }).__before = true;
	});
	await page.getByRole('tab', { name: 'Explore' }).click();
	const landed = page.waitForEvent('requestfinished', { predicate: (r) => PLAN.test(r.url()) });
	release();
	await landed;
	// The walk landed (its bar is the walk's own chrome), and Explore shows the reader's slide, revealed.
	await expect(page.locator('#pg-walk')).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 20_000 });
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(7);
	const preview = page.frameLocator('#preview');
	await expect(preview.locator('section[data-lattice-slide="7"]')).toContainText('point 7.2 edited');
	expect(
		await page.evaluate(() => ((document.getElementById('preview') as HTMLIFrameElement).contentWindow as unknown as { __before?: boolean }).__before === true),
		'the late plan rewrote the preview instead of leaving the reader\'s deck in place',
	).toBe(true);
});

test(`switching back to Edit never shows a wrong slide for a frame ${WIDE}`, async ({ page }) => {
	await open(page, true);
	await editLine(page, 'point 9.2');
	// The slide the preview shows beside the caret in Edit: the reader must get back to exactly this one.
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBeGreaterThan(7);
	const home = await shownSlide(page);
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(9);
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await watchSwitch(page, () => page.getByRole('tab', { name: 'Edit' }).click());
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 20_000 });
	// Keep watching well past the reveal: a snap that comes a few frames later is the failure, not the success.
	await frames(page, 40);
	const watched = await stopWatching(page);
	const seen = watched.filter((f) => f.seen);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.filter((f) => f.slide !== home)).toEqual([]);
	expect(watched.every((f) => f.same)).toBe(true);
});

// THE REALIGN HOLD IS EDIT'S. In Edit the preview stays covered until it follows the editor's caret; Explore lands by
// its own walk and never pays that realign. A quick Explore, Edit, Explore left the hold set by the Edit in between, and
// that Edit's settle loop, which starts two frames after its switch and so after the next one, held Explore's reveal for
// all of its 60 frames: on a loaded Firefox long enough that the case below missed its 4 s (1 run in 20 on main). The
// reveal publishes what it is waiting for (`data-hold`), so this asserts the cause, on every engine, at any load.
test(`a quick Explore and back never holds Explore's reveal for Edit's realign ${WIDE}`, async ({ page }) => {
	await open(page, true);
	await editLine(page, 'point 9.2');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await page.evaluate(() => {
		const w = window as unknown as { __holds: string[] };
		w.__holds = [];
		const wrap = document.querySelector('.pg-preview-wrap') as HTMLElement;
		new MutationObserver(() => {
			const hold = wrap.getAttribute('data-hold');
			if (hold) w.__holds.push(`${document.body.getAttribute('data-view')}:${hold}`);
		}).observe(wrap, { attributes: true, attributeFilter: ['data-hold'] });
	});
	await clickTab(page, 'Explore');
	await frames(page, 1);
	await clickTab(page, 'Edit');
	await frames(page, 1);
	await clickTab(page, 'Explore');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 20_000 });
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(9);
	const holds = await page.evaluate(() => (window as unknown as { __holds: string[] }).__holds);
	// The reveal did wait for something (the switches covered it), and in Explore never for the realign.
	expect(holds.length).toBeGreaterThan(0);
	expect(holds.filter((h) => h.startsWith('read:') && h.split(':')[1].split(' ').includes('realign'))).toEqual([]);
});

for (const [name, wide, tags] of [
	['phone', false, TAGS],
	['wide', true, WIDE],
] as const) {
	// The reader changes their mind: Explore and back (and again) with only a few frames between the taps, so the first
	// switch's render lands after they have already left. Nothing may be left covered, and the preview must end on
	// the caret's slide.
	for (const gap of [0, 4, 12, 15]) {
		test(`a quick Explore and back, ${gap} frames apart, ends on the caret's slide with the preview showing (${name}) ${tags}`, async ({ page }) => {
			await open(page, wide);
			await editLine(page, 'point 9.2');
			await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
			await clickTab(page, 'Explore');
			await frames(page, gap + 1);
			await clickTab(page, 'Edit');
			await frames(page, gap + 1);
			await clickTab(page, 'Explore');
			await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 4000 });
			await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(9);
			await clickTab(page, 'Edit');
			await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 4000 });
			if (wide) {
				// The preview follows the editor again, on the caret's slide and not pinned to an end of the deck.
				await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBeGreaterThan(7);
				await expect.poll(() => shownSlide(page)).toBeLessThan(SLIDES + 1);
			}
		});
	}
}
