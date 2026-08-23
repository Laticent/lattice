import { expect, gotoStudio, test } from './studio-fixture';

// Fabricate — the Theme / Component studio. Deterministic surfaces: the derived
// contract + WCAG audit recompute from the theme colors, the light/dark specimen
// toggles, and the Component tab's gate reports palette-blind/scoped status.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await expect(page.getByRole('button', { name: 'Back to Compose' })).toBeVisible();
});

test('fabricate opens on the Theme tab with the derived contract and WCAG audit', async ({ page }) => {
	await expect(page.getByRole('textbox', { name: 'Theme name' })).toBeVisible();
	await expect(page.getByText(/Contract . \d+ roles/)).toBeVisible();
	await expect(page.getByText(/WCAG audit/)).toBeVisible();
});

test('the theme specimen toggles between light and dark', async ({ page }) => {
	const light = page.getByRole('button', { name: 'Light specimen' });
	const dark = page.getByRole('button', { name: 'Dark specimen' });
	await dark.click();
	await expect(dark).toHaveAttribute('aria-pressed', 'true');
	await light.click();
	await expect(light).toHaveAttribute('aria-pressed', 'true');
});

test('the Component tab reports a palette-blind / scoped gate', async ({ page }) => {
	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Component name' })).toBeVisible();
	// The default component is clean → the gate reports it ready.
	await expect(page.getByText(/Palette-blind and scoped|ready to save/)).toBeVisible();
});

test('the Finish designer: spotlight reveals a joystick-placed window, mutually exclusive with clearance', async ({ page }) => {
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	const clearance = page.getByRole('checkbox', { name: 'Clear behind content' });
	const spotlight = page.getByRole('checkbox', { name: 'Spotlight one area' });
	await expect(clearance).toBeVisible();
	await expect(spotlight).toBeVisible();
	// Enabling clearance then spotlight: spotlight wins, clearance turns off (one mask).
	await clearance.check();
	await expect(clearance).toBeChecked();
	await spotlight.check();
	await expect(clearance).not.toBeChecked();
	// The joystick + radius controls appear for placing the window.
	await expect(page.getByLabel('Move spotlight')).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Radius' })).toBeVisible();
	// Re-enabling clearance clears spotlight (and hides its controls).
	await clearance.check();
	await expect(spotlight).not.toBeChecked();
	await expect(page.getByLabel('Move spotlight')).toHaveCount(0);
});

test('returning to Compose restores the editor', async ({ page }) => {
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
});

/**
 * THE SEPARATION ROW, on the real panel (HARD RULE #23).
 *
 * `lib/theme/contrast.js` grew a second predicate — an OKLab distance between two
 * INKS rather than a WCAG ratio against a canvas — because `checkMutedTierFloors`
 * measures that only over `themes/`, and a theme fabricated here never joins that
 * population. The unit tests prove the predicate; only this proves the AUTHOR sees
 * it, which is the whole point of the change (#1715 §9).
 *
 * The two inks below put a body already at its AA ceiling on the Dusk canvas next to
 * a muted far too pale to keep: the derivation repairs muted UP to AA and lands it on
 * body. Before this change the panel read six green rows and "AA verified" on exactly
 * this palette.
 */
test('a collapsed muted tier shows a failing separation row with its dE', async ({ page }) => {
	const panel = page.getByText('WCAG audit').locator('xpath=ancestor::div[1]/..');
	// Six green contrast rows to begin with — a PASSING separation row is correctly
	// evicted by the cap, which is why only a failure has to surface.
	await expect(panel.getByText('AA verified')).toBeVisible();
	await expect(panel.getByText('Muted-separation')).toHaveCount(0);

	// Edit each essential the way an author does: pick the role in the token tree,
	// then set its color in the inspector.
	//
	// The ESSENTIALS group, not the CONTRACT one — the tree carries both and they read
	// almost the same ("Body ink" vs "Body"). Overriding the contract token directly
	// would set `--text-muted` by hand and prove nothing: the collapse under test is
	// the one the DERIVATION manufactures when it repairs a too-pale muted up to AA
	// against a body already sitting at its ceiling.
	for (const [role, hex] of [['Body ink', '#767676'], ['Muted ink', '#dddddd']] as const) {
		await page.getByRole('button', { name: role, exact: true }).click();
		await expect(page.getByText('Picked color')).toBeVisible();
		await page.locator('input[type="color"]').first().fill(hex);
	}

	// The row appears, reads FAIL, and reports a DISTANCE — never a fabricated ratio
	// and never a WCAG tier badge, because WCAG does not define this measurement.
	const row = panel.getByText('Muted-separation').locator('..');
	await expect(row).toBeVisible();
	await expect(row).toContainText(/\u0394E 0\.0\d\d/);
	await expect(row).toContainText('FAIL');
	await expect(row).not.toContainText(': 1');
	// …and it drags the aggregate verdict down, so the badge and the rows agree.
	await expect(panel.getByText('review')).toBeVisible();
	await expect(panel.getByText('AA verified')).toHaveCount(0);
});
