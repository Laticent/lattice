import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ── Lightbox digits vs Present's chart-detail digits, on the REAL Studio Present ─────
//
// #2648 gave the collage lightbox a digit jump (`1`..`6` go to that photo). Present already owns
// `1`..`9` and `0` for the chart-detail reveal (`chartDetailRef.handleKey`, PresentOverlay.tsx).
// #2648 claimed the two never collide, from READING the listener order: the lightbox listens on
// the parent `document` in the CAPTURE phase and stops propagation, while Present listens on
// `window` in the BUBBLE phase, so a digit the lightbox takes never reaches Present. That claim
// was never driven (the one thing that held #2648's merge card at `high`); this file drives it.
//
// WHAT THE SURFACE ALLOWS, measured here. A Studio Present slide sits in a `pointer-events-none`
// card (PresentOverlay.tsx, "the slide is a non-interactive poster"), so a real person cannot open
// the lightbox from inside Present: arm 3 asserts exactly that. The collision is therefore
// reachable only where the lightbox is already open when digits arrive, and the closest real
// reproduction is a Present slide that carries BOTH a chart and collage tiles. No shipped
// component draws both on one slide, so arms 1 and 2 add the tiles to a live chart slide and open
// them through `window.__collageOpen`, the function the frame's own click guard calls. That
// stand-in covers the OPENER only: the lightbox, the keyboard routing and the chart-detail layer
// are the real ones, and the chart assertions read the real popover.

const FUNNEL = `---
marp: true
theme: indaco
---

<!-- _class: funnel -->

## The funnel narrows; the width is the story.

- Visitors \`12,000\`
  - Two-thirds arrive from inbound, not outbound
- Signups \`4,800\`
- Activated \`2,160\`
- Paid \`864\`
`;

// Three photos as data URIs: the core's source allowlist admits `data:image/`, and nothing here is
// network-gated.
const swatch = (fill: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="${fill}"/></svg>`)}`;
const PHOTOS = [
	['One', swatch('#c0392b')],
	['Two', swatch('#27ae60')],
	['Three', swatch('#2980b9')],
];

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Present' });
const frame = (page: Page) => dialog(page).frameLocator('iframe.live');
const lightbox = (page: Page) => page.locator('.collage-lightbox');
const counter = (page: Page) => lightbox(page).locator('p').nth(1);
const popover = (page: Page) => page.locator('[data-slot="popover-content"]');

async function presentFunnel(page: Page) {
	await gotoStudio(page);
	await setEditorContent(page, FUNNEL);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(dialog(page)).toBeVisible();
	await expect(frame(page).locator('polygon[data-mark="0"]')).toBeVisible({ timeout: 40_000 });
	// The bridge is installed by the parent after the frame paints; wait for it rather than race it.
	await expect
		.poll(() => page.evaluate(() => typeof (document.querySelector('[role="dialog"][aria-label="Present"] iframe.live') as HTMLIFrameElement | null)?.contentWindow?.['__collageOpen' as keyof Window]), { timeout: 30_000 })
		.toBe('function');
	// Chart-detail is bound after the first paint; a digit pressed earlier is dropped.
	await expect(async () => {
		await page.keyboard.press('1');
		await expect(popover(page)).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });
	await page.keyboard.press('0');
	await expect(popover(page)).toHaveCount(0);
}

/** Add the photos to the live chart slide as a collage and open the first through the frame's guard. */
function openTilesOnChartSlide(page: Page) {
	return page.evaluate((photos) => {
		const fr = document.querySelector('[role="dialog"][aria-label="Present"] iframe.live') as HTMLIFrameElement;
		const d = fr.contentDocument as Document;
		const wrap = d.createElement('div');
		wrap.setAttribute('data-collage', '');
		for (const [alt, src] of photos as string[][]) {
			const tile = d.createElement('div');
			tile.className = 'collage-tile';
			tile.setAttribute('data-label', alt);
			const img = d.createElement('img');
			img.src = src;
			img.alt = alt;
			tile.appendChild(img);
			wrap.appendChild(tile);
		}
		d.body.appendChild(wrap);
		const first = wrap.querySelector('.collage-tile') as HTMLElement;
		return (fr.contentWindow as unknown as { __collageOpen: (t: Element) => boolean }).__collageOpen(first);
	}, PHOTOS);
}

test('a digit with the lightbox open jumps the photo and marks no chart point; after close it marks again', async ({ page }) => {
	await presentFunnel(page);
	expect(await openTilesOnChartSlide(page)).toBe(true);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await expect(counter(page)).toHaveText('1 / 3');

	// 2 and 3 jump the photo. A chart-detail card on either would be the collision.
	await page.keyboard.press('2');
	await expect(counter(page)).toHaveText('2 / 3');
	await page.keyboard.press('3');
	await expect(counter(page)).toHaveText('3 / 3');
	// Give a (wrongly) delivered keydown time to open a card before asserting there is none.
	await page.waitForTimeout(400);
	await expect(popover(page)).toHaveCount(0);

	// A digit naming no photo (4 of 3) is swallowed too: it must not fall through to mark 4.
	await page.keyboard.press('4');
	await page.waitForTimeout(400);
	await expect(counter(page)).toHaveText('3 / 3');
	await expect(popover(page)).toHaveCount(0);

	// Escape closes the lightbox and ONLY the lightbox: Present stays open.
	await page.keyboard.press('Escape');
	await expect(lightbox(page)).toHaveCount(0);
	await expect(dialog(page)).toBeVisible();

	// The digit is the chart's again.
	await page.keyboard.press('2');
	await expect(popover(page)).toBeVisible({ timeout: 5000 });
});

test('with the lightbox open, a digit moves nothing in Present beneath it', async ({ page }) => {
	await presentFunnel(page);
	const slide = dialog(page).getByText(/^\d+ \/ \d+$/).first();
	const before = await slide.innerText();
	expect(await openTilesOnChartSlide(page)).toBe(true);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	for (const k of ['1', '2', '3', '0']) await page.keyboard.press(k);
	await page.waitForTimeout(400);
	await expect(popover(page)).toHaveCount(0);
	await expect(slide).toHaveText(before);
	await expect(dialog(page)).toBeVisible();
});

test('a person cannot open the lightbox from inside Present (the slide card is pointer-events-none)', async ({ page }) => {
	await presentFunnel(page);
	// Tiles on the chart slide, NOT opened: the attempt below is a real click on the photo.
	await page.evaluate((photos) => {
		const fr = document.querySelector('[role="dialog"][aria-label="Present"] iframe.live') as HTMLIFrameElement;
		const d = fr.contentDocument as Document;
		const wrap = d.createElement('div');
		wrap.setAttribute('data-collage', '');
		wrap.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9';
		for (const [alt, src] of photos as string[][]) {
			const tile = d.createElement('div');
			tile.className = 'collage-tile';
			tile.style.cssText = 'width:100%;height:100%';
			const img = d.createElement('img');
			img.src = src;
			img.alt = alt;
			img.style.cssText = 'width:100%;height:100%';
			tile.appendChild(img);
			wrap.appendChild(tile);
		}
		d.body.appendChild(wrap);
	}, PHOTOS);
	const box = await dialog(page).locator('iframe.live').boundingBox();
	if (!box) throw new Error('no Present frame');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.waitForTimeout(600);
	await expect(lightbox(page)).toHaveCount(0);
});
