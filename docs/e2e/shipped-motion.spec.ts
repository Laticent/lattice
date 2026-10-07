// The shipped motion library on the real Studio (engineering/decisions/2026-09-23-portable-packages.md
// §5, phase 5): the Library's Motion tab lists the scenes in lib/motion/, and Insert places one in the
// deck through the same writer a saved scene uses. A unit test can prove the list and the markdown;
// only the real Library can prove a person finds the cards and that Insert reaches the deck.

import { expect, gotoStudio, livePreview, persistedSource, test } from './studio-fixture';

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

test('the Library lists the shipped scenes on its Motion tab, and Insert places one in the deck', async ({ page }) => {
	await gotoStudio(page);
	await openLibrary(page);
	const tabs = page.getByRole('tablist', { name: 'Library sections' });
	await tabs.getByRole('tab', { name: 'Motions', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Shipped with Lattice' })).toBeVisible();
	for (const label of ['Rotor', 'Pipeline, beat by beat', 'Arrivals', 'Ring and marker']) {
		await expect(page.getByRole('button', { name: `Insert ${label}`, exact: true })).toBeVisible();
	}

	// THE FAILING ARM of "the All tab is the user's own shelf": the shipped cards do not show there.
	await tabs.getByRole('tab', { name: 'All', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Shipped with Lattice' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Insert Rotor', exact: true })).toHaveCount(0);
	await tabs.getByRole('tab', { name: 'Motions', exact: true }).click();

	await page.getByRole('button', { name: 'Insert Pipeline, beat by beat', exact: true }).click();
	await expect.poll(() => persistedSource(page), { timeout: 10_000 }).toContain('## Pipeline, beat by beat');
	const src = await persistedSource(page);
	expect(src).toContain('<!-- _class: scene -->');
	expect(src).toContain('```anima');
	// A copy, not the shipped namespace: two inserts of the same scene never share an id.
	expect(src).not.toContain('m3dimpz56-');

	// The scene slide renders in the live preview with its drawing.
	const frame = livePreview(page);
	await expect(frame.locator('section.scene svg[role="img"] title', { hasText: 'Pipeline, beat by beat' }).first()).toBeAttached({ timeout: 15_000 });
});
