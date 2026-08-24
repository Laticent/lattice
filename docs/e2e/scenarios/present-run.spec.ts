import { expect, gotoStudio, setEditorContent, slideCount, test } from '../studio-fixture';

// Persona: a presenter delivering a deck. Goal: load the deck, enter Present,
// and reach the LAST slide with every slide actually painting on the way — a
// full traversal, not a first-slide smoke check. A second test drives the
// console's own instruments: the speaker notes and the next-slide preview that
// came back here when the second presenter window was retired
// (2026-08-24-stage-console-split.md). The Stage — the window the ROOM sees —
// has its own spec, `../stage-window.spec.ts`.

test('a presenter traverses the whole seeded deck to the last slide', async ({ page }) => {
	await gotoStudio(page);
	const total = await slideCount(page);
	expect(total).toBeGreaterThan(3);

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// The presented slide renders through its own engine frame.
	const stage = page.frameLocator('[aria-label="Presented slide"] iframe').locator('.lattice').first();
	await expect(stage).not.toBeEmpty();

	// Walk 1 → N with the keyboard, requiring the counter AND a painted slide at
	// every step — the traversal is the oracle, so no step may silently no-op.
	for (let i = 2; i <= total; i++) {
		await page.keyboard.press('ArrowRight');
		await expect(dialog.getByText(`${i} / ${total}`, { exact: true })).toBeVisible();
		await expect(stage).not.toBeEmpty();
	}

	// At the end, and not past it: the Next control is exhausted.
	await expect(dialog.getByRole('button', { name: 'Next slide' })).toBeDisabled();

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('the console carries the speaker note and the next slide — with no second window open', async ({ page }) => {
	// The point of the split: the presenter's instruments are on the presenter's own
	// surface, with nothing projected anywhere. The note ESPECIALLY — it is the one
	// thing that must never reach an audience screen, and here it is on the laptop.
	await gotoStudio(page);

	const NOTE = 'Welcome the board and state the ask in one line.';
	await setEditorContent(
		page,
		`<!-- _class: title -->\n\n# Atlas kickoff\n\n\`Board · Kickoff\`\n\nOne platform, three bets.\n\n<!-- note: ${NOTE} -->\n\n---\n\n# The ask\n\nThirty months, one platform.`,
	);
	await expect(page.getByText('Slide 1 / 2', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// The panel is a ≥ lg affordance — below that the console is the slide alone, which is
	// a fact about the product and not a hole in this evidence. Keyed on the panel actually
	// being offered rather than on a width, so it tracks the breakpoint.
	const panel = dialog.getByRole('complementary', { name: 'Presenter panel' });
	test.skip((await panel.count()) === 0, 'the presenter panel is not offered below the lg breakpoint');

	await expect(panel.getByText(NOTE)).toBeVisible();
	// And the NEXT slide is really rendered, not a placeholder: its own engine frame paints.
	await expect(panel.frameLocator('[aria-label="Next slide preview"] iframe').locator('.lattice').first()).not.toBeEmpty();

	// Walking to the last slide retires the preview and says so, rather than showing
	// slide 1 again or an empty box.
	await page.keyboard.press('ArrowRight');
	await expect(panel.getByText('End of the deck')).toBeVisible();
	await expect(panel.getByText('No speaker notes on this slide.')).toBeVisible();
});
