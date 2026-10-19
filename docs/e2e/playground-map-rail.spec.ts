import { expect, test } from './studio-fixture';

// The Playground's slide map, on the REAL Playground (HARD RULE #23: a unit test of the rail says nothing
// about the iframe, the scroll sync or the walk bar it shares focus with).
//
// Claims, each with its own test:
//   1. first / next / last move the preview AND the rail's selected tile, and the walk bar says the same position
//      (one shared focus, not two that drift);
//   2. every tile the rail has scrolled into view shows something: a live render, a poster or a wireframe, never
//      the empty placeholder (the Veduta contract the rail is built on);
//   3. the layout holds at the three widths the site ships (screenshots attached).
// Tagged @crosswidth so it runs at desktop and phone width; @webkit-tablet adds the 1180x703 box where the
// filmstrip placeholder bug (followups 2782-p3) was reported.

const url = '/playground/?c=kpi&view=read';

async function ready(page: import('@playwright/test').Page) {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-map [role="option"]').first()).toBeVisible({ timeout: 60_000 });
	await expect(page.frameLocator('#preview').locator('.lattice > section').first()).toBeAttached({ timeout: 60_000 });
}

const position = (page: import('@playwright/test').Page) => page.locator('.pg-map-pos');
const selected = (page: import('@playwright/test').Page) => page.locator('.pg-map [role="option"][aria-selected="true"]');

test('the slide map moves the preview and shares one position with the walk bar @crosswidth', async ({ page }) => {
	await ready(page);
	const count = await page.locator('.pg-map [data-map-count]').getAttribute('data-map-count');
	expect(Number(count)).toBeGreaterThan(3);

	await expect(position(page)).toContainText(`1/${count}`);
	await expect(selected(page)).toHaveAttribute('data-index', '0');

	await page.locator('.pg-map').getByRole('button', { name: 'Next slide' }).click();
	await expect(selected(page)).toHaveAttribute('data-index', '1');
	await expect(position(page)).toContainText(`2/${count}`);

	await page.locator('.pg-map').getByRole('button', { name: 'Last slide' }).click();
	await expect(selected(page)).toHaveAttribute('data-index', String(Number(count) - 1));
	await expect(page.locator('.pg-map').getByRole('button', { name: 'Next slide' })).toBeDisabled();
	// ANTI-VACUITY: the walk bar, which reads the PREVIEW's own scroll, reports the same last slide.
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText(`${count} / ${count}`);

	await page.locator('.pg-map').getByRole('button', { name: 'First slide' }).click();
	await expect(selected(page)).toHaveAttribute('data-index', '0');
	await expect(position(page)).toContainText(`1/${count}`);
});

test('every tile in the rail window shows something after a jump @crosswidth', async ({ page }) => {
	await ready(page);
	await page.locator('.pg-map').getByRole('button', { name: 'Last slide' }).click();
	await expect(selected(page)).not.toHaveAttribute('data-index', '0');
	const emptyTilesInView = () =>
		page.evaluate(() => {
			const scroll = document.querySelector('.pg-map-scroll') as HTMLElement;
			const r = scroll.getBoundingClientRect();
			return [...document.querySelectorAll<HTMLElement>('.pg-map [role="option"]')]
				.filter((t) => {
					const b = t.getBoundingClientRect();
					return b.bottom > r.top + 1 && b.top < r.bottom - 1 && b.right > r.left + 1 && b.left < r.right - 1;
				})
				.filter((t) => t.dataset.tier === 'placeholder')
				.map((t) => t.dataset.index);
		});
	await expect.poll(emptyTilesInView, { timeout: 3000, message: 'tiles in view with no content' }).toEqual([]);
});

test('the map holds its layout at the three shipped widths @crosswidth', async ({ page }, info) => {
	await ready(page);
	// The live tier arrives after the first render; wait for it so the screenshot shows the settled rail.
	await expect(page.locator('.pg-map [data-tier="live"]').first()).toBeAttached({ timeout: 30_000 });
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
	await info.attach(`map-${info.project.name}.png`, { body: await page.screenshot(), contentType: 'image/png' });
});

test('no filmstrip placeholder sits in the viewport after a jump @webkit-tablet', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.frameLocator('#preview').locator('.lattice > section').first()).toBeAttached({ timeout: 60_000 });
	await page.locator('.pg-map').getByRole('button', { name: 'Last slide' }).click();
	// Wait for the jump to land (the walk bar reports the last slide), then give the filmstrip 600 ms to fill.
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText(/(\d+) \/ \1$/);
	const placeholdersInView = () =>
		page.evaluate(() => {
			const f = document.querySelector('#preview') as HTMLIFrameElement;
			const w = f.contentWindow as Window;
			return [...f.contentDocument!.querySelectorAll<HTMLElement>('div[data-lv-ph]')].filter((p) => {
				const b = p.getBoundingClientRect();
				return b.height > 2 && b.bottom > 0 && b.top < w.innerHeight;
			}).length;
		});
	await expect.poll(placeholdersInView, { timeout: 600, message: 'placeholders intersecting the viewport 600 ms after the jump lands' }).toBe(0);
});
