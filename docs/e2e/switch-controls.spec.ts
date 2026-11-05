import { CHROME, expect, gotoStudio, livePreview, openDeckSettingsAt, openInspector, openSection, persistedSource, test, typeDeck } from './studio-fixture';

// The Content tab's switches in the real Studio (engineering/decisions/2026-11-04-switch-vocabulary.md
// §Studio controls): the deck row writes `class: no-X` (or `callout: off`), a slide row writes `with-X` /
// `no-X` on that slide, and the rendered slide carries what the engine settled — one token per switch.

const DECK = [
	'---',
	'title: Switches',
	'---',
	'',
	'<!-- _class: columns -->',
	'',
	'## Two panes side by side',
	'',
	'### First pane',
	'',
	'- A point',
	'- Another point',
	'',
	'### Second pane',
	'',
	'- A point',
	'- Another point',
	'',
].join('\n');

// The engine renders a columns slide as a pane form, so its section does not carry `columns`.
const slideSection = (page: import('@playwright/test').Page) => livePreview(page).locator('section').first();

test.beforeEach(async ({ page }, info) => {
	// The iPhone project keeps its own device viewport: a page laid out at 1440 and then shrunk is not
	// the layout a phone gets.
	if (info.project.name !== 'webkit-phone') await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DECK);
});


// Each functional test runs in Chromium (desktop) and real Firefox (`@gecko`, which the desktop project also
// runs), and as a WebKit twin (`@webkit-tablet`, which the desktop project skips), per playwright.config.ts.
for (const tag of [' @gecko', ' @webkit-tablet']) {
test(`deck Content: each switch writes the deck its token, and the slide renders it${tag}`, async ({ page }) => {
	await openInspector(page);
	await openSection(page, CHROME.deckTab.content);
	const spine = page.getByRole('switch', { name: 'Pane spine' });
	await expect(spine).toHaveAttribute('aria-checked', 'true');
	await spine.click();
	await expect.poll(() => persistedSource(page)).toMatch(/\\nclass: no-spine\\n/);
	await expect(slideSection(page)).toHaveClass(/\bno-spine\b/);

	await page.getByRole('combobox', { name: 'Choose heading period' }).click();
	await page.getByRole('option', { name: 'Remove' }).click();
	await expect.poll(() => persistedSource(page)).toMatch(/\\nclass: (\\"no-spine no-period\\"|no-spine no-period)\\n/);

	await page.getByRole('switch', { name: 'Callouts' }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\ncallout: off\\n');

	// Back on: the tokens go, and the key with them.
	await spine.click();
	await page.getByRole('switch', { name: 'Callouts' }).click();
	await page.getByRole('combobox', { name: 'Choose heading period' }).click();
	await page.getByRole('option', { name: /^Auto/ }).click();
	await expect.poll(() => persistedSource(page)).not.toMatch(/\\n(class|callout):/);
});

test(`slide Content: a deck's On disables the slide's Off, which would lose to it${tag}`, async ({ page }) => {
	await typeDeck(page, DECK.replace('title: Switches', 'title: Switches\nclass: with-period'));
	await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
	await openSection(page, CHROME.slideTab.content);
	const row = page.getByRole('radiogroup', { name: 'Heading period' });
	await expect(row.getByRole('radio', { name: 'Remove' })).toBeDisabled();
	await expect(row.getByRole('radio', { name: 'Add' })).toBeEnabled();
	await expect(page.getByText(/The deck's Add wins over Remove on a slide/)).toBeVisible();
});

test(`slide Content: a slide brings back what the deck turned off, and the engine settles it${tag}`, async ({ page }) => {
	await typeDeck(page, DECK.replace('title: Switches', 'title: Switches\nclass: no-spine'));
	await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
	await openSection(page, CHROME.slideTab.content);
	const row = page.getByRole('radiogroup', { name: 'Pane spine' });
	// Auto follows the deck, and the row says what the deck chose.
	await expect(row.getByRole('radio', { name: 'Auto' })).toBeChecked();
	await expect(page.getByText('Off · deck')).toBeVisible();
	await expect(slideSection(page)).toHaveClass(/\bno-spine\b/);
	await row.getByRole('radio', { name: 'On' }).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: columns with-spine -->');
	// The deck's no-spine still reaches the slide; with-spine wins, so the settled slide carries one token.
	await expect(slideSection(page)).toHaveClass(/\bwith-spine\b/);
	await expect(slideSection(page)).not.toHaveClass(/\bno-spine\b/);
	await row.getByRole('radio', { name: 'Auto' }).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: columns -->');
});
}

test("slide Marks: a slide hides the deck's tints with no-treatment", async ({ page }) => {
	await typeDeck(page, DECK.replace('title: Switches', 'title: Switches\nclass: tint-ambient'));
	await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
	await openSection(page, CHROME.slideTab.marks);
	const hide = page.getByRole('switch', { name: "Hide the deck's tints" });
	await expect(hide).toHaveAttribute('aria-checked', 'false');
	await hide.click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: columns no-treatment -->');
	await expect(slideSection(page)).toHaveClass(/\bno-treatment\b/);
});

// Screenshot evidence at the three shipped widths (QUALITY BAR). Not a golden diff: the shots land in
// test-results for a human to look at.
for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
	// The same phone width in real WebKit (iPhone 15 Pro), which only the webkit-phone project runs.
	['mobile @webkit-phone', 390, 844],
] as const) {
	test(`@crosswidth the Content tab, deck and slide, at ${label} (${width}px)`, async ({ page }, info) => {
		await typeDeck(page, DECK.replace('title: Switches', 'title: Switches\nclass: no-spine with-period'));
		if (info.project.name !== 'webkit-phone') await page.setViewportSize({ width, height });
		if (width > 500) await openDeckSettingsAt(page, width);
		else await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).filter({ visible: true }).first().click();
		await openSection(page, CHROME.deckTab.content);
		const spine = page.getByRole('switch', { name: 'Pane spine' }).filter({ visible: true }).first();
		await expect(spine).toHaveAttribute('aria-checked', 'false');
		await spine.scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath(`content-deck-${label.replace(/ @/, '-')}.png`) });
		// At 390px the bottom bar's Settings opens both scopes behind a Slide | Deck switch; wider, the
		// slide's own Settings button points the panel at the slide.
		const slideScope = page.getByRole('button', { name: 'Slide scope', exact: true }).filter({ visible: true });
		if (await slideScope.count()) await slideScope.first().click();
		else await page.getByRole('button', { name: CHROME.slideSettings }).filter({ visible: true }).first().click();
		await openSection(page, CHROME.slideTab.content);
		const row = page.getByRole('radiogroup', { name: 'Pane spine' }).filter({ visible: true }).first();
		await row.scrollIntoViewIfNeeded();
		await expect(row.getByRole('radio', { name: 'Auto' })).toBeChecked();
		await page.screenshot({ path: info.outputPath(`content-slide-${label.replace(/ @/, '-')}.png`) });
	});
}
