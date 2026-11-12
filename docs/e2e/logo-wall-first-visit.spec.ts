/**
 * logo-wall on the real Studio live preview, FIRST visit: the wall is held back while its marks are
 * measured, then painted once, packed. It is never painted as the unpacked grid and then re-laid out.
 *
 * The live stamp (lib/transformers/logo-marks.js, on lib/core/measure-kit.js) marks the list
 * `measuring` and the component's CSS hides it until the marks' shapes are known. The marks are held
 * back here until the wall has been painted as `measuring`, as on a phone over a preview deploy, so the
 * measuring state is a state the test SAW rather than one a 300 ms delay hoped to produce. The recorder
 * samples the wall's state and its computed visibility on every animation frame inside the preview
 * frame, so any state that was ever painted shows up in the log. A second spec case holds one mark
 * forever and checks the wall still appears at the cap (as the unpacked grid) rather than staying hidden.
 */
import type { Frame, Page } from '@playwright/test';
import { routeHolds } from './route-hold';
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
	const marks = routeHolds();
	await page.route('**/samples/logo-*.svg', async (route) => {
		await marks.hold();
		await route.continue();
	});
	const prev = await openDeck(page);
	await prev.click();
	// The marks are held, so the wall must be measuring, and hidden while it does. Only then let them in.
	await expect.poll(async () => painted(await previewFrame(page)), { timeout: 20_000 }).toContain('measuring/hidden');
	marks.releaseAll();
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
	// One mark's shape read is held for the whole test: a mark that never arrives, which is what the cap is for.
	const acme = routeHolds();
	await page.route('**/samples/logo-acme.svg', async (route) => {
		if (route.request().resourceType() === 'fetch') await acme.hold();
		await route.continue();
	});
	const prev = await openDeck(page);
	await prev.click();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="fallback"]').first();
	await expect(wall).toBeVisible({ timeout: 15_000 });
	const log = (await painted(await previewFrame(page))).filter((s) => s !== 'none');
	expect(log.at(-1)).toBe('fallback/visible');
	// The cap fired while the read was still in flight, not because it had failed or come back.
	await acme.held();
	acme.releaseAll();
});
