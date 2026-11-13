/**
 * logo-wall on the real Studio live preview, FIRST visit: the wall is held back while its marks are
 * measured, then painted once, packed. It is never painted as the unpacked grid and then re-laid out.
 *
 * The live stamp (lib/transformers/logo-marks.js, on lib/core/measure-kit.js) marks the list
 * `measuring` and the component's CSS hides it until the marks' shapes are known. The marks are held
 * back here until the wall has been painted as `measuring`, as on a phone over a preview deploy, so the
 * measuring state is a state the test SAW rather than one a 300 ms delay hoped to produce. The recorder
 * samples the wall's state and its computed visibility from the top page on every animation frame,
 * reading whichever preview document is current, so any state that was ever painted shows up in the log. A second spec case holds one mark
 * forever and checks the wall still appears at the cap (as the unpacked grid) rather than staying hidden.
 */
import type { Page } from '@playwright/test';
import { routeHolds } from './route-hold';
import { expect, gotoStudio, LIVE_PREVIEW, livePreview, test } from './studio-fixture';

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

/**
 * Open the Studio on `deck`, SEEDED as the boot deck's saved source (as filo-compose.spec.ts does), on slide 1. The wall
 * is slide 2, so the returned Next button is what brings it on screen for the first time.
 *
 * Not typed in: `setEditorContent` selects all, deletes and inserts, and on webkit-phone at four workers a source write
 * landing between the select-all and the delete collapsed the selection, so the deck went in at the caret inside the
 * welcome deck (1 run in 10). This spec is about the wall's first paint, not about typing, so it skips that path.
 */
async function openDeck(page: Page) {
	await page.addInitScript(RECORDER, LIVE_PREVIEW);
	await page.addInitScript((src) => {
		if (!sessionStorage.getItem('logo-wall-seeded')) {
			localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(src));
			sessionStorage.setItem('logo-wall-seeded', '1');
		}
	}, deck);
	await gotoStudio(page);
	const heading = livePreview(page).locator('section h2').first();
	await expect(heading).toHaveText('Before the wall.', { timeout: 20_000 });
	return page.getByRole('button', { name: 'Next slide' }).first();
}

test('a first visit holds the wall hidden while it measures, then paints it once, packed @crosswidth @webkit-phone', async ({ page }) => {
	const marks = routeHolds();
	await page.route('**/samples/logo-*.svg', async (route) => {
		await marks.hold();
		await route.continue();
	});
	const next = await openDeck(page);
	await next.click();
	// The marks are held, so the wall must be measuring, and hidden while it does. Only then let them in.
	await expect.poll(async () => painted(page), { timeout: 20_000 }).toContain('measuring/hidden');
	marks.releaseAll();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="packed"]').first();
	await expect(wall).toBeVisible({ timeout: 20_000 });
	// The recorder samples once per frame inside the preview, so the packed wall can be visible before the frame that
	// logs it has run (1 run in 10 on webkit-phone). Wait for the recorder to have logged it, then read its history.
	await expect.poll(async () => (await painted(page)).filter((s) => s !== 'none').at(-1), { message: 'the recorder never logged the packed wall' }).toBe('packed/visible');
	const log = (await painted(page)).filter((s) => s !== 'none');
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
	const next = await openDeck(page);
	await next.click();
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="fallback"]').first();
	await expect(wall).toBeVisible({ timeout: 15_000 });
	const log = (await painted(page)).filter((s) => s !== 'none');
	expect(log.at(-1)).toBe('fallback/visible');
	// The cap fired while the read was still in flight, not because it had failed or come back.
	await acme.held();
	acme.releaseAll();
});
