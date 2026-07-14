import { expect, gotoStudio, test } from './studio-fixture';

// Reader views (the Lenses panel) — the human-in-the-loop gate, on the REAL browser (the jsdom e2e in
// StudioShell.test.tsx proves the same loop; this is the real-surface confirmation, HARD RULE #23).
// A machine SUGGESTS membership; the author accepts, PREVIEWS, and APPROVES — and only then is the view
// offered to a reader in Present. A draft view is never presentable.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
});

test('a reader view is offered to a reader ONLY after the author previews + approves it', async ({ page }) => {
	// Add a Bottom-line reader view and accept the (deterministic, no-AI) suggester's proposal.
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name: /Bottom line/ }).click();
	await page.getByRole('button', { name: 'Accept all' }).click();

	// It's a DRAFT — not reader-eligible → Present has NO reader-view switcher at all (just a static
	// "Full deck"), so a reader is never even offered it. (The legacy exec/onepager heuristics that used
	// to fill this picker for an untagged deck are retired.)
	await page.getByRole('button', { name: 'Present' }).click();
	const present = page.getByRole('dialog', { name: 'Present' });
	await expect(present.getByText('Full deck')).toBeVisible();
	await expect(present.getByRole('button', { name: 'Reader view' })).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: /Bottom line/ })).toHaveCount(0);
	await page.keyboard.press('Escape'); // exit Present
	await expect(present).toBeHidden();

	// Preview (the approval gate) then approve.
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await page.getByRole('button', { name: /Approve for readers/ }).click();

	// NOW a reader is offered the view — and the picker actually WORKS inside Present. The menu portals
	// to <body>, so inside the z-[100] Present takeover it must STACK ABOVE the overlay; at the default
	// z-50 it paints BEHIND it — present in the DOM and even hit-testable (so toBeVisible AND a real click
	// both pass) yet visually occluded and unusable. That paint occlusion is invisible to every DOM API,
	// so we assert the stacking invariant directly: the menu's z-index must exceed the overlay's.
	await page.getByRole('button', { name: 'Present' }).click();
	const fullCount = await present.getByText(/^\d+ \/ \d+$/).textContent();
	await present.getByRole('button', { name: 'Reader view' }).click();
	const bottomLine = page.getByRole('menuitem', { name: /Bottom line/ });
	await expect(bottomLine).toBeVisible();
	const zs = await bottomLine.evaluate((el) => {
		const menu = el.closest('[role="menu"]') as HTMLElement;
		const overlay = document.querySelector('[role="dialog"][aria-label="Present"]') as HTMLElement;
		return { menu: Number(getComputedStyle(menu).zIndex) || 0, overlay: Number(getComputedStyle(overlay).zIndex) || 0 };
	});
	expect(zs.menu).toBeGreaterThan(zs.overlay); // regression guard for the "picker invisible in Present" bug
	// Selecting it reshapes the presented set to the approved slides (a strict subset of the full deck).
	await bottomLine.click();
	const total = (n: string | null) => Number((n ?? '0 / 0').split('/')[1]);
	await expect.poll(async () => total(await present.getByText(/^\d+ \/ \d+$/).textContent())).toBeLessThan(total(fullCount));
});

test('Approve is withheld until the view is previewed', async ({ page }) => {
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name: /Bottom line/ }).click();
	await page.getByRole('button', { name: 'Accept all' }).click();
	// Before previewing, there is no Approve button — only the gated stand-in.
	await expect(page.getByRole('button', { name: /Approve for readers/ })).toHaveCount(0);
	await expect(page.getByText(/Preview to approve/i)).toBeVisible();
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await expect(page.getByRole('button', { name: /Approve for readers/ })).toBeVisible();
});
