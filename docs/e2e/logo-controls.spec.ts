import { expect, test } from '@playwright/test';
import { gotoStudio, openInspectorTab, setEditorContent, waitForStudioPaint } from './studio-fixture';

// Studio → Chrome → Logo: Position, Color, Size and Show on all write ONE `logo-finish:` line, and the
// Position row says which chrome the berth hides. The engine side is covered in
// test/unit/parsing/markdown-it-plugins.test.js; this pins the Inspector's writes.

const DECK = '---\nmarp: true\ntheme: indaco\nlogo: lattice\n---\n\n# Logo controls\n\nBody\n';

test('Logo controls write one logo-finish line', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await waitForStudioPaint(page);
	await setEditorContent(page, DECK);
	await openInspectorTab(page, 'chrome');

	const source = page.getByLabel('Deck source');
	const position = page.getByRole('combobox', { name: 'Choose logo position' });
	await expect(position).toContainText('Top right');
	await position.click();
	await page.getByRole('option', { name: 'Bottom center' }).click();
	await expect(source).toContainText('logo-finish: bottom-center');
	await expect(page.getByText('Hides the footer text.')).toBeVisible();

	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	await page.getByRole('option', { name: 'Accent + ink' }).click();
	await expect(source).toContainText('logo-finish: "bottom-center accent-ink"');

	await page.getByRole('combobox', { name: 'Choose logo size' }).click();
	await page.getByRole('option', { name: 'Large' }).click();
	await expect(source).toContainText('logo-finish: "bottom-center accent-ink lg"');

	// Back to defaults: the key goes, so a default deck stays one line shorter.
	await page.getByRole('combobox', { name: 'Choose logo position' }).click();
	await page.getByRole('option', { name: /Top right \(default\)/ }).click();
	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	await page.getByRole('option', { name: /Auto \(default\)/ }).click();
	await page.getByRole('combobox', { name: 'Choose logo size' }).click();
	await page.getByRole('option', { name: /Medium \(default\)/ }).click();
	await expect(source).not.toContainText('logo-finish');

	await page.screenshot({ path: testInfo.outputPath('logo-controls.png') });
});
