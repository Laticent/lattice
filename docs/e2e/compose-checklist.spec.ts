import { savedDeck } from './compose-insert';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

// A checklist (`- [x] done`) edits in Compose and a click on its marker chip opens the six answers (MarkerPicker.tsx).
// followups.d/2846-p1; engineering/decisions/2026-10-21-compose-point-and-click.md §7.
// Before: any list item led by one of the six markers locked the whole slide read-only.

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: checklist -->', '', '## Launch gates.', '',
	'- [x] Security review', '- [ ] Legal sign-off', '- [!] Pricing', '- [?] Date', '- [-] Docs', '- [/] Translations', '',
].join('\n');

async function openChecklist(page: import('@playwright/test').Page): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
}

test('@crosswidth @gecko @webkit-tablet a checklist slide is editable and each marker is badged', async ({ page }) => {
	await openChecklist(page);
	await expect(page.locator('.cs-host .cs-slide-locked, .cs-host [data-locked="true"]')).toHaveCount(0);
	await expect(page.locator('.cs-host li .cs-cellmark')).toHaveCount(6);
	await page.locator('.cs-host li').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type(' again');
	await expect.poll(() => persistedSource(page)).toContain('- [x] Security review again');
	const source = await persistedSource(page);
	for (const line of ['- [ ] Legal sign-off', '- [!] Pricing', '- [?] Date', '- [-] Docs', '- [/] Translations']) expect(source).toContain(line);
	expect(source).not.toMatch(/\\\[/);
});

test('@crosswidth @gecko @webkit-tablet a click on the chip opens the six answers, and a pick changes only those bytes', async ({ page }) => {
	await openChecklist(page);
	const picker = page.getByRole('menu', { name: 'Item state' });
	// `[!]` (no) used to become `[x]` on one click. Now the click opens the picker on its current answer and writes nothing.
	await page.locator('.cs-host li .cs-cellmark').nth(2).click();
	await expect(picker.getByRole('menuitemradio', { checked: true })).toContainText('No');
	expect(await persistedSource(page)).toContain('- [!] Pricing');
	await picker.getByRole('menuitemradio', { name: /Partly/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('- [-] Pricing');
	await expect(picker).toHaveCount(0);
	// `[ ]` to `[x]` and back, by the picker.
	await page.locator('.cs-host li .cs-cellmark').nth(1).click();
	await picker.getByRole('menuitemradio', { name: /Yes/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('- [x] Legal sign-off');
	await page.locator('.cs-host li .cs-cellmark').nth(0).click();
	await picker.getByRole('menuitemradio', { name: /Open/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('- [ ] Security review');
	const source = await savedDeck(page);
	expect(source.trimEnd()).toBe(DECK.replace('- [x] Security review', '- [ ] Security review').replace('- [ ] Legal sign-off', '- [x] Legal sign-off').replace('- [!] Pricing', '- [-] Pricing').trimEnd());
	// Escape closes the picker and writes nothing.
	await page.locator('.cs-host li .cs-cellmark').nth(3).click();
	await expect(picker).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(picker).toHaveCount(0);
	expect(await savedDeck(page)).toBe(source);
});

const MIXED = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'## A content slide.', '', '- [x] plain bullet', '- [ ] another', '',
	'---', '',
	'<!-- _class: checklist -->', '', '## Launch gates.', '', '- [x] Security review', '- [ ] Legal sign-off', '',
].join('\n');

test('@crosswidth @gecko @webkit-tablet only a slide whose layout draws markers gets chips', async ({ page }) => {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, MIXED);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	// The checklist slide's two items are chips; the content slide's two bullets are plain text, as the slide prints them.
	await expect(page.locator('.cs-host li .cs-cellmark')).toHaveCount(2);
	await expect(page.locator('.cs-slide').nth(0).locator('.cs-cellmark')).toHaveCount(0);
	await expect(page.locator('.cs-slide').nth(1).locator('.cs-cellmark')).toHaveCount(2);
});

// The engine stamps a checklist's top-level items only, and badges a verdict-grid or pricing slide's nested items only;
// it reads every class token, so a modifier before the component still counts (checker finding on #2882).
const DEPTH = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: compact checklist -->', '', '## Gates.', '', '- [x] Top item', '  - [ ] Nested item', '',
	'---', '',
	'<!-- _class: verdict-grid -->', '', '## Verdicts.', '', '- [x] Card title', '  - [x] Nested badge', '',
].join('\n');

test('@crosswidth @gecko @webkit-tablet a chip shows at the depth the slide draws it, and a modifier before the component still counts', async ({ page }) => {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DEPTH);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	const chips = (n: number) => page.locator('.cs-slide').nth(n).locator('li .cs-cellmark');
	// `compact checklist`: the top-level item is a chip, the nested one is text.
	await expect(chips(0)).toHaveCount(1);
	await expect(chips(0).first()).toHaveText('[x]');
	// verdict-grid: the card title is text, the nested item is a chip.
	await expect(chips(1)).toHaveCount(1);
	await expect(page.locator('.cs-slide').nth(1).locator('li li .cs-cellmark')).toHaveCount(1);
});
