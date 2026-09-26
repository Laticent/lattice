import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, persistedSource, setEditorContent, test } from './studio-fixture';

// The `backdrop:` register's two Studio surfaces (engineering/decisions/2026-09-26-backdrop-register.md):
// the deck Backdrop row under Finish, and the per-slide strength + mask rows in Slide settings.
// Asserted on the persisted source, which is what the engine reads.

const DECK = '---\ntitle: Backdrop\nfinish: atrium\n---\n\n# Backdrop\n\n## One\n\nBody.\n';

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
});

// Each functional test runs twice: untagged for the Chromium desktop project, and as an
// @webkit-tablet twin for the WebKit project, which only runs tests carrying that tag (and the
// desktop project skips any title that names @webkit), per playwright.config.ts.
for (const tag of ['', ' @webkit-tablet']) {
	test(`deck settings: the Backdrop row writes one \`backdrop:\` line from its two selects${tag}`, async ({ page }) => {
		await openInspector(page);
		await page.getByRole('combobox', { name: 'Backdrop strength' }).click();
		await page.getByRole('option', { name: '40%' }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nbackdrop: 40\\n');
		await page.getByRole('combobox', { name: 'Backdrop mask' }).click();
		await page.getByRole('option', { name: 'Clear behind' }).click();
		// The Studio writer quotes a value with a space (`backdrop: "40 clear"`); the engine unquotes it
		// (resolve-backdrop.js reads through frontMatterScalar), so either spelling is the same register.
		await expect.poll(() => persistedSource(page)).toMatch(/\\nbackdrop: (\\"40 clear\\"|40 clear)\\n/);
		// Both halves back to Auto removes the key rather than writing an empty value.
		await page.getByRole('combobox', { name: 'Backdrop strength' }).click();
		await page.getByRole('option', { name: "Finish's own" }).click();
		await page.getByRole('combobox', { name: 'Backdrop mask' }).click();
		await page.getByRole('option', { name: "Finish's own" }).click();
		await expect.poll(() => persistedSource(page)).not.toContain('backdrop:');
	});

	test(`deck settings: no Backdrop row without a finish${tag}`, async ({ page }) => {
		await setEditorContent(page, '---\ntitle: Plain\n---\n\n# Plain\n');
		await openInspector(page);
		await expect(page.getByRole('combobox', { name: 'Backdrop strength' })).toHaveCount(0);
	});

	test(`slide settings: strength and mask write \`backdrop-*\` tokens on the slide${tag}`, async ({ page }, info) => {
		await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
		await page.getByRole('radio', { name: '60' }).click();
		await expect.poll(() => persistedSource(page)).toContain('backdrop-60');
		await page.getByRole('combobox', { name: 'Backdrop mask' }).filter({ visible: true }).first().click();
		await page.getByRole('option', { name: 'Window · top right' }).click();
		await expect.poll(() => persistedSource(page)).toContain('backdrop-spot-tr');
		await page.getByRole('radio', { name: '60' }).scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath('backdrop-slide-desktop.png') });
	});
}

// Screenshot evidence at the three shipped widths (QUALITY BAR). Not a golden diff: the shots
// land in test-results for a human to look at.
async function openDeckSettingsAt(page: Page, width: number): Promise<void> {
	if (width >= 1200) return openInspector(page);
	if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth the deck Backdrop row at ${label} (${width}px)`, async ({ page }, info) => {
		await setEditorContent(page, DECK.replace('finish: atrium', 'finish: atrium\nbackdrop: 40 clear'));
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		const strength = page.getByRole('combobox', { name: 'Backdrop strength' }).filter({ visible: true }).first();
		await strength.scrollIntoViewIfNeeded();
		await expect(strength).toContainText('40%');
		await expect(page.getByRole('combobox', { name: 'Backdrop mask' }).filter({ visible: true }).first()).toContainText('Clear behind');
		await page.screenshot({ path: info.outputPath(`backdrop-deck-${label}.png`) });
	});
}
