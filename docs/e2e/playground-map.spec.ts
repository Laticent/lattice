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

test('@crosswidth it mounts a window of tiles, at most eight of them live, on the slide the walk is on', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	expect(await current(page)).toBe('0');
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeGreaterThan(0);
	expect(await page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeLessThanOrEqual(8);
	// A live tile is a pooled frame, never one per tile.
	expect(await page.locator(`${RAIL} iframe`).count()).toBeLessThanOrEqual(10);
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
	await rail.getByRole('button', { name: 'Map, last slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`${total} / ${total}`);
	await expect.poll(() => current(page)).toBe(String(total - 1));
	await rail.getByRole('button', { name: 'Map, previous slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`${total - 1} / ${total}`);
	await rail.getByRole('button', { name: 'Map, first slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`1 / ${total}`);
	await rail.getByRole('button', { name: 'Map, next slide' }).click();
	await expect.poll(() => walkPos(page)).toBe(`2 / ${total}`);
	// The walk bar's own Next moves the rail too.
	await page.locator('#pg-walk').getByRole('button', { name: 'Next slide' }).click();
	await expect.poll(() => current(page)).toBe('2');
});

test('@crosswidth scrolling the preview moves the rail to the slide that fills it', async ({ page }) => {
	await openExplore(page);
	await mapOn(page);
	await page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		(f.contentWindow as Window).scrollTo({ top: (f.contentWindow as Window).scrollY + 3 * (f.contentWindow as Window).innerHeight, behavior: 'auto' });
	});
	await expect.poll(async () => Number(await current(page))).toBeGreaterThan(0);
	const pos = Number((await walkPos(page)).split('/')[0]);
	expect(Number(await current(page)) + 1).toBe(pos);
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

const PORTRAIT = `---
theme: indaco
size: portrait
---

<!-- _class: title -->

# A deck

---

<!-- _class: inventory -->

\`Eyebrow\`

## Four parts.

- **One.** First body.
- **Two.** Second body.
- **Three.** Third body.
- **Four.** Fourth body.

> The insight.

---

<!-- _class: closing -->

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
	const pages = await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').length ?? 0);
	expect(pages).toBeGreaterThan(3);
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
		await page.locator(RAIL).getByRole('button', { name: 'Map, last slide' }).click();
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
