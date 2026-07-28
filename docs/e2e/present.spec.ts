import { expect, gotoStudio, slideCount, test } from './studio-fixture';

// The Present overlay: enter, navigate, switch reader lens, open the slide
// overview, and exit on Escape. The slide total is read from the seed deck so the
// counter assertions don't hard-code its size.

let total = 0;

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});

test('present navigates through slides and exits on Escape', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();

	// Scope to the overlay — the main preview also has a "Next slide" button.
	await dialog.getByRole('button', { name: 'Next slide' }).click();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('an untagged deck has no reader-view switcher in Present (heuristics retired)', async ({ page }) => {
	// The old author-blind exec/onepager heuristics are retired: a deck with no `lenses:` registry has
	// nothing to switch to, so Present shows a static "Full deck" label — not a dropdown. (Building +
	// approving a reader view, then switching to it in Present, is covered by lenses.spec — which also
	// carries the z-order regression guard for the picker-behind-the-overlay bug.)
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText('Full deck')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Reader view' })).toHaveCount(0);
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible(); // full deck, not trimmed
});

test('the presented slide card stays a 16:9 box inside its row (#1227) @webkit-tablet', async ({ page }) => {
	// The measured geometry oracle for the slide box: 16:9, clear of the header, inside
	// the row — the outcome that must hold on every engine.
	//
	// The `@webkit-tablet` tag is what makes this a GUARD rather than a formality. #1227 is
	// an engine divergence, and re-measuring the reverted fix showed it needs wide AND short:
	// WebKit at 1180x703 fails all three assertions below (ratio 1.685, covers the header,
	// +16px past the row) while WebKit at 1440x900 / 820x1180 / 390x844 — and Chromium at
	// every viewport — passes. So ONLY the `webkit-tablet` project (playwright.config.ts) can
	// catch a reintroduction; `desktop` deliberately doesn't run this (its `grepInvert`
	// excludes every `@webkit*` spec), because a Chromium pass here proves nothing about the
	// defect. The class-level invariant is gated separately and PR-side in
	// studio.present-layout.test.tsx, since this whole tier is nightly.
	const box = await page.evaluate(() => {
		const host = document.querySelector('[aria-label="Presented slide"]');
		const card = host?.closest('.aspect-video');
		const row = card?.parentElement?.parentElement;
		const header = document.querySelector('[role="dialog"][aria-label="Present"]')?.firstElementChild;
		if (!card || !row || !header) return null;
		const c = card.getBoundingClientRect();
		return {
			ratio: c.width / c.height,
			coversHeader: c.top < header.getBoundingClientRect().bottom - 0.5,
			overflowsRow: c.height - row.getBoundingClientRect().height,
		};
	});
	expect(box).not.toBeNull();
	expect(box?.ratio).toBeCloseTo(16 / 9, 2);
	expect(box?.coversHeader).toBe(false);
	expect(box?.overflowsRow).toBeLessThanOrEqual(0);
});

test('the slide overview opens with the G key and lists every slide', async ({ page }) => {
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await expect(overview).toBeVisible();
	await expect(overview.getByRole('button', { name: /^Slide \d+$/ })).toHaveCount(total);

	await page.getByRole('button', { name: 'Close slide overview' }).click();
	await expect(overview).toBeHidden();
});
