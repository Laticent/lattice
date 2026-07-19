import { CHROME, expect, gotoStudio, openArchitect, openChat, test } from './studio-fixture';

// The Coach and Chat panels. They are SEPARATE panels now (own toolbar icon, own
// drawer) — the Coach score card is deterministic (no model); Chat degrades honestly
// offline instead of fabricating a reply.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('Coach and Chat are separate panels, mutually exclusive in the assistant slot', async ({ page }) => {
	// Each has its own activity-bar launcher — no tab to switch between them.
	await openArchitect(page); // the Coach
	await expect(page.getByText('Board readiness')).toBeVisible();

	await openChat(page); // opening Chat takes the assistant slot from the Coach
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
	await expect(page.getByText('Board readiness')).toHaveCount(0);

	await openArchitect(page); // and back
	await expect(page.getByText('Board readiness')).toBeVisible();
});

test('the Coach score card scores the seeded deck', async ({ page }) => {
	await openArchitect(page);
	await expect(page.getByText('Board readiness')).toBeVisible();
	// The REAL engine scorecard: an overall out of 100 and a per-dimension read
	// (Structure/Clarity are always-present categories). The toy 3-check heuristic
	// (Components valid / Opens with a title / Variety, scored / 10) was deleted.
	await expect(page.getByText(/\/ 100/)).toBeVisible();
	await expect(page.getByText('Structure')).toBeVisible();
	await expect(page.getByText('Clarity')).toBeVisible();
});

test('offline chat degrades honestly and points to Workspace', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.chat }).click();
	const input = page.getByRole('textbox', { name: 'Message the Architect' });
	await input.fill('Tighten slide two.');
	await page.getByRole('button', { name: 'Send' }).click();

	// The message was actually submitted (a user bubble rendered)…
	await expect(page.getByText('Tighten slide two.')).toBeVisible();
	// …and the reply is the honest degradation — an ephemeral notice, distinct from the
	// empty-thread placeholder, so this can only pass if the send path ran (never a
	// fabricated edit). "…Workspace → AI and I can answer…" is the notice wording.
	await expect(page.getByText(/Workspace → AI and I can answer/)).toBeVisible();
});
