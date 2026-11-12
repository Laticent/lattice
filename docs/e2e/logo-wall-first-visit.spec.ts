/**
 * logo-wall on the real Studio live preview, FIRST visit: the wall is held back while its marks are
 * measured, then painted once, packed. It is never painted as the unpacked grid and then re-laid out.
 *
 * The live stamp (lib/transformers/logo-marks.js, on lib/core/measure-kit.js) marks the list
 * `measuring` and the component's CSS hides it until the marks' shapes are known. Marks are delayed
 * 300 ms here, as on a phone over a preview deploy. The recorder samples the wall's state and its
 * computed visibility on every animation frame inside the preview frame, so any state that was ever
 * painted shows up in the log. A second spec case delays the marks past the 4 s cap and checks the
 * wall still appears (as the unpacked grid) rather than staying hidden.
 */
import type { Page } from '@playwright/test';
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

// One entry per change of (state, visibility) the live preview painted. `none` when no wall is on the slide.
// Sampled from the TOP page on every animation frame, reading whichever preview document is current, so a frame
// the Studio swaps in or rewrites is followed from its first frame. Not an init script inside the frame: a preview
// frame is written before it enters the page (docs/src/lib/srcdoc-write.js), and Chromium runs init scripts in the
// frame's initial about:blank, whose animation-frame callbacks die when the srcdoc document replaces it.
const RECORDER = (sel: string) => {
	if (window.top !== window) return;
	const w = window as unknown as { __wallLog: string[] };
	w.__wallLog = [];
	const tick = () => {
		const doc = document.querySelector<HTMLIFrameElement>(sel)?.contentDocument;
		const ul = doc?.querySelector('section.logo-wall .cell-stage > ul');
		const view = doc?.defaultView;
		const state = ul && view ? `${ul.getAttribute('data-logo-wall') ?? 'unstamped'}/${view.getComputedStyle(ul).visibility}` : 'none';
		if (w.__wallLog[w.__wallLog.length - 1] !== state) w.__wallLog.push(state);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
};
const painted = (page: Page) => page.evaluate(() => (window as unknown as { __wallLog?: string[] }).__wallLog ?? []);

async function openDeck(page: Page) {
	await page.addInitScript(RECORDER, LIVE_PREVIEW);
	const target = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.setViewportSize(target);
	const heading = livePreview(page).locator('section h2').first();
	await expect(heading).toHaveText('After the wall.', { timeout: 20_000 });
	return page.getByRole('button', { name: 'Previous slide' }).first();
}

test('a first visit holds the wall hidden while it measures, then paints it once, packed @crosswidth @webkit-phone', async ({ page }) => {
	await page.route('**/samples/logo-*.svg', async (route) => {
		await new Promise((r) => setTimeout(r, 300));
		await route.continue();
	});
	const prev = await openDeck(page);
	await prev.click();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="packed"]').first();
	await expect(wall).toBeVisible({ timeout: 20_000 });
	// The sampler logs on the top page's next animation frame, which can trail the locator's own check: wait for it.
	const walls = async () => (await painted(page)).filter((s) => s !== 'none');
	await expect.poll(async () => (await walls()).at(-1)).toBe('packed/visible');
	const log = await walls();
	// Never the unpacked grid on screen: every state before `packed` is hidden.
	for (const s of log.slice(0, -1)) expect(s).toBe('measuring/hidden');
	expect(log).not.toContain('unstamped/visible');
	expect(log).not.toContain('fallback/visible');
});

test('a mark that never arrives does not leave the wall hidden: the cap shows the unpacked grid', async ({ page }) => {
	test.setTimeout(60_000);
	await page.route('**/samples/logo-acme.svg', async (route) => {
		if (route.request().resourceType() === 'fetch') {
			await new Promise((r) => setTimeout(r, 9_000));
		}
		await route.continue();
	});
	const prev = await openDeck(page);
	await prev.click();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="fallback"]').first();
	await expect(wall).toBeVisible({ timeout: 15_000 });
	await expect.poll(async () => (await painted(page)).filter((s) => s !== 'none').at(-1)).toBe('fallback/visible');
});
