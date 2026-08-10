import { appendToEditor, expect, FIRST_PAINT_TIMEOUT, gotoStudio, persistedSource, railButtons, readStorage, slideCount, test, waitForStudioPaint } from './studio-fixture';

// Persistence: edits and the palette choice survive a full reload (the app
// restores from localStorage — the cause-effect the user relies on).

// A reload is a cold first paint again, so the wait goes through the shared
// fixture helper — re-deriving it here is what re-inherits the 15s defaults this
// suite's flake point came from (#1572).
async function waitReady(page: import('@playwright/test').Page): Promise<void> {
	await page.getByLabel('Deck source').waitFor({ state: 'visible', timeout: FIRST_PAINT_TIMEOUT });
	await waitForStudioPaint(page);
}

/**
 * Both tests here paint TWICE — once on entry, once after the reload — and a test
 * plus its hooks share ONE timeout slot. Two 45s paint budgets do not fit inside
 * the config's 60s default, so under real starvation the runner would kill the test
 * before the fixture's own diagnosis could fire, and a triager would get a bare
 * "Test timeout exceeded" for what is a paint stall. 120s makes the budget the
 * fixture advertises actually reachable on the reload path. Same move as
 * `gallery-preview-budget.spec.ts:39` and the `studio-preview-sync.spec.ts` block.
 */
const TWO_PAINT_BUDGET = 120_000;

test('a deck edit survives a reload', async ({ page }) => {
	test.setTimeout(TWO_PAINT_BUDGET);
	await gotoStudio(page);
	const n = await slideCount(page);

	// A leading `---` makes this a NEW slide (the splitter separates on `---`).
	await appendToEditor(page, '\n\n---\n\n<!-- _class: statement -->\n\n# PERSISTMARKER\n');
	await expect.poll(() => persistedSource(page)).toContain('PERSISTMARKER');
	await expect(railButtons(page)).toHaveCount(n + 1);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);

	// The app restored the edited (n+1)-slide deck from storage.
	await expect(railButtons(page)).toHaveCount(n + 1);
	await expect.poll(() => persistedSource(page)).toContain('PERSISTMARKER');
});

// Deliberately NOT the default palette (cuoio since #1285): restoring the default
// after a reload is what happens with an empty store, so a default target would let
// this pass without anything being persisted or restored at all.
test('the palette choice survives a reload', async ({ page }) => {
	test.setTimeout(TWO_PAINT_BUDGET);
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Theme' }).click();
	await page.getByRole('menuitem', { name: 'Burgundy' }).click();
	await expect.poll(() => readStorage(page, 'lattice-studio-palette')).toBe('burgundy');

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);

	// The app re-applied the persisted palette on load.
	await expect
		.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-palette')))
		.toBe('burgundy');
});
