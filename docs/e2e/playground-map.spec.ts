import { expect, type Page, test } from '@playwright/test';

/**
 * The Playground's slide map: a rail of the deck's slides beside the preview (PlaygroundMap.tsx,
 * map-rail/MapRail.tsx), drawn from Veduta's map window and tied to the preview by the Fuoco hub
 * and the rendered index. It is OFF until the reader turns it on, so the first test pins that the
 * Playground without it is the Playground it was.
 *
 * Every test reads the surface a person reads: the walk bar's "N / M", the rail's current tile and
 * the frame's own scroll. None of them reads the hub or Veduta, which are what is under test.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
const MAP_KEY = 'lattice-docs-pg-map';
const RAIL = '[data-map-rail]';

async function openExplore(page: Page, query = '?c=kpi&view=read') {
	await page.goto(`/playground/${query}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText('/');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
}

async function mapOn(page: Page) {
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 30_000 });
}

const current = (page: Page) => page.locator(`${RAIL} button[aria-current="true"]`).getAttribute('data-unit');
const walkPos = async (page: Page) => (await page.locator('#pg-walk .pg-walk-pos').textContent())?.trim() ?? '';

/** The stamp of the slide with the most of itself in the preview, as a human reads "the slide I am on". */
async function slideInView(page: Page): Promise<string> {
	return page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const win = f.contentWindow as Window;
		let best = '';
		let bestSeen = -1;
		for (const el of Array.from(f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]') ?? [])) {
			const r = el.getBoundingClientRect();
			const seen = Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top));
			if (seen > bestSeen) {
				bestSeen = seen;
				best = el.getAttribute('data-lattice-slide') ?? '';
			}
		}
		return best;
	});
}

test('@crosswidth the map is off until asked, and off it leaves the preview exactly where it was', async ({ page }) => {
	await openExplore(page);
	await expect(page.locator(RAIL)).toHaveCount(0);
	const row = await page.locator('.pg-preview-row').evaluate((e) => getComputedStyle(e).display);
	expect(row).toBe('contents');
	const wrap = await page.locator('.pg-preview-wrap').boundingBox();
	await mapOn(page);
	const narrowed = await page.locator('.pg-preview-wrap').boundingBox();
	const vertical = (await page.locator(RAIL).getAttribute('data-map-rail')) === 'vertical';
	if (vertical) expect(narrowed?.width).toBeLessThan((wrap?.width ?? 0) - 100);
	else expect(narrowed?.height).toBeLessThan((wrap?.height ?? 0) - 60);
	// …and turning it off again gives the room back.
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(RAIL)).toBeHidden();
	await expect.poll(async () => Math.round((await page.locator('.pg-preview-wrap').boundingBox())?.width ?? 0)).toBe(Math.round(wrap?.width ?? 0));
});

test('@crosswidth it mounts a window of tiles, the ones in view live (never past the pool ceiling), on the slide the walk is on', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	expect(await current(page)).toBe('0');
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeGreaterThan(0);
	expect(await page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeLessThanOrEqual(24);
	// A live tile is a pooled frame, never one per tile.
	expect(await page.locator(`${RAIL} iframe`).count()).toBeLessThanOrEqual(28);
});

test('@crosswidth a tile lands the preview on its slide and the walk bar agrees', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	const total = Number((await walkPos(page)).split('/')[1]);
	await page.locator(`${RAIL} button[data-unit="3"]`).click();
	await expect.poll(() => walkPos(page)).toBe(`4 / ${total}`);
	await expect.poll(() => current(page)).toBe('3');
	await expect.poll(() => slideInView(page)).toBe('4');
});

test('@crosswidth first, last, previous and next move the one focus both ways', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	const total = Number((await walkPos(page)).split('/')[1]);
	const rail = page.locator(RAIL);
	const stacked = (await rail.getAttribute('data-map-rail')) === 'horizontal';
	if (stacked) {
		// Narrow: the strip shares the walk bar with Prev and Next, and has no buttons of its own.
		await expect(page.locator(`#pg-walk ${RAIL}`)).toBeVisible();
		expect(await rail.locator('button:not([data-unit])').count()).toBe(0);
		await rail.locator('button[aria-current="true"]').focus();
		await page.keyboard.press('End');
	} else await rail.getByRole('button', { name: 'Map, last slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`${total} / ${total}`);
	await expect.poll(() => current(page)).toBe(String(total - 1));
	const walk = page.locator('#pg-walk');
	if (stacked) await walk.getByRole('button', { name: 'Previous slide' }).click();
	else await rail.getByRole('button', { name: 'Map, previous slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`${total - 1} / ${total}`);
	if (stacked) {
		await rail.locator('button[aria-current="true"]').focus();
		await page.keyboard.press('Home');
	} else await rail.getByRole('button', { name: 'Map, first slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`1 / ${total}`);
	if (stacked) await walk.getByRole('button', { name: 'Next slide' }).click();
	else await rail.getByRole('button', { name: 'Map, next slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`2 / ${total}`);
	// The walk bar's own Next moves the rail too.
	await walk.getByRole('button', { name: 'Next slide' }).click();
	await expect.poll(() => current(page)).toBe('2');
});

test('@crosswidth scrolling the preview moves the rail to the slide that fills it', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	// THE READER'S SCROLL, a wheel over the preview, not a script writing `scrollY`. Opening the map resizes the pane,
	// and the Playground re-lands the walk after a resize; a wheel outranks that land (`driveAtRef`, PlaygroundApp.tsx),
	// a bare `scrollTo` carries no input and is put back by it. Measured with the page stalled 250ms in every 500, 2
	// runs in 6 scrolled while the land was pending and ended on slide 1 with the rail at 0: the same failure the full
	// suite showed under load.
	await page.locator('#preview').hover();
	const pane = await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentWindow?.innerHeight ?? 0);
	await page.mouse.wheel(0, 3 * pane);
	// The rail moved off the first slide, and it and the walk bar name the same slide once both have caught up: read
	// together, in one poll, so a pair that falls back to slide 1 does not pass.
	await expect
		.poll(async () => {
			const rail = Number(await current(page));
			const bar = Number((await walkPos(page)).split('/')[0]);
			return rail > 0 && rail + 1 === bar ? 'agree' : `rail ${rail + 1}, bar ${bar}`;
		})
		.toBe('agree');
});

const SIX = `---\ntheme: indaco\n---\n\n${Array.from({ length: 6 }, (_, i) => `# Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n')}\n`;

test('in Edit the rail follows the preview and a tile scrolls it', async ({ page }) => {
	await page.addInitScript(([k, md]) => localStorage.setItem(k, md), [SOURCE_KEY, SIX]);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await mapOn(page);
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(6);
	expect(await current(page)).toBe('0');
	// Slide 3, not the last ones: near the end of a short deck the scroll clamps and a later slide
	// has more of the view, which is the preview's truth and not the pick's.
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await expect.poll(() => slideInView(page)).toBe('3');
	expect(await current(page)).toBe('2');
	// And a pick the preview cannot honor exactly is not overruled by it.
	await page.locator(`${RAIL} button[data-unit="5"]`).click();
	await expect.poll(() => current(page)).toBe('5');
	// Held for several reads in a row (the preview's scroll reports in, and must not move it).
	let held = 0;
	await expect
		.poll(async () => ((await current(page)) === '5' ? ++held : (held = -100)), { intervals: [100] })
		.toBeGreaterThanOrEqual(6);
});

// `fit: heal`: this deck needs the COUNT-based split (one row a page); measuring is the default
// (lib/core/resolve-fit.js fitPacks) and keeps a short list whole.
const PORTRAIT = `---
theme: indaco
size: portrait
fit: heal
---

<!-- @meta{class=title} -->

# A deck

---

<!-- @meta{class=inventory} -->

\`Eyebrow\`

## Four parts.

- **One.** First body.
- **Two.** Second body.
- **Three.** Third body.
- **Four.** Fourth body.

> The insight.

---

<!-- @meta{class=closing} -->

# The end
`;

test('a deck whose slide splits into pages still has one tile per slide, and a tile lands on the right page', async ({ page }) => {
	await page.addInitScript(([k, md, m]) => {
		localStorage.setItem(k, md);
		localStorage.setItem(m, '1');
	}, [SOURCE_KEY, PORTRAIT, MAP_KEY]);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	// Three authored slides, however many pages the split makes of the second.
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(3);
	// Polled, not read once: the rail's tiles come from the outline, so they can be up before the preview has written
	// its pages (read once, this saw 0 pages in 1 run of 72 under `--workers=4`).
	await expect
		.poll(() => page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').length ?? 0))
		.toBeGreaterThan(3);
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await expect.poll(() => slideInView(page)).toBe('3');
	await expect.poll(() => current(page)).toBe('2');
	await page.locator(`${RAIL} button[data-unit="1"]`).click();
	await expect.poll(() => slideInView(page)).toMatch(/^2/);
});

test('@crosswidth the keyboard walks the rail: an arrow moves the focus and keeps keyboard focus on the new tile', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	await page.locator(`${RAIL} button[aria-current="true"]`).focus();
	await page.keyboard.press('ArrowDown');
	await expect.poll(() => current(page)).toBe('1');
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-unit'))).toBe('1');
});

test('@crosswidth the choice is remembered: a reload comes back with the map on', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
});

// The same surface at the tablet width, which no project runs by default: the map is a strip under the
// preview there, as on a phone, and the controls have to be in reach.
test.describe('at tablet width @crosswidth', () => {
	test.use({ viewport: { width: 820, height: 1180 } });
	test('the map is a strip under the preview, and a tile and the ends still move the walk', async ({ page }) => {
		await openExplore(page);
		await mapOn(page);
		expect(await page.locator(RAIL).getAttribute('data-map-rail')).toBe('horizontal');
		const total = Number((await walkPos(page)).split('/')[1]);
		await page.locator(`${RAIL} button[data-unit="2"]`).click();
		await expect.poll(() => walkPos(page)).toBe(`3 / ${total}`);
		await page.locator(`${RAIL} button[aria-current="true"]`).focus();
		await page.keyboard.press('End');
		await expect.poll(() => walkPos(page)).toBe(`${total} / ${total}`);
	});
});

test('@parity every control of the map clears the 44px touch floor on a coarse pointer', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
	test.skip(!coarse, 'fine pointer: the compact controls are right here');
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-map-rail] button')]
			.map((b) => ({ label: b.getAttribute('aria-label'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
			.filter((c) => c.w < 44 || c.h < 44),
	);
	expect(small).toEqual([]);
});

test('@webkit-phone the map is a strip a finger can use on a phone-sized WebKit', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	const total = Number((await walkPos(page)).split('/')[1]);
	await page.locator(`${RAIL} button[data-unit="3"]`).tap();
	await expect.poll(() => walkPos(page)).toBe(`4 / ${total}`);
});

test('@crosswidth Home and End on the rail keep keyboard focus on the rail', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	const total = Number((await walkPos(page)).split('/')[1]);
	await page.locator(`${RAIL} button[aria-current="true"]`).focus();
	await page.keyboard.press('End');
	await expect.poll(() => walkPos(page)).toBe(`${total} / ${total}`);
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-unit'))).toBe(String(total - 1));
	await page.keyboard.press('Home');
	await expect.poll(() => walkPos(page)).toBe(`1 / ${total}`);
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-unit'))).toBe('0');
});

// Front matter that sets a header and page numbers puts them on every slide, a blank one too. The map has to
// still know that slide is blank: if it does not, every tile after it lands one page early.
const CHROME_BLANK = `---
pagination: true
header: Quarterly review
---

# Alpha

---

---

# Gamma

---

# Delta

---

# Epsilon

---

# Zeta

---

# Eta
`;

test('a blank slide in a deck with a front matter header and page numbers is a tile of its own, and the tiles after it land on their own slides', async ({ page }) => {
	await page.addInitScript(([k, md, m]) => {
		localStorage.setItem(k, md);
		localStorage.setItem(m, '1');
	}, [SOURCE_KEY, CHROME_BLANK, MAP_KEY]);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	// Seven engine slides and seven authored ones: the blank slide is a unit of the outline, so it is a tile.
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(7);
	await page.locator(`${RAIL} button[data-unit="1"]`).click();
	await expect.poll(() => slideInView(page)).toBe('2');
	// Gamma is the third engine slide, Delta the fourth (not the last, so the scroll does not clamp).
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await expect.poll(() => slideInView(page)).toBe('3');
	await page.locator(`${RAIL} button[data-unit="3"]`).click();
	await expect.poll(() => slideInView(page)).toBe('4');
});

/**
 * Start the walk's jump to the last slide and leave the frame RESTING between where it started and where it was going,
 * in one task. The page runs with REDUCED MOTION (`emulateMedia`), so the jump is an instant scroll and there is no
 * animation for anything to race: a smooth one starts on the next frame and, under load, still ran on to the last slide
 * after a `scrollTo` meant to cancel it (1 run in 10 at `--workers=4`). The guard holds an instant jump exactly as it holds
 * a smooth one, because it compares where the frame is with where the jump was going. The frame's own End keydown is the
 * jump (the shell key, `onDeckKey`); an instant `scrollTo` in the same task moves the frame back to HALFWAY, as a scroll
 * that stamps no input does, so the one scroll event that follows reports a frame between the two. Halfway, not just
 * off the target: while any of the last slide still shows, the observer reads the frame as having arrived on it (the
 * hysteresis in `readingSlideIndex`) and lets the guard go by arrival, and the test then passes with no stamp at all
 * (traced: parked 300px back, the bar followed the reader with the stamp removed).
 * Then the clock freezes a little past the jump's own stamp (`armedAt`): the guard's ceiling can never pass, so only a
 * reader's input can release it.
 */
async function jumpAndRest(page: Page): Promise<number> {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const total = Number((await walkPos(page)).split('/')[1]);
	await page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		w.document.dispatchEvent(new (w as unknown as typeof globalThis).KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
		w.scrollTo({ top: Math.round(w.scrollY / 2), behavior: 'instant' });
	});
	await expect.poll(() => walkPos(page)).toBe(`${total} / ${total}`);
	await page.clock.setFixedTime(Date.now() + 50);
	return total;
}

/** The bar left the jump's slide for one the reader can see. ON screen, not the MOST on screen: the walk keeps its slide
 *  while any of it shows (the hysteresis in `readingSlideIndex`), which `slideInView` does not. */
async function barFollowsReader(page: Page, total: number) {
	await expect
		.poll(async () => {
			const at = (await walkPos(page)).split('/')[0].trim();
			const shown = await page.evaluate(() => {
				const f = document.getElementById('preview') as HTMLIFrameElement;
				const h = (f.contentWindow as Window).innerHeight;
				return Array.from(f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]') ?? [])
					.filter((el) => {
						const r = el.getBoundingClientRect();
						return r.bottom > 0 && r.top < h;
					})
					.map((el) => el.getAttribute('data-lattice-slide') ?? '');
			});
			return at !== String(total) && shown.includes(at) ? 'follows' : `bar ${at}, on screen ${shown.join(',')}`;
		})
		.toBe('follows');
}

test('a key that scrolls the preview mid-jump hands the walk to the reader, not to the jump', async ({ page }) => {
	// THE READER OUTRANKS A JUMP STILL ON ITS WAY. The walk's guard holds while its own smooth scroll is between where
	// it started and where it is going (`walkEnRoute`, PlaygroundApp.tsx), so a loaded page cannot rename the walk from
	// the slide the scroll is passing. Space is the one key the shell leaves to the browser: it scrolls the frame by
	// itself. Only the input clock can tell the guard the reader took over (`NATIVE_SCROLL_KEYS` in `onDeckKey`), and
	// with the clock frozen (`jumpAndRest`), without that stamp the bar stays on the last slide for good.
	await openExplore(page);
	await mapOn(page);
	const total = await jumpAndRest(page);
	await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentWindow?.focus());
	// Shift+Space scrolls UP, away from the jump's target: a scroll that reached the target would release the guard by
	// arrival, and the test would pass without the stamp it is about.
	await page.keyboard.press('Shift+ ');
	await barFollowsReader(page, total);
});

test('a drag on the preview scrollbar mid-jump hands the walk to the reader, not to the jump', async ({ playwright }, testInfo) => {
	// The same rule as the key test above, for the other input that scrolls the frame by itself: the reader dragging its
	// scrollbar (`onDeckPress`, PlaygroundApp.tsx). Playwright's Chromium hides scrollbars by default
	// (`--hide-scrollbars`), and so do its Firefox and WebKit here, so this one browser keeps them: the reader drags a
	// real 15px scrollbar, and its press is what stamps the input clock.
	const use = testInfo.project.use;
	const browser = await playwright.chromium.launch({ ...use.launchOptions, ignoreDefaultArgs: ['--hide-scrollbars'] });
	try {
		const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? null, storageState: use.storageState });
		const page = await context.newPage();
		await openExplore(page);
		await mapOn(page);
		const total = await jumpAndRest(page);
		// The scrollbar's thumb, in page coordinates: right of the document's client width, at the frame's offset.
		const thumb = await page.evaluate(() => {
			const f = document.getElementById('preview') as HTMLIFrameElement;
			const r = f.getBoundingClientRect();
			const w = f.contentWindow as Window;
			const root = (f.contentDocument as Document).documentElement;
			const se = f.contentDocument?.scrollingElement as Element;
			const track = f.clientHeight;
			return {
				x: r.left + root.clientWidth + (f.clientWidth - root.clientWidth) / 2,
				y: r.top + ((w.scrollY + w.innerHeight / 2) / se.scrollHeight) * track,
				width: f.clientWidth - root.clientWidth,
			};
		});
		expect(thumb.width, 'this browser draws a classic scrollbar').toBeGreaterThan(0);
		await page.mouse.move(thumb.x, thumb.y);
		await page.mouse.down();
		// Up, away from the jump's target, for the reason the key test gives.
		await page.mouse.move(thumb.x, thumb.y - 60, { steps: 4 });
		await page.mouse.up();
		await barFollowsReader(page, total);
	} finally {
		await browser.close();
	}
});
