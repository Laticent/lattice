import { expect, type Page, test } from '@playwright/test';
import { gotoStudio, railButtons, setEditorContent } from './studio-fixture';

/**
 * The Studio's slide map: a rail of the deck's slides beside (under, on a narrow pane) the focused
 * preview (studio/StudioMap.tsx, over map-rail/MapRail.tsx and Veduta's map window). It reads the
 * Studio's own focus hub and picks through the same call a pill makes, so these specs read what a
 * person reads: the "Slide N / M" label, the pill navigator and the rail's current tile.
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
const current = (page: Page) => page.locator(`${RAIL} button[aria-current="true"]`).getAttribute('data-unit');
const label = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();

test('@crosswidth the map is off until asked, and then lists one tile per slide the pills list', async ({ page }) => {
	await gotoStudio(page);
	await expect(page.locator(RAIL)).toHaveCount(0);
	await mapOn(page);
	const pills = await railButtons(page).count();
	expect(pills).toBeGreaterThan(2);
	// One tile per pill: the rail's last tile is the pills' last slide, and there is none after it.
	await page.locator(RAIL).getByRole('button', { name: 'Map, last slide' }).click();
	await expect(page.locator(`${RAIL} button[data-unit="${pills - 1}"]`)).toHaveAttribute('aria-current', 'true');
	await expect(page.locator(`${RAIL} button[data-unit="${pills}"]`)).toHaveCount(0);
	await page.locator(RAIL).getByRole('button', { name: 'Map, first slide' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toHaveAttribute('data-unit', '0');
	expect(await current(page)).toBe('0');
	// A live picture is a pooled frame, and no more than the budget are asked for at once.
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeGreaterThan(0);
	expect(await page.locator(`${RAIL} button[data-tier="live"]`).count()).toBeLessThanOrEqual(8);
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(RAIL)).toBeHidden();
});

test('@crosswidth a tile moves the focus: the label, the pill and the tile agree', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	const total = await railButtons(page).count();
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await label(page, `Slide 3 / ${total}`);
	await expect(railButtons(page).nth(2)).toHaveAttribute('aria-current', 'true');
	expect(await current(page)).toBe('2');
	// The shell's own verbs move the rail too (a pick hands keyboard focus to the editor, as a pill does).
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => current(page)).toBe('3');
});

test('first, last, previous and next on the rail', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	const total = await railButtons(page).count();
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
	await expect(page.locator(`${RAIL} button[aria-label="Slide 4, Four"]`)).toBeVisible();
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
	await mapOn(page);
	const total = await railButtons(page).count();
	await page.locator(`${RAIL} button[aria-current="true"]`).focus();
	for (const n of [2, 3, 4]) {
		await page.keyboard.press('ArrowDown');
		await label(page, `Slide ${n} / ${total}`);
	}
	expect(await page.evaluate(() => document.activeElement?.closest('[data-map-rail]') !== null)).toBe(true);
	await page.keyboard.press('End');
	await label(page, `Slide ${total} / ${total}`);
});

test('closing and reopening the map re-uses its preview frames instead of creating new documents', async ({ page }) => {
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
	expect(await page.evaluate(() => (window as unknown as { __frames: number }).__frames)).toBe(first);
});

test('the rail restacks when the window crosses the narrow breakpoint and back', async ({ page }) => {
	await gotoStudio(page);
	await mapOn(page);
	expect(await page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('horizontal');
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(() => page.locator(RAIL).getAttribute('data-map-rail')).toBe('vertical');
});
