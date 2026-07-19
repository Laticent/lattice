import { expect, gotoStudio, test } from './studio-fixture';

// The Architect panel. The Coach score card is deterministic (no model); the
// Chat tab degrades honestly offline instead of fabricating a reply.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	// The Architect panel is collapsed by default — open it before asserting.
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByRole('tab', { name: 'Coach' })).toBeVisible();
});

test('Coach and Chat tabs toggle', async ({ page }) => {
	const coach = page.getByRole('tab', { name: 'Coach' });
	const chat = page.getByRole('tab', { name: 'Chat' });
	await expect(coach).toHaveAttribute('aria-selected', 'true');

	await chat.click();
	await expect(chat).toHaveAttribute('aria-selected', 'true');
	await expect(coach).toHaveAttribute('aria-selected', 'false');
});

test('the Coach score card scores the seeded deck', async ({ page }) => {
	await expect(page.getByText('Board readiness')).toBeVisible();
	// The REAL engine scorecard: an overall out of 100 and a per-dimension read
	// (Structure/Clarity are always-present categories). The toy 3-check heuristic
	// (Components valid / Opens with a title / Variety, scored / 10) was deleted.
	await expect(page.getByText(/\/ 100/)).toBeVisible();
	await expect(page.getByText('Structure')).toBeVisible();
	await expect(page.getByText('Clarity')).toBeVisible();
});

test('offline chat degrades honestly and points to Workspace', async ({ page }) => {
	await page.getByRole('tab', { name: 'Chat' }).click();
	const input = page.getByRole('textbox', { name: 'Message the Architect' });
	await input.fill('Tighten slide two.');
	await page.getByRole('button', { name: 'Send' }).click();

	// The message was actually submitted (a user bubble rendered)…
	await expect(page.getByText('Tighten slide two.')).toBeVisible();
	// …and the reply is the honest degradation — distinct from the empty-thread
	// placeholder, so this can only pass if the send path ran (never a fabricated
	// edit). "…Workspace → AI and I can answer…" is the reply-only wording.
	await expect(page.getByText(/Workspace → AI and I can answer/)).toBeVisible();
});
