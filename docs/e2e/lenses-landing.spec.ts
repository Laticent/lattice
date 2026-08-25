import { CHROME, expect, gotoStudio, openLenses, test } from './studio-fixture';

// The LANDING view (front matter's `lens-default:`) on the REAL browser — HARD RULE #23. The jsdom tier
// (studio.present-landing-view.test.tsx, LensesPanel.test.tsx) proves the same resolution; this is the
// confirmation on the surface a person actually drives: a real radix select, a real Present takeover.
//
// The contract: a landing view says where a reader STARTS, not what they may see. It fails SOFT — an
// unapproved target opens the full deck — which is safe precisely because the picker offered the full
// deck anyway. That is the opposite of a view a reader PICKS, which fails CLOSED (lenses.spec.ts).

test.beforeEach(async ({ page }) => {
	// Start from an empty reader-view slate: workspace inheritance off before the app loads, matching
	// lenses.spec.ts (the inherited-starters path has its own spec).
	await page.addInitScript(() => {
		window.localStorage.setItem('lattice-studio-settings', JSON.stringify({ lensDefaults: false }));
	});
	await gotoStudio(page);
	await openLenses(page);
});

/** The presented "N / TOTAL" counter's TOTAL — how many slides the reader is being shown. */
async function presentedTotal(page: import('@playwright/test').Page): Promise<number> {
	const present = page.getByRole('dialog', { name: 'Present' });
	const text = await present.getByText(/^\d+ \/ \d+$/).textContent();
	return Number((text ?? '0 / 0').split('/')[1]);
}

test('a deck lands its readers on the view the author chose', async ({ page }) => {
	// Build an approved Bottom-line view (the add → suggest → preview → approve loop).
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name: /Bottom line/ }).click();
	await page.getByRole('button', { name: 'Accept all' }).click();
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await page.getByRole('button', { name: /Approve for readers/ }).click();

	// Before choosing: the deck lands on the whole deck, and says so.
	const landing = page.getByRole('combobox', { name: CHROME.landingView });
	await expect(landing).toHaveText(/Full deck/);
	await expect(page.getByText(/opens on the whole deck/i)).toBeVisible();

	await page.getByRole('button', { name: 'Present' }).click();
	const fullTotal = await presentedTotal(page);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeHidden();

	// Choose Bottom line as the landing view — the real select, opened and picked.
	await landing.click();
	await page.getByRole('option', { name: /Bottom line/ }).click();
	await expect(landing).toHaveText(/Bottom line/);
	await expect(page.getByText(/Present opens on Bottom line/i)).toBeVisible();

	// Present now OPENS on the reader's view — a strict subset — starting at its first slide, not the
	// editing cursor. This is the assertion the whole slice exists for: before this change `lens-default:`
	// round-tripped through front matter and every consumer ignored it.
	await page.getByRole('button', { name: 'Present' }).click();
	const briefTotal = await presentedTotal(page);
	expect(briefTotal).toBeGreaterThan(0);
	expect(briefTotal).toBeLessThan(fullTotal);
	await expect(page.getByRole('dialog', { name: 'Present' }).getByText('1 / ' + briefTotal)).toBeVisible();
	// A landing view is not a lock: the reader is still offered every eligible view, Full included.
	await expect(page.getByRole('dialog', { name: 'Present' }).getByRole('button', { name: 'Reader view' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeHidden();

	// FAIL SOFT: un-approving the landing view drops readers back to the full deck rather than showing
	// them an "unavailable" wall — and the panel says which case the author is in.
	await page.getByRole('button', { name: 'Unapprove' }).click();
	await expect(page.getByText(/isn’t approved yet, so readers land on Full deck/i)).toBeVisible();
	await expect(landing).toHaveText(/Bottom line/); // the author's choice is kept, not silently reset

	await page.getByRole('button', { name: 'Present' }).click();
	expect(await presentedTotal(page)).toBe(fullTotal);
});
