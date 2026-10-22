import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

// A checklist (`- [x] done`) edits in Compose and a click on its marker chip toggles it.
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

test('@crosswidth a checklist slide is editable and each marker is badged', async ({ page }) => {
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

test('@crosswidth a click on the chip flips [ ] and [x] and changes only those bytes', async ({ page }) => {
	await openChecklist(page);
	await page.locator('.cs-host li .cs-cellmark').nth(1).click(); // `[ ]` → `[x]`
	await expect.poll(() => persistedSource(page)).toContain('- [x] Legal sign-off');
	await page.locator('.cs-host li .cs-cellmark').nth(0).click(); // `[x]` → `[ ]`
	await expect.poll(() => persistedSource(page)).toContain('- [ ] Security review');
	const source = await persistedSource(page);
	for (const line of ['- [!] Pricing', '- [?] Date', '- [-] Docs', '- [/] Translations']) expect(source).toContain(line);
});
