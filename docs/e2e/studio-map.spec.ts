import { expect, type Page, test } from '@playwright/test';
import { gotoStudio, railButtons, setEditorContent } from './studio-fixture';

/**
 * The Studio's slide map: a rail of the deck's slides beside (under, on a narrow pane) the focused
 * preview (studio/StudioMap.tsx, over map-rail/MapRail.tsx and Veduta's map window). It reads the
 * Studio's own focus hub and picks through the same call a pill makes, so these specs read what a
 * person reads: the "Slide N / M" label, the pill navigator and the rail's current tile. Where the map sits beside
 * the slide it IS the navigator and the pills hide; where it stacks under the slide (a narrow pane, a phone) they stay,
 * so a spec that needs the pill count reads it before the map opens (`pillsThenMap`).
 * Off until the reader turns it on; the Playground has its own spec (playground-map.spec.ts).
 */

const RAIL = '[data-map-rail]';
const SPLIT = `---
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

<!-- _class: title -->

# The end
`;

async function mapOn(page: Page) {
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
}
/** Count the pills while the map is off, then open the map. */
async function pillsThenMap(page: Page) {
	await expect(railButtons(page).first()).toBeVisible();
	const pills = await railButtons(page).count();
	await mapOn(page);
	return pills;
}
const stacked = async (page: Page) => (await page.locator(RAIL).getAttribute('data-map-rail')) === 'horizontal';
const current = (page: Page) => page.locator(`${RAIL} button[aria-current="true"]`).getAttribute('data-unit');
const label = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();

test('@crosswidth the map is off until asked, and then lists one tile per slide the pills list', async ({ page }) => {
	await gotoStudio(page);
	await expect(page.locator(RAIL)).toHaveCount(0);
	const pills = await pillsThenMap(page);
	expect(pills).toBeGreaterThan(2);
	// The map beside the slide replaces the pills; the strip under it keeps them.
	await expect(railButtons(page)).toHaveCount((await stacked(page)) ? pills : 0);
	// What the pills labeled a slide with outside Read, its component class, rides on the tile instead.
	if (!(await stacked(page))) await expect(page.locator(`${RAIL} button[data-unit="0"]`)).toContainText('title');
	// One tile per pill: the rail's last tile is the pills' last slide, and there is none after it.
	await page.locator(`${RAIL} button[aria-current="true"]`).focus();
	await page.keyboard.press('End');
	await expect(page.locator(`${RAIL} button[data-unit="${pills - 1}"]`)).toHaveAttribute('aria-current', 'true');
	await expect(page.locator(`${RAIL} button[data-unit="${pills}"]`)).toHaveCount(0);
	await page.keyboard.press('Home');
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toHaveAttribute('data-unit', '0');
	expect(await current(page)).toBe('0');
	// A live picture is a pooled frame, and never more than the pool's ceiling (HARD_MAX_SLOTS).
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeGreaterThan(0);
	expect(await page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeLessThanOrEqual(28);
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(RAIL)).toBeHidden();
	await expect(railButtons(page)).toHaveCount(pills);
});

test('@crosswidth a tile moves the focus: the label and the tile agree, and the pill where the pills show', async ({ page }) => {
	await gotoStudio(page);
	const total = await pillsThenMap(page);
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await label(page, `Slide 3 / ${total}`);
	if (await stacked(page)) await expect(railButtons(page).nth(2)).toHaveAttribute('aria-current', 'true');
	expect(await current(page)).toBe('2');
	// The shell's own verbs move the rail too (a pick hands keyboard focus to the editor, as a pill does).
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => current(page)).toBe('3');
});

test('first, last, previous and next on the rail', async ({ page }) => {
	await gotoStudio(page);
	const total = await pillsThenMap(page);
	const rail = page.locator(RAIL);
	await rail.getByRole('button', { name: 'Map, last slide' }).click();
	await label(page, `Slide ${total} / ${total}`);
	await rail.getByRole('button', { name: 'Map, previous slide' }).click();
	await label(page, `Slide ${total - 1} / ${total}`);
	await rail.getByRole('button', { name: 'Map, first slide' }).click();
	await label(page, `Slide 1 / ${total}`);
	await rail.getByRole('button', { name: 'Map, next slide' }).click();
	await label(page, `Slide 2 / ${total}`);
});

test('the rail follows the deck as it is edited', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	await setEditorContent(page, '# One\n\n---\n\n# Two\n\n---\n\n# Three\n\n---\n\n# Four\n');
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(4, { timeout: 15_000 });
	await expect(page.locator(`${RAIL} button[aria-label^="Slide 4, Four"]`)).toBeVisible();
});

test('a blank slide is a pill and a tile, and the slide after it is picked as itself', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	// The engine renders the empty chunk between the two separators as slide 2, and the PDF counts it.
	await setEditorContent(page, '# One\n\n---\n\n---\n\n# Three\n');
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(3, { timeout: 15_000 });
	await page.locator(`${RAIL} button[aria-label^="Slide 3, Three"]`).click();
	await label(page, 'Slide 3 / 3');
	await expect(page.locator(`${RAIL} button[aria-current="true"]`)).toHaveAttribute('data-unit', '2');
	// The pills hide beside the map, so close it to read them: the blank slide is a pill too.
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(railButtons(page)).toHaveCount(3);
});

test('a slide the structural split cuts into pages is still one tile', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	await setEditorContent(page, SPLIT);
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(3, { timeout: 15_000 });
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await label(page, 'Slide 3 / 3');
});

test('@mobile on a phone the map is a strip a tap can use', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	expect(await page.locator(RAIL).getAttribute('data-map-rail')).toBe('horizontal');
	const total = await railButtons(page).count();
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await label(page, `Slide 3 / ${total}`);
});

test('@parity every control of the Studio map clears the 44px touch floor on a coarse pointer', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
	test.skip(!coarse, 'fine pointer: the compact controls are right here');
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-map-rail] button, button[aria-label="Slide map"]')]
			.map((b) => ({ label: b.getAttribute('aria-label'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
			.filter((c) => c.w < 44 || c.h < 44),
	);
	expect(small).toEqual([]);
});

test('the arrow keys walk the rail slide by slide and keyboard focus stays on it', async ({ page }) => {
	await gotoStudio(page);
	const total = await pillsThenMap(page);
	await page.locator(`${RAIL} button[aria-current="true"]`).focus();
	for (const n of [2, 3, 4]) {
		await page.keyboard.press('ArrowDown');
		await label(page, `Slide ${n} / ${total}`);
	}
	expect(await page.evaluate(() => document.activeElement?.closest('[data-map-rail]') !== null)).toBe(true);
	await page.keyboard.press('End');
	await label(page, `Slide ${total} / ${total}`);
});

// On WebKit a destroyed frame is never given back, so the same check runs there too (desktop drops a webkit-only title).
async function reusesFrames(page: Page) {
	await gotoStudio(page);
	await page.evaluate(() => {
		(window as unknown as { __frames: number }).__frames = 0;
		new MutationObserver((ms) => {
			for (const m of ms) for (const n of Array.from(m.addedNodes)) if ((n as Element).querySelectorAll) (window as unknown as { __frames: number }).__frames += (n as Element).tagName === 'IFRAME' ? 1 : (n as Element).querySelectorAll('iframe').length;
		}).observe(document.body, { childList: true, subtree: true });
	});
	await mapOn(page);
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeGreaterThan(0);
	await expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-map-rail] iframe').length)).toBeGreaterThan(0);
	const first = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
	for (let i = 0; i < 3; i++) {
		await page.getByRole('button', { name: 'Slide map' }).click();
		await expect(page.locator(RAIL)).toBeHidden();
		await page.getByRole('button', { name: 'Slide map' }).click();
		await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible();
	}
	const after = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
	expect(after).toBe(first);
	// The pool reports its capacity to Veduta, so the rail never asks for more live tiles than there are frames to show them.
	const live = await page.locator(`${RAIL} button[data-tier="live"]`).count();
	const frames = await page.evaluate(() => document.querySelectorAll('[data-map-rail] iframe').length);
	expect(live).toBeLessThanOrEqual(frames);
	test.info().annotations.push({ type: 'retained', description: `frames created ${first}, after 3 toggles ${after}; live tiles ${live}, rail frames ${frames}` });
}
test('closing and reopening the map re-uses its preview frames instead of creating new documents', async ({ page }) => reusesFrames(page));
test('@webkit-tablet on WebKit, closing and reopening the map creates no new documents', async ({ page }) => reusesFrames(page));

test('the rail restacks when the window crosses the narrow breakpoint and back', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	expect(await page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
	await expect(railButtons(page)).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('horizontal');
	// Stacked under the slide, the strip has no labels or steps, so the pills come back.
	await expect.poll(() => railButtons(page).count()).toBeGreaterThan(2);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
	await expect(railButtons(page)).toHaveCount(0);
});

// THE CAPACITY REPORT BINDING ON THE REAL STUDIO. The pool reports its ceiling to the rail, and the rail passes it to
// Veduta's `settle`, which caps the live tiles it asks for. No shipped setting lowers the ceiling below 28, so the
// diagnostic key does (StudioMap.tsx `diagnosticSlots`); the arm without it shows the same deck asks for more.
const TEN = Array.from({ length: 10 }, (_, i) => `# Slide ${i + 1}`).join('\n\n---\n\n');
async function openTen(page: Page, slots: string | null) {
	if (slots) await page.addInitScript((n) => window.localStorage.setItem('lattice-studio-map-slots', n), slots);
	await gotoStudio(page);
	await setEditorContent(page, TEN);
	await mapOn(page);
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(10, { timeout: 15_000 });
}
const liveTiles = (page: Page) => page.locator(`${RAIL} button[data-tier="live"]`).count();
const railFrames = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-map-rail] iframe').length);

test('a pool ceiling lowered to 3 caps the live tiles at 3 through settle, and the frames with them', async ({ page }) => {
	await openTen(page, '3');
	await expect.poll(() => railFrames(page), { message: 'the pool never mounted its frames' }).toBe(3);
	await expect.poll(() => liveTiles(page), { message: 'the rail asked for more live tiles than the pool reported it holds' }).toBe(3);
	test.info().annotations.push({ type: 'capped', description: `live ${await liveTiles(page)}, frames ${await railFrames(page)}` });
});

test('THE ARM: the same deck without the ceiling asks for more than 3 live tiles', async ({ page }) => {
	await openTen(page, null);
	await expect.poll(() => liveTiles(page)).toBeGreaterThan(3);
	await expect.poll(() => railFrames(page)).toBeGreaterThan(3);
	test.info().annotations.push({ type: 'uncapped', description: `live ${await liveTiles(page)}, frames ${await railFrames(page)}` });
});

// The Article view unmounts the preview pane, and the way back mounts a new map wrapper. The stack measure follows
// the wrapper element (a callback ref), so the map is still beside the slide afterwards and still restacks.
test('after a round trip to the Article view the map still sits beside the slide and restacks', async ({ page }) => {
	await gotoStudio(page);
	// The fixture seeds the Craft stop on every load, so the Read stop (where "Read as an article" lives) goes in after it.
	await page.addInitScript(() => {
		const k = 'lattice-studio-settings';
		localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: 'read' }));
		localStorage.setItem('lattice-studio-map', '1');
	});
	await page.reload();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	await page.getByRole('button', { name: 'Read as an article' }).click();
	await page.getByRole('button', { name: 'Back to the deck' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
	await expect(railButtons(page)).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('horizontal');
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
});

// The map mounts a window of a long deck, so each tile says where it sits in the whole list, as the pills did by
// listing every slide.
test('a tile tells a screen reader its place in the whole deck', async ({ page }) => {
	await openTen(page, null);
	const li = page.locator(`${RAIL} li`).filter({ has: page.locator('button[data-unit="3"]') });
	await expect(li).toHaveAttribute('aria-setsize', '10');
	await expect(li).toHaveAttribute('aria-posinset', '4');
});
