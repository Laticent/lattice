import { expect, gotoStudio, readStorage, test } from './studio-fixture';

// The Workspace sheet. Standing instructions are the fully-offline persistence
// oracle (they write localStorage live); the AI-model tab shows the honest
// "no model" floor when nothing is connected.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace settings' }).click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
});

test('standing instructions persist to localStorage as you type', async ({ page }) => {
	await page.getByRole('tab', { name: 'Instructions' }).click();
	const box = page.getByRole('textbox', { name: 'Standing instructions' });
	await box.fill('Always lead with the number.');

	await expect.poll(() => readStorage(page, 'lattice-studio-instructions')).toContain(
		'Always lead with the number.',
	);
});

test('the AI-model tab is honest about running with no model', async ({ page }) => {
	await page.getByRole('tab', { name: 'AI model' }).click();
	await expect(page.getByText(/No tier active yet|connect a cloud model/)).toBeVisible();
});

test('the General tab switches the placement-handle style and persists it', async ({ page }) => {
	await page.getByRole('tab', { name: 'General' }).click();
	// The choice cards wrap an sr-only radio (a 1px clipped box), so check()'s
	// click point can land over ANOTHER card's chrome and be intercepted — the
	// deterministic red the first nightly with this test surfaced. Click the
	// visible card title exactly as a user does (the label toggles the radio),
	// and assert the radio state plus the persisted setting.
	await page.getByText('Precision', { exact: true }).click();
	await expect(page.getByRole('radio', { name: /Precision/ })).toBeChecked();
	await expect.poll(() => readStorage(page, 'lattice-studio-settings')).toContain('reticle');
	// Switch back to familiar (knob).
	await page.getByText('Familiar', { exact: true }).click();
	await expect(page.getByRole('radio', { name: /Familiar/ })).toBeChecked();
	await expect.poll(() => readStorage(page, 'lattice-studio-settings')).toContain('knob');
});
