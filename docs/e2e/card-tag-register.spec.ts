import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, persistedSource, setEditorContent, test } from './studio-fixture';

// The `tag:` register's two Studio surfaces (engineering/decisions/2026-09-27-card-tag-register.md
// §6 phase 5): the deck Card tags rows in deck settings, and the per-slide Tag rows in Slide
// settings on a tagged layout. Asserted on the persisted source, which is what the engine reads.
// Modeled on backdrop-register.spec.ts.

const DECK = '---\ntitle: Tags\n---\n\n<!-- _class: decision -->\n\n## One\n\n- Build\n  - Own it.\n- Buy\n  - Rent it.\n';

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
});

async function choose(page: Page, label: string, option: string): Promise<void> {
	await page.getByRole('combobox', { name: label }).filter({ visible: true }).first().click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

// Each functional test runs twice: untagged for the Chromium desktop project, and as an
// @webkit-tablet twin for the WebKit project, per playwright.config.ts.
for (const tag of ['', ' @webkit-tablet']) {
	test(`deck settings: the Card tags rows write one \`tag:\` line from four selects${tag}`, async ({ page }) => {
		await openInspector(page);
		await choose(page, 'Tag color', 'Plain');
		await expect.poll(() => persistedSource(page)).toContain('\\ntag: plain\\n');
		await choose(page, 'Tag placement', 'Band');
		await choose(page, 'Tag text', 'Center');
		// The Studio writer quotes a value with a space; the engine unquotes it (resolve-card-tag.js
		// reads through the top-level front-matter scalar), so either spelling is the same register.
		await expect.poll(() => persistedSource(page)).toMatch(/\\ntag: (\\"plain band center\\"|plain band center)\\n/);
		// Every axis back to Auto removes the key rather than writing an empty value.
		for (const label of ['Tag color', 'Tag placement', 'Tag text']) await choose(page, label, "Component's own");
		await expect.poll(() => persistedSource(page)).not.toContain('tag:');
	});

	test(`slide settings: the Tag rows write \`tag-*\` tokens on a tagged slide${tag}`, async ({ page }, info) => {
		await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
		await choose(page, 'Tag placement', 'Bottom corner');
		await expect.poll(() => persistedSource(page)).toContain('decision tag-foot');
		await choose(page, 'Tag size', 'Large');
		await expect.poll(() => persistedSource(page)).toContain('tag-large');
		await page.getByRole('combobox', { name: 'Tag placement' }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath('card-tag-slide-desktop.png') });
	});

	test(`slide settings: no Tag rows on a layout without card tags${tag}`, async ({ page }) => {
		await setEditorContent(page, '---\ntitle: Plain\n---\n\n<!-- _class: content -->\n\n## Prose\n\nBody.\n');
		await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
		await expect(page.getByRole('combobox', { name: 'Tag placement' }).filter({ visible: true })).toHaveCount(0);
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
	test(`@crosswidth the deck Card tags rows at ${label} (${width}px)`, async ({ page }, info) => {
		await setEditorContent(page, DECK.replace('title: Tags', 'title: Tags\ntag: plain band center'));
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		const placement = page.getByRole('combobox', { name: 'Tag placement' }).filter({ visible: true }).first();
		await placement.scrollIntoViewIfNeeded();
		await expect(placement).toContainText('Band');
		await expect(page.getByRole('combobox', { name: 'Tag color' }).filter({ visible: true }).first()).toContainText('Plain');
		await expect(page.getByRole('combobox', { name: 'Tag text' }).filter({ visible: true }).first()).toContainText('Center');
		await page.screenshot({ path: info.outputPath(`card-tag-deck-${label}.png`) });
	});
}
