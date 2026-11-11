import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openSection, persistedSource, test, typeDeck } from './studio-fixture';

// The Studio's class editor reads the comments the ENGINE reads a directive from (lib/core/meta-record.mjs
// `commentBlocks`, Segno P3): a `_class` comment that an HTML block swallows (`<div>` / `<!-- _class: kpi -->` /
// `</div>`) is part of the `<div>` to the engine, so the slide has no class. Writing a class from Slide settings (Look · Compact spacing) must
// therefore add a comment the engine applies, never splice into the folded one, which would render as nothing.
// Asserted on the persisted source, which is what the engine reads. engineering/decisions/2026-10-22-segno-deck-pipeline.md
// §P3 islands.

const FOLDED = '<div>\n<!-- _class: kpi -->\n</div>\n\n## Folded\n';
const PLAIN = '<!-- _class: kpi -->\n\n## Plain\n';

async function openSlideLook(page: Page): Promise<void> {
	// At 390px the bottom bar's Settings opens both scopes behind a Slide | Deck switch.
	const slideButton = page.getByRole('button', { name: CHROME.slideSettings }).filter({ visible: true });
	if (await slideButton.count()) await slideButton.first().click();
	else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
		await page.getByRole('button', { name: 'Slide scope', exact: true }).filter({ visible: true }).first().click();
	}
	await openSection(page, CHROME.slideTab.look);
}

const compact = (page: Page) => page.getByRole('switch', { name: 'Compact spacing' }).filter({ visible: true }).first();

test('a `_class` folded into a <div> is not the slide\'s class: Compact spacing writes a new record @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, `---\ntitle: Folded\n---\n\n${FOLDED}`);
	await openSlideLook(page);
	await expect(compact(page)).not.toBeChecked();
	await compact(page).click();
	// A new comment the engine reads, above the slide, in the record form (record note step 3); the <div> and the comment
	// inside it are left as written.
	await expect.poll(() => persistedSource(page)).toContain('<!-- {class=compact} -->');
	const src = await persistedSource(page);
	expect(src).toContain('<div>\\n<!-- _class: kpi -->\\n</div>');
	expect(src).not.toContain('kpi compact');
});

test('a plain `_class` is the slide\'s class: Compact spacing extends it @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, `---\ntitle: Plain\n---\n\n${PLAIN}`);
	await openSlideLook(page);
	await expect(compact(page)).not.toBeChecked();
	await compact(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: kpi compact -->');
});

// A RECORD slide (record note step 3): the drawer edits the record in place, keeping its typed fields and every other
// field as written. Before step 3 the drawer refused to write over a record.
const RECORD = '<!-- {layout=kpi, footer="Q3, final"} -->\n\n## Record\n';

test('a record slide: Compact spacing joins the record, keeping its layout and footer @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, `---\ntitle: Record\n---\n\n${RECORD}`);
	await openSlideLook(page);
	await expect(compact(page)).not.toBeChecked();
	await compact(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- {layout=kpi, footer=\\"Q3, final\\", class=compact} -->');
	await expect(compact(page)).toBeChecked();
	await compact(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- {layout=kpi, footer=\\"Q3, final\\"} -->');
});
