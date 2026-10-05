import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

// Compose edits a pane slide's panes as fields: each pane opens with a bar holding its component
// picker, and its `###` title reads as a labeled field
// (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2). Driven on the real
// Studio because Compose round-trips Markdown: what matters is the source the picker and the title
// field write, and that the `_pane` markers stay where the author put them.

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: columns ratio-60-40 -->', '', '## Services outgrew licenses.', '',
	'<!-- _pane: bar -->', '### Revenue by line', '', '- Licenses 42', '- Services 47', '',
	'### What changed', '', '- Services crossed licenses', '- Training folded in', '',
].join('\n');

/** The persisted deck source, JSON-decoded (see compose-fenced-code.spec.ts). */
async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

async function openPanes(page: Page): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-pane-bar').first().waitFor();
}

test('@crosswidth each pane opens with its place and a picker naming its component', async ({ page }) => {
	await openPanes(page);
	const bars = page.locator('.cs-pane-bar');
	await expect(bars).toHaveCount(2);
	await expect(bars.nth(0)).toContainText('Left pane');
	await expect(bars.nth(1)).toContainText('Right pane');
	await expect(page.getByLabel('Left pane component')).toHaveValue('bar');
	await expect(page.getByLabel('Right pane component')).toHaveValue('content');
	// The titles are labeled fields, and the marker's own note pill gives way to the bar.
	await expect(page.locator('h3.cs-pane-title')).toHaveCount(2);
	await expect(page.locator('.cs-pane-marker')).toBeHidden();
});

test('@crosswidth the picker writes a marker in place, and a title edit keeps it there', async ({ page }) => {
	await openPanes(page);
	await page.getByLabel('Right pane component').selectOption('list');
	await expect.poll(() => deckSource(page)).toContain('<!-- _pane: list -->\n\n### What changed');
	await page.locator('h3.cs-pane-title').filter({ hasText: 'What changed' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' this year');
	await expect.poll(() => deckSource(page)).toContain('### What changed this year');
	const src = await deckSource(page);
	// Both markers sit above their own pane, never hoisted above the `##`.
	expect(src.indexOf('<!-- _pane: bar -->')).toBeGreaterThan(src.indexOf('## Services outgrew'));
	expect(src.indexOf('<!-- _pane: list -->')).toBeGreaterThan(src.indexOf('- Services 47'));
});
