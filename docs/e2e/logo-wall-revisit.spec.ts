/**
 * logo-wall on the real Studio live preview, slide to slide: a wall seen before paints once, packed.
 *
 * The live stamp measures each mark by fetching its SVG (lib/transformers/logo-marks.js). Before
 * this spec, every revisit fetched every mark again and the wall drew as a grid, then jumped into
 * its packed rows when the fetches landed: on a phone over a preview deploy that sent max-age=0,
 * about 1.4 s of empty wall and a visible re-layout. Now the runtime remembers each mark's shape for
 * the life of the frame, so a revisit stamps in the same task, with no fetch. (A first visit still
 * measures; hiding the wall meanwhile is held back because a Studio export could capture it hidden.)
 *
 * The recorder samples the wall's state on every animation frame inside the preview frame, so a
 * state that was ever painted shows up in the log.
 */
import type { Frame, Page } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, livePreview, setEditorContent, test } from './studio-fixture';

const deck = `---
marp: true
---

## Before the wall.

---

<!-- _class: logo-wall -->

## Four shapes, one weight.

- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Spire](sample:logo-spire.svg)
- ![Acme](sample:logo-acme.svg)

---

## After the wall.
`;

async function previewFrame(page: Page): Promise<Frame> {
	const handle = await page.locator(LIVE_PREVIEW).first().elementHandle();
	const frame = await handle?.contentFrame();
	if (!frame) throw new Error('no live preview frame');
	return frame;
}

// Log the wall's state on every painted frame: `none` when no wall is on the slide.
async function record(frame: Frame): Promise<void> {
	await frame.evaluate(() => {
		const w = window as unknown as { __wallLog: string[]; __wallRec?: boolean };
		w.__wallLog = [];
		if (w.__wallRec) return;
		w.__wallRec = true;
		const tick = () => {
			const ul = document.querySelector('section.logo-wall .cell-stage > ul');
			const state = ul ? (ul.getAttribute('data-logo-wall') ?? 'unstamped') : 'none';
			const log = w.__wallLog;
			if (log[log.length - 1] !== state) log.push(state);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

const painted = (frame: Frame) => frame.evaluate(() => (window as unknown as { __wallLog?: string[] }).__wallLog ?? []);

test('a logo wall paints once, packed, and a revisit stamps with no fetch @crosswidth @webkit-phone', async ({ page }) => {
	// A phone-like network for the marks: every mark takes 300 ms.
	const fetched: string[] = [];
	await page.route('**/samples/logo-*.svg', async (route) => {
		// The runtime's shape reads, not the browser's own image loads for the masks.
		if (route.request().resourceType() === 'fetch') fetched.push(route.request().url());
		await new Promise((r) => setTimeout(r, 300));
		await route.continue();
	});
	const target = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.setViewportSize(target);
	const prev = page.getByRole('button', { name: 'Previous slide' }).first();
	const next = page.getByRole('button', { name: 'Next slide' }).first();
	const heading = livePreview(page).locator('section h2').first();
	await expect(heading).toHaveText('After the wall.', { timeout: 20_000 });

	// First visit: measures (4 fetches), then packs.
	await prev.click();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="packed"]').first();
	await expect(wall).toBeVisible({ timeout: 20_000 });
	const frame = await previewFrame(page);

	// Leave and come back: the shapes are remembered, so the wall stamps before its first paint.
	await next.click();
	await expect(heading).toHaveText('After the wall.');
	const before = fetched.length;
	await record(frame);
	await prev.click();
	await expect(wall).toBeVisible();
	// The cache lives in the frame, so it holds only while the Studio patches slides in place: a swap
	// would void it, and must fail here rather than pass on an empty log.
	expect(await previewFrame(page)).toBe(frame);
	expect((await painted(frame)).filter((s) => s !== 'none')).toEqual(['packed']);
	expect(fetched.length - before).toBe(0);
});
