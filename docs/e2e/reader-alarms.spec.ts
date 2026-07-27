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
 * Edit face, the Studio is an editor — so this is deliberately NOT a behavior change. It is a gate.
 * Nothing in the shipped previews trips either alarm today, verified against a local build of the
 * deployed bundle (including `radar` and `diagram`, whose galleries DO ring at gallery size). The
 * exposure being unmonitored was the actual defect: a component sample drifting dense enough to
 * ring would put a QA badge on a marketing page, and the first to know would be a prospective user.
 *
 * The positive control is part of the gate, not a nicety. Without it "zero alarms" could pass
 * because the watcher never booted — the hollow-gate failure this repo has already shipped once
 * (§8 rule 9's cover gate keyed on a class only one of six emitting paths used, so it asserted
 * over an empty set and passed trivially).
 */

// Candidate reader routes. Which of these actually MOUNTS a live preview is a property of the
// marketing copy, not of this gate — it moved between a local build and CI on the first run, and
// pinning it would make the suite fail whenever a page is rewritten. So the routes are probed and
// the ones without previews are skipped; the hollow-gate guard is the CUMULATIVE `inspected` count
// at the end, which is the assertion that actually matters ("something was really checked").
const READER_ROUTES = ['/', '/overview/', '/features/', '/comparison/'];
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

test('@smoke docs: no shipped preview paints an authoring alarm to a reader', async ({ page }) => {
	let inspected = 0;
	const visited: string[] = [];

	for (const route of READER_ROUTES) {
		await page.goto(route, { waitUntil: 'networkidle' });
		if (!(await previewsAppear(page))) continue;
		visited.push(route);

		const n = await page.locator(FRAME).count();
		for (let i = 0; i < n; i += 1) {
			const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
			const slides = await frame.locator('section[data-lattice-slide]').count().catch(() => 0);
			if (!slides) continue;
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

test('@smoke docs: the alarm gate is not hollow — a preview frame IS watched', async ({ page }) => {
	// POSITIVE CONTROL. Inject a figure whose labels render far below the type floor into a real
	// preview frame and require the watcher to react. If nothing reacts, the assertions above are
	// measuring an unwatched surface and prove nothing.
	await page.goto('/', { waitUntil: 'networkidle' });
	expect(await previewsAppear(page), 'the landing page must carry a live preview to control against').toBe(true);

	const n = await page.locator(FRAME).count();
	let proved = false;
	for (let i = 0; i < n && !proved; i += 1) {
		const frame = page.frameLocator(`${FRAME} >> nth=${i}`);
		const slide = frame.locator('section[data-lattice-slide]').first();
		if (!(await slide.count().catch(() => 0))) continue;
		await slide.evaluate((s: Element) => {
			s.insertAdjacentHTML(
				'beforeend',
				'<svg viewBox="0 0 900 60" width="900" height="60"><text x="0" y="40" font-size="4">tiny</text></svg>',
			);
		});
		await page.waitForTimeout(3000);
		if ((await frame.locator('section.illegible').count().catch(() => 0)) > 0) proved = true;
	}
	expect(proved, 'no preview frame reacted to a 4px figure — the watcher is not running there, so the gate above proves nothing').toBe(true);
});
