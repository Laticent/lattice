import { expect, test } from './studio-fixture';

/**
 * NO AUTHORING ALARM ON A READER-FACING DOCS PAGE.
 *
 * The docs site's live component previews are built by the one shared builder
 * (`src/lib/single-slide-render.ts`), which injects `lattice-runtime.js` into each srcdoc frame.
 * The runtime's overflow watcher self-boots there in AUTHOR mode, so both engine alarms can paint
 * on a page someone is merely browsing:
 *   · the red `.overflow` ring + "Overflows" tab, and
 *   · the amber `.illegible` ring + a "Type Npx · floor Npx" tab (§8 rule 8's type floor).
 *
 * Author mode is the right default for the surfaces where the reader can ACT — the Specimen has an
 * Edit face, the Studio is an editor — so this is deliberately NOT a behavior change. It is a
 * regression check on an exposure that was previously unmonitored: a component sample drifting
 * dense enough to ring would put a QA badge on a marketing page, and the first to know would be a
 * prospective user. Nothing in the shipped previews trips either alarm today, verified against a
 * local build of the deployed bundle (including `radar` and `diagram`, whose galleries DO ring at
 * gallery size).
 *
 * Not a GATE, though, and the distinction matters: these specs run in `studio-smoke`, which
 * `ci.yml` leaves OUT of the aggregate `ci` job, so a regression here goes red without blocking a
 * merge. Calling it a gate would be the same hollow claim the positive control below exists to
 * prevent.
 *
 * That control is load-bearing. Without it "zero alarms" could pass because the watcher never
 * booted — the hollow-gate failure this repo has already shipped once (§8 rule 9's cover gate keyed
 * on a class only one of six emitting paths used, so it asserted over an empty set and passed
 * trivially). It therefore proves the watcher runs in EVERY frame the assertions read, not merely
 * in one of them.
 */

// Only the landing page mounts live previews (`src/pages/index.astro` → `DeckPreview`); every other
// marketing route is static prose, and probing them cost ~24s of a 60s budget to learn nothing.
// Which pages carry a preview is a property of the copy, not of this check, so the route list is
// still probed rather than assumed — the load-bearing assertion is the `inspected` count.
const READER_ROUTES = ['/'];
const FRAME = 'iframe.live';

/** Wait for previews on this route; false when the page simply has none. */
async function previewsAppear(page: import('@playwright/test').Page): Promise<boolean> {
	try {
		await page.waitForSelector(FRAME, { state: 'attached', timeout: 8000 });
	} catch {
		return false;
	}
	// Font-gated: the watcher re-measures once webfonts land, so a too-early read can miss a ring.
	await page.waitForTimeout(4500);
	return true;
}

/** Indices of the preview frames on the current page that actually rendered a slide. */
async function slideFrames(page: import('@playwright/test').Page): Promise<number[]> {
	const out: number[] = [];
	const n = await page.locator(FRAME).count();
	for (let i = 0; i < n; i += 1) {
		const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
		const slides = await frame.locator('section[data-lattice-slide]').count().catch(() => 0);
		if (slides) out.push(i);
	}
	return out;
}

test('@smoke docs: no shipped preview paints an authoring alarm to a reader', async ({ page }) => {
	let inspected = 0;
	const visited: string[] = [];

	for (const route of READER_ROUTES) {
		await page.goto(route, { waitUntil: 'networkidle' });
		if (!(await previewsAppear(page))) continue;
		visited.push(route);

		for (const i of await slideFrames(page)) {
			const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
			inspected += 1;
			expect(await frame.locator('section.overflow').count(), `${route} frame ${i}: ringed "Overflows"`).toBe(0);
			expect(await frame.locator('section.illegible').count(), `${route} frame ${i}: ringed below the type floor`).toBe(0);
			expect(await frame.locator('.overflow-tab, .illegible-tab').count(), `${route} frame ${i}: carries an authoring tab`).toBe(0);
		}
	}

	expect(
		inspected,
		`no live preview frame rendered a slide on any of ${READER_ROUTES.join(', ')} (reached: ${visited.join(', ') || 'none'}) — nothing was actually checked`,
	).toBeGreaterThan(0);
});

test('@smoke docs: EVERY inspected preview frame is really watched', async ({ page }) => {
	// POSITIVE CONTROL, per frame. Inject a figure whose labels render far below the type floor into
	// each preview frame the test above reads, and require the watcher to react in ALL of them.
	// Proving one frame is watched would leave the rest free to be silent for the wrong reason.
	await page.goto('/', { waitUntil: 'networkidle' });
	expect(await previewsAppear(page), 'the landing page must carry a live preview to control against').toBe(true);

	const frames = await slideFrames(page);
	expect(frames.length, 'no preview frame rendered a slide, so there is nothing to control').toBeGreaterThan(0);

	const silent: number[] = [];
	for (const i of frames) {
		const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
		await frame.locator('section[data-lattice-slide]').first().evaluate((s: Element) => {
			s.insertAdjacentHTML(
				'beforeend',
				'<svg viewBox="0 0 900 60" width="900" height="60"><text x="0" y="40" font-size="4">tiny</text></svg>',
			);
		});
	}
	// One shared settle: the watcher is debounced, and 3s per frame would blow the smoke budget.
	await page.waitForTimeout(3000);
	for (const i of frames) {
		const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
		if ((await frame.locator('section.illegible').count().catch(() => 0)) === 0) silent.push(i);
	}

	expect(
		silent,
		`frame(s) ${silent.join(', ')} of ${frames.length} did not react to a 4px figure — the watcher is not running there, so the "zero alarms" assertion proves nothing about them`,
	).toEqual([]);
});
