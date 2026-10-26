import { CHROME, expect, gotoStudio, persistedSource, test, typeDeck } from './studio-fixture';

// The Coach's photo-contrast warning (lib/core/photo-contrast.mjs, coach/photo-contrast-read.ts):
// text on a photo that does not reach 4.5:1 in the live preview is flagged, with a button that pins
// the slide dark or light. The warning is measured from the painted page, so this drives the real
// Studio preview. Nothing is flipped until the button is clicked.

// `card-clear` drops the card's backing, so the theme's own (dark, in light mode) ink sits on a dark photo.
// A heading alone, so the pin's verdict is the heading's: the theme's muted body ink is a second text the pin must also clear.
const DARK_PHOTO_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\n![bg](sample:photo-wide.svg)\n';
// With a paragraph the muted body ink on this photo stays under 4.5:1 even pinned dark, so no pin is offered.
const BODY_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\nThe words sit right on the photo.\n\n![bg](sample:photo-wide.svg)\n';
// The mirror case: a bright photo under light ink (a dark deck), where the fix is to pin the slide light.
const BRIGHT_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR4nGP49O4RSYhhVMOg0AAALNONMNBv9UUAAAAASUVORK5CYII=';
const BRIGHT_PHOTO_DECK = `---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\n![bg](${BRIGHT_PHOTO})\n`;
// A solid card carries the theme's own contrast, whatever the photo is.
const SOLID_CARD_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight -->\n\n## A quiet harbor.\n\nThe words sit on a card.\n\n![bg](sample:photo-wide.svg)\n';

async function openCoach(page: import('@playwright/test').Page): Promise<void> {
	const coach = page.getByRole('button', { name: CHROME.coach }).filter({ visible: true });
	if (await coach.count()) await coach.first().click();
	else {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).first().click();
		await page.getByRole('menuitem', { name: /^Coach/ }).first().click();
	}
	await expect(page.getByText('Deck read').filter({ visible: true }).first()).toBeVisible();
}

const WIDTHS = [1440, 820, 390];
// Light mode: dark ink on a dark photo, pinned dark. Dark mode: light ink on a bright photo, pinned light.
const CASES = [
	{ mode: 'light', deck: DARK_PHOTO_DECK, pin: 'dark' },
	{ mode: 'dark', deck: BRIGHT_PHOTO_DECK, pin: 'light' },
] as const;
for (const { mode, deck, pin } of CASES) {
	for (const width of WIDTHS) {
		// WebKit reads computed colors and the photo canvas its own way (HARD RULE #23): the light-mode case also runs there,
		// the wide one in the tablet project and the narrow one in the phone project, each keeping its desktop run (@crosswidth).
		const engines = mode === 'light' && width === 1440 ? ' @webkit-tablet @crosswidth' : mode === 'light' && width === 390 ? ' @webkit-phone @crosswidth' : '';
		test(`a thin card on a ${pin === 'dark' ? 'dark' : 'bright'} photo is flagged, and the ${pin} pin fixes it (${mode}, ${width}px)${engines}`, async ({ page }, info) => {
			await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
			await page.addInitScript((m) => localStorage.setItem('lattice-docs-mode', m), mode);
			await gotoStudio(page);
			await typeDeck(page, deck);
			await openCoach(page);

			// Light mode: dark ink on a dark photo. Dark mode: the Studio chrome is dark, the DECK is still light.
			const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
			await expect(warning).toBeVisible({ timeout: 20_000 });
			await expect(warning).toContainText(`Pinning the slide ${pin}`);
			await warning.scrollIntoViewIfNeeded();
			await page.screenshot({ path: info.outputPath(`flagged-${mode}-${width}.png`) });

			// Reading it changed nothing.
			expect(await persistedSource(page)).not.toMatch(/_class: [^\n]*\b(dark|light)\b/);

			await page.getByRole('button', { name: `Pin this slide ${pin}` }).filter({ visible: true }).first().click();
			await expect.poll(() => persistedSource(page)).toMatch(new RegExp(`_class: image spotlight card-clear ${pin}`));
			await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
			await page.screenshot({ path: info.outputPath(`pinned-${mode}-${width}.png`) });
		});
	}
}

test('a solid card raises no photo warning, and a warning clears when the card goes solid', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await openCoach(page);
	// First prove the read is running on this deck, so the absence below means something.
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true });
	await expect(warning.first()).toBeVisible({ timeout: 20_000 });
	await typeDeck(page, SOLID_CARD_DECK);
	await expect(warning).toHaveCount(0, { timeout: 20_000 });
});

test('a pin that would not clear the floor is not offered', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, BODY_DECK);
	await openCoach(page);
	await expect(page.getByText(/Neither a dark nor a light slide clears it/).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole('button', { name: /Pin this slide/ })).toHaveCount(0);
});

// The editor's own tooltip on the same slide (`thin-card-no-ink`) is not auto-fixable in lint, so the Studio reads the
// photo from the preview and offers the ONE ink that reads (the dark sample photo wants light ink). Only when the slide is
// not the one on screen, so the photo cannot be read, does it offer both.
for (const width of [1440, 390]) {
	test(`the thin-card tooltip offers the one ink that reads, and the button writes it (${width}px)`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await gotoStudio(page);
		await typeDeck(page, DARK_PHOTO_DECK);
		if (width < 700) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await page.locator('.cm-lintRange-warning').first().hover();
		await expect(page.locator('.cm-diagnosticAction', { hasText: 'Add ink-light' })).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('.cm-diagnosticAction', { hasText: 'Add ink-dark' })).toHaveCount(0);
		await page.locator('.cm-diagnosticAction', { hasText: 'Add ink-light' }).click();
		await expect.poll(() => persistedSource(page)).toMatch(/_class: image spotlight card-clear ink-light/);
		await expect(page.locator('.cm-lintRange-warning')).toHaveCount(0, { timeout: 20_000 });
	});
}

test('a thin card on a slide that is not on screen offers both inks', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const second = DARK_PHOTO_DECK.replace('A quiet harbor.', 'A second harbor.');
	await typeDeck(page, `${DARK_PHOTO_DECK}\n---\n\n${second.split('---\n\n').pop()}`);
	// The caret is on slide 2 after typing, so the preview shows slide 2; slide 1's warning cannot read its photo.
	await page.locator('.cm-lintRange-warning').first().hover();
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Add ink-light' })).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Add ink-dark' })).toBeVisible();
});
