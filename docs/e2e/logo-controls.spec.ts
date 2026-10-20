import { expect, test } from '@playwright/test';
import { gotoStudio, openInspectorTab, setEditorContent, waitForStudioPaint } from './studio-fixture';

// Studio → Chrome → Logo: Position writes `logo-at:`, Color writes `logo-color:`, and the
// Position row says which chrome the berth hides. The engine side is covered in
// test/unit/parsing/markdown-it-plugins.test.js; this pins the Inspector's writes.

const DECK = '---\nmarp: true\ntheme: indaco\nlogo: lattice\n---\n\n# Logo controls\n\nBody\n';

test('Logo position and color write front matter', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await waitForStudioPaint(page);
	await setEditorContent(page, DECK);
	await openInspectorTab(page, 'chrome');

	const position = page.getByRole('combobox', { name: 'Choose logo position' });
	await expect(position).toContainText('Default');
	await position.click();
	await page.getByRole('option', { name: 'Bottom center' }).click();
	await expect(page.getByLabel('Deck source')).toContainText('logo-at: bottom-center');
	await expect(page.getByText('Hides the footer text.')).toBeVisible();

	const color = page.getByRole('combobox', { name: 'Choose logo color' });
	await color.click();
	await page.getByRole('option', { name: 'Accent + ink' }).click();
	await expect(page.getByLabel('Deck source')).toContainText('logo-color: "accent 60%, ink"');

	await page.getByRole('textbox', { name: /Color mix/ }).fill('muted');
	await page.keyboard.press('Enter');
	await expect(page.getByLabel('Deck source')).toContainText('logo-color: muted');
	await expect(color).toContainText('Muted');

	await position.click();
	await page.getByRole('option', { name: 'Default (top right)' }).click();
	await expect(page.getByLabel('Deck source')).not.toContainText('logo-at:');

	await page.screenshot({ path: testInfo.outputPath('logo-controls.png') });
});
