import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

// Compose edits a pane slide's panes: each pane opens with a bar naming what it holds, whose
// "Change" opens the slide gallery in pane mode, and its `###` title reads as a labeled field
// (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2). Driven on the real
// Studio because Compose round-trips Markdown: what matters is the source a pick writes, that each
// tile says what the pick will do BEFORE it is made, and that Undo restores what starting fresh
// replaced.

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: columns ratio-60-40 -->', '', '## Services outgrew licenses.', '',
	'<!-- _pane: bar -->', '### Revenue by line', '', '- Licenses `42`', '- Services `47`', '',
	'### What changed', '', '- Services crossed licenses', '- Training folded in', '',
	'> The mix shift is structural.', '',
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

test('@crosswidth each pane opens with its place, what it holds, and its title as a field', async ({ page }) => {
	await openPanes(page);
	const bars = page.locator('.cs-pane-bar');
	await expect(bars).toHaveCount(2);
	await expect(bars.nth(0)).toContainText('Left pane');
	await expect(bars.nth(0)).toContainText('bar');
	await expect(bars.nth(1)).toContainText('Right pane');
	await expect(bars.nth(1)).toContainText('text');
	await expect(page.locator('h3.cs-pane-title')).toHaveCount(2);
	await expect(page.locator('.cs-pane-marker')).toBeHidden();
});

test('@crosswidth the pane gallery says what each pick does, starts fresh with an Undo, and keeps the slide\'s Key Insight', async ({ page }) => {
	await openPanes(page);
	await page.getByRole('button', { name: /^Right pane holds text/ }).click();
	const gallery = page.getByRole('dialog', { name: 'Right pane: what it holds' });
	await expect(gallery).toBeVisible();
	// The outcome is on the tile before the pick: a list keeps the pane's text, a bar chart cannot.
	await expect(gallery.getByRole('button', { name: /^Use list in the right pane — keeps your text/ })).toBeVisible();
	await gallery.getByRole('button', { name: /^Use bar in the right pane — starts with an example/ }).click();
	await expect(gallery).toBeHidden();
	await expect.poll(() => deckSource(page)).toContain('<!-- _pane: bar -->\n\n### What changed\n\n- First `120`');
	const src = await deckSource(page);
	expect(src).toContain('> The mix shift is structural.');
	expect(src).not.toContain('Services crossed licenses');
	// Undo, from the notice, puts the pane's text back.
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => deckSource(page)).toContain('### What changed\n\n- Services crossed licenses');
	expect(await deckSource(page)).not.toContain('- First `120`');
});

test('@crosswidth a pick that keeps the text only names the component, and a title edit stays in place', async ({ page }) => {
	await openPanes(page);
	await page.getByRole('button', { name: /^Right pane holds text/ }).click();
	await page.getByRole('dialog', { name: 'Right pane: what it holds' }).getByRole('button', { name: /^Use list in the right pane/ }).click();
	await expect.poll(() => deckSource(page)).toContain('<!-- _pane: list -->\n\n### What changed\n\n- Services crossed licenses');
	await page.locator('h3.cs-pane-title').filter({ hasText: 'What changed' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' this year');
	await expect.poll(() => deckSource(page)).toContain('### What changed this year');
	const src = await deckSource(page);
	expect(src.indexOf('<!-- _pane: bar -->')).toBeGreaterThan(src.indexOf('## Services outgrew'));
});
