import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/**
 * Reshape, on the real Studio (#1281).
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. `applyVariant` is unit-tested at the token
 * level, and it was ALREADY passing those tests while the bug shipped: the defect lived
 * in the wiring, where the apply handler dropped the arguments that decide replace-vs-
 * stack while the picker's preview tiles passed them. So the tile previewed one slide and
 * the author got another. Only the real picker driving the real store can catch that
 * (HARD RULE #23) — so these read the persisted deck source after each pick.
 *
 * Both branches of the model are exercised on real catalog components:
 *   - `kpi` declares five looks but NO `variantAxes`, so they are unclassified and each
 *     tile TOGGLES — picking never stacks forever, and never silently strips.
 *   - `map` ships real axes (`Basemap` exclusive with a `world` default, plus independent
 *     modifiers), so the basemap swaps while the modifiers survive untouched.
 */

const FM = ['---', 'theme: indaco', 'paginate: true', '---', ''].join('\n');
const KPI_DECK = [FM, '<!-- _class: kpi -->', '', '## Revenue ahead of plan.', '', '1. $2.4B', '   - Total revenue', '   - target $2.2B · +9%', ''].join('\n');
const MAP_DECK = [FM, '<!-- _class: map world highlight -->', '', '## Where the program runs.', '', '- Kenya `4.2`', '- Nigeria `3.1`', '- India `2.8`', ''].join('\n');

/** The `_class` tokens of the persisted deck's only slide. */
async function classTokens(page: Page): Promise<string[]> {
	const src = await persistedSource(page);
	const m = src.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
	return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** Open the picker and click a tile by its action name ("Reshape to X" / "Remove X"). */
async function pick(page: Page, action: string): Promise<void> {
	await page.getByRole('button', { name: 'Reshape slide' }).click();
	await page.getByRole('button', { name: action, exact: true }).click();
}

const settled = (page: Page) => expect.poll(() => classTokens(page), { timeout: 15_000 });

test('an unclassified look toggles — it never stacks forever @studio', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, KPI_DECK);
	await settled(page).toEqual(['kpi']);

	// The reported symptom: `_class` grew on every visit to the gallery and never shrank.
	await pick(page, 'Reshape to ops');
	await settled(page).toEqual(['kpi', 'ops']);

	// A second look stacks — kpi declares no axes, so the Studio does not claim to know
	// these are mutually exclusive. What it must never do is grow without bound…
	await pick(page, 'Reshape to spotlight');
	await settled(page).toEqual(['kpi', 'ops', 'spotlight']);

	// …because every look can be taken straight back off, which is what was impossible.
	await pick(page, 'Remove spotlight');
	await settled(page).toEqual(['kpi', 'ops']);
	await pick(page, 'Remove ops');
	await settled(page).toEqual(['kpi']);
});

test('Default keeps the universal slide settings it never offered @studio', async ({ page }) => {
	// `scale-xl` and `no-period` come from the slide drawer's typography/period axes, not
	// from any Reshape tile. Default used to delete them along with the component's looks —
	// silent data loss with no affordance to undo it, on all 38 components with variants.
	await gotoStudio(page);
	await setEditorContent(page, [FM, '<!-- _class: kpi ops scale-xl no-period dark -->', '', '## Revenue ahead of plan.', '', '1. $2.4B', '   - Total revenue', ''].join('\n'));
	await settled(page).toEqual(['kpi', 'ops', 'scale-xl', 'no-period', 'dark']);

	await pick(page, 'Reshape to Default');
	await settled(page).toEqual(['kpi', 'scale-xl', 'no-period', 'dark']);
});

test('the Default tile only claims "Current" when clicking really is a no-op @studio', async ({ page }) => {
	// On a bare `map` the tile badged itself Current and previewed the slide unchanged —
	// then clicking it wrote `map world`, because Default restores the axis default. The
	// badge now asks the model whether the click changes anything.
	await gotoStudio(page);
	await setEditorContent(page, [FM, '<!-- _class: map -->', '', '## Where the program runs.', '', '- Kenya `4.2`', '- Nigeria `3.1`', ''].join('\n'));
	await settled(page).toEqual(['map']);

	await page.getByRole('button', { name: 'Reshape slide' }).click();
	const dflt = page.getByRole('button', { name: 'Reshape to Default', exact: true });
	await expect(dflt).toHaveAttribute('aria-pressed', 'false');
	await dflt.click();
	await settled(page).toEqual(['map', 'world']);

	// Now `world` is the look that's on, so IT owns the badge — not Default. Badging both
	// (they are both no-ops here) put two "Current" tiles in one pick-one family.
	await page.getByRole('button', { name: 'Reshape slide' }).click();
	await expect(page.getByRole('button', { name: 'Reshape to world', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Reshape to Default', exact: true })).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: 'Current' })).toHaveCount(1);

	// And clicking Default really is inert — assert it, don't just claim it.
	await page.getByRole('button', { name: 'Reshape to Default', exact: true }).click();
	await settled(page).toEqual(['map', 'world']);
});

test('an active toggle warns a SIGHTED author that the click removes @studio', async ({ page }) => {
	// The removal affordance used to live only in the accessible name: the visible badge
	// still read "Current", so a sighted author had no warning a click deletes a token.
	await gotoStudio(page);
	await setEditorContent(page, KPI_DECK);
	await settled(page).toEqual(['kpi']);
	await pick(page, 'Reshape to ops');
	await settled(page).toEqual(['kpi', 'ops']);

	await page.getByRole('button', { name: 'Reshape slide' }).click();
	const opsTile = page.getByRole('button', { name: 'Remove ops', exact: true });
	await expect(opsTile).toHaveAttribute('aria-pressed', 'true');
	await expect(opsTile).toContainText('Current ×');
});

test('a classified component swaps within its axis and keeps the rest @studio', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, MAP_DECK);
	await settled(page).toEqual(['map', 'world', 'highlight']);

	// `world` and `us` are one pick-ONE Basemap axis: switching swaps them…
	await pick(page, 'Reshape to us');
	// …and `highlight` is an INDEPENDENT modifier, so it survives. A blanket pick-one
	// family would have eaten it — the over-strip this model exists to prevent.
	await settled(page).toEqual(['map', 'highlight', 'us']);

	// Default returns the base form AND restores the axis default (`world`) — a map with
	// no basemap is not a base form, it is a broken slide.
	await pick(page, 'Reshape to Default');
	await settled(page).toEqual(['map', 'world']);
});
